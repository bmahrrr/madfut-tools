// Shared game logic for the website: chemistry, boosts, effective stats and the exact My Club solver.
"use strict";
const AUTO = new Set(["icon", "debut_icon", "hero", "hall_of_fut"]);
const ICON = new Set(["icon", "debut_icon"]);
const CHEM_BONUS = { 0: -3, 1: 0, 2: 1, 3: 2 };
const CTRL = new Set(["LM", "LW", "RM", "RW", "CAM", "CM", "CDM", "LB", "RB"]);
const ATT = new Set(["ST", "CAM", "LW", "LM", "RW", "RM", "CF"]);
const DEF = new Set(["LB", "RB", "CDM", "CB", "GK"]);

function cardType(c) { return String(c.color).replace("rare_", ""); }

const SOLO = x => x.specialChem === "solo";      // always full chem, adds nothing to anyone else (e.g. Evo Jones)
function chem(team) {
  const nat = new Map(), lg = new Map(), club = new Map();
  let icons = 0;
  const inc = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v);
  for (const x of team) {
    if (SOLO(x)) continue;
    inc(nat, x.nationId);
    if (!AUTO.has(x.color)) inc(club, x.clubId);
    if (ICON.has(x.color)) { icons++; continue; }
    inc(lg, x.leagueId, x.specialChem === "league2" ? 2 : 1);
  }
  return team.map(x => {
    if (AUTO.has(x.color) || SOLO(x)) return 3;
    const n = nat.get(x.nationId) || 0, l = (lg.get(x.leagueId) || 0) + icons, k = club.get(x.clubId) || 0;
    const p = (n >= 8 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0) + (l >= 8 ? 3 : l >= 5 ? 2 : l >= 3 ? 1 : 0) + (k >= 7 ? 3 : k >= 4 ? 2 : k >= 2 ? 1 : 0);
    return Math.min(3, p);
  });
}

const KEYMAP = { nation: "nationId", league: "leagueId", club: "clubId", color: "color", type: "color" };
function boosted(c, boosts) {
  let a = c.attack, k = c.control, d = c.defense;
  for (const b of boosts || []) {
    const key = KEYMAP[b.on]; const v = c[key];
    const match = key === "color" ? String(v).replace("rare_", "") === String(b.id).replace("rare_", "") : v === b.id;
    if (match) { a += b.att || 0; k += b.ctl || 0; d += b.def || 0; }
  }
  return [a, k, d];
}

function squadBonus(team, bonuses) {
  const out = [0, 0, 0];
  for (const b of bonuses || []) {
    let n = 0;
    if (b.kind === "nations") n = new Set(team.map(x => x.nationId)).size;
    else if (b.kind === "clubs") n = new Set(team.map(x => x.clubId)).size;
    else if (b.kind === "leagues") n = new Set(team.map(x => x.leagueId)).size;
    else if (b.kind === "types") n = new Set(team.map(cardType)).size;
    if (n >= b.min) { out[0] += b.att || 0; out[1] += b.ctl || 0; out[2] += b.def || 0; }
  }
  return out;
}

// returns [{a,c,d,t,chem}] — in-game stats after boosts + chem, and tiebreak total (card total + chem)
function effective(team, series, fullChem = false) {
  const ch = fullChem ? team.map(() => 3) : chem(team);
  const sb = squadBonus(team, series && series.bonuses);
  return team.map((x, i) => {
    const [a, k, d] = boosted(x, series && series.boosts);
    const b = CHEM_BONUS[ch[i]];
    return { a: a + b + sb[0], c: k + b + sb[1], d: d + b + sb[2], t: x.attack + x.control + x.defense + 3 * b, chem: ch[i] };
  });
}

// ---------------- exact My Club game solver ----------------
// Same rules and algorithm as fatal/game.c (perfect play, both sides).
class Solver {
  constructor(A, B, first) {      // A, B: arrays of 11 {a,c,d,t}; first: 0 = A leads first
    this.SA = A.map(e => [e.a, e.c, e.d]); this.SB = B.map(e => [e.a, e.c, e.d]);
    this.TA = A.map(e => e.t); this.TB = B.map(e => e.t);
    this.first = first; this.memo = [new Map(), new Map(), new Map(), new Map()];
    const ordFor = (S, T) => [0, 1, 2].map(s => [...Array(11).keys()].sort((x, y) => (S[y][s] - S[x][s]) || (T[y] - T[x])));
    this.ordA = ordFor(this.SA, this.TA); this.ordB = ordFor(this.SB, this.TB);
    this.byTA = [...Array(11).keys()].sort((x, y) => this.TA[x] - this.TA[y]);
    this.byTB = [...Array(11).keys()].sort((x, y) => this.TB[x] - this.TB[y]);
  }
  duel(ai, bi, s, aLeads) {
    const ctr = [2, 1, 0];
    let va, vb;
    if (aLeads) { va = this.SA[ai][s]; vb = this.SB[bi][ctr[s]]; } else { vb = this.SB[bi][s]; va = this.SA[ai][ctr[s]]; }
    if (va !== vb) return va > vb ? 1 : -1;
    return this.TA[ai] > this.TB[bi] ? 1 : this.TA[ai] < this.TB[bi] ? -1 : 0;
  }
  win(ma, mb, d, thr) {
    const k = popcount(ma);
    if (k === 1) {
      const ai = 31 - Math.clz32(ma), bi = 31 - Math.clz32(mb); let D = d;
      if (D >= -1 && D <= 1) { const t = this.TA[ai] - this.TB[bi]; if (t > 5) D++; else if (t < -5) D--; }
      return D >= thr;
    }
    const rem = k - 1;
    if (d - rem - 1 >= thr) return true;
    if (d + rem + 1 < thr) return false;
    const memo = this.memo[thr + 1], key = (ma * 2048 + mb) * 23 + (d + 11);
    const m = memo.get(key); if (m !== undefined) return m;
    const n = 11 - k, aLeads = (n % 2 === 0) === (this.first === 0);
    let res;
    if (aLeads) {
      res = false;
      outer: for (let s = 0; s < 3; s++) for (const i of this.ordA[s]) {
        if (!(ma >> i & 1)) continue;
        let ok = true;
        for (let pass = 0; pass < 2 && ok; pass++) for (const j of this.byTB) {
          if (!(mb >> j & 1)) continue;
          const r = this.duel(i, j, s, true); if ((pass === 0) !== (r < 0)) continue;
          if (!this.win(ma & ~(1 << i), mb & ~(1 << j), d + r, thr)) { ok = false; break; }
        }
        if (ok) { res = true; break outer; }
      }
    } else {
      res = true;
      outer2: for (let s = 0; s < 3; s++) for (const j of this.ordB[s]) {
        if (!(mb >> j & 1)) continue;
        let ok = false;
        for (let pass = 0; pass < 2 && !ok; pass++) for (const i of this.byTA) {
          if (!(ma >> i & 1)) continue;
          const r = this.duel(i, j, s, false); if ((pass === 0) !== (r > 0)) continue;
          if (this.win(ma & ~(1 << i), mb & ~(1 << j), d + r, thr)) { ok = true; break; }
        }
        if (!ok) { res = false; break outer2; }
      }
    }
    memo.set(key, res); return res;
  }
  // 0 lose by 2+, 1 lose by 1, 2 draw, 3 win by 1, 4 win by 2+
  level(ma = 2047, mb = 2047, d = 0) {
    let l = 0;
    for (let t = -1; t <= 2; t++) { if (this.win(ma, mb, d, t)) l++; else break; }
    return l;
  }
}
function popcount(x) { x -= (x >> 1) & 0x55555555; x = (x & 0x33333333) + ((x >> 2) & 0x33333333); return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
const LEVEL_NAME = l => (l >= 3 ? "WIN" : l === 2 ? "DRAW" : "LOSS");

// ---------------- Sim head-to-head ----------------
// One possession: random control card vs random control card; the winner's random attacker
// vs the loser's random defender. Ties: random choice of attack / defence / total comparison.
function simMatch(R1, R2) {      // R = [{slot, a, c, d, t}]
  const cmpv = (x, y) => (x > y ? 1 : x === y ? 0.5 : 0);
  const tieBreak = (x, y) => (cmpv(x.a, y.a) + cmpv(x.d, y.d) + cmpv(x.a + x.c + x.d, y.a + y.c + y.d)) / 3;
  const C1 = R1.filter(r => CTRL.has(r.slot)), C2 = R2.filter(r => CTRL.has(r.slot));
  const A1 = R1.filter(r => ATT.has(r.slot)), A2 = R2.filter(r => ATT.has(r.slot));
  const D1 = R1.filter(r => DEF.has(r.slot)), D2 = R2.filter(r => DEF.has(r.slot));
  let pc = 0;
  for (const x of C1) for (const y of C2) pc += x.c !== y.c ? (x.c > y.c ? 1 : 0) : tieBreak(x, y);
  pc /= C1.length * C2.length;
  const pa = (A, D) => { let s = 0; for (const x of A) for (const y of D) s += x.a !== y.d ? (x.a > y.d ? 1 : 0) : tieBreak(x, y); return s / (A.length * D.length); };
  return { control: pc, scoreA: pc * pa(A1, D2), scoreB: (1 - pc) * pa(A2, D1) };
}
