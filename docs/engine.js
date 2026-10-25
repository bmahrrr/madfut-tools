// Shared game logic for the website: chemistry, boosts, effective stats and the exact My Club solver.
"use strict";
const AUTO = new Set(["icon", "debut_icon", "hero", "hall_of_fut"]);
const ICON = new Set(["icon", "debut_icon"]);
const CHEM_BONUS = { 0: -3, 1: 0, 2: 1, 3: 2 };
const CTRL = new Set(["LM", "LW", "RM", "RW", "CAM", "CM", "CDM", "LB", "RB"]);
const ATT = new Set(["ST", "CAM", "LW", "LM", "RW", "RM", "CF"]);   // Sim attackers (full-backs never attack)
const DEF = new Set(["LB", "RB", "CDM", "CB", "GK"]);

function cardType(c) { return String(c.color).replace("rare_", ""); }

const SOLO = x => x.specialChem === "solo";      // always full chem, adds nothing to anyone else (e.g. Evo Jones)
const AUTOX = x => AUTO.has(x.color) || x.specialChem === "auto";   // also Heroes-club cards that aren't Heroes (SBC Premium Sara): full chem, +1 nation, +1 league
function chem(team) {
  const nat = new Map(), lg = new Map(), club = new Map();
  let icons = 0;
  const inc = (m, k, v = 1) => m.set(k, (m.get(k) || 0) + v);
  for (const x of team) {
    if (SOLO(x)) continue;
    inc(nat, x.nationId);
    if (!AUTOX(x)) inc(club, x.clubId);
    if (ICON.has(x.color)) { icons++; continue; }
    inc(lg, x.leagueId, x.specialChem === "league2" ? 2 : 1);
  }
  return team.map(x => {
    if (AUTOX(x) || SOLO(x)) return 3;
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
    const met = (b.min != null || b.max != null) && !(b.min != null && n < b.min) && !(b.max != null && n > b.max);   // "max": at most (e.g. Max 3 clubs)
    if (met) { out[0] += b.att || 0; out[1] += b.ctl || 0; out[2] += b.def || 0; }
  }
  return out;
}

// returns [{a,c,d,t,chem}]: in-game stats after boosts + chem, and tiebreak total (card total + chem)
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
    // dom[i]: cards no better than card i in every stat and tiebreak total (exact copies count once).
    // When several answers give the same duel result, the weakest is always at least as good: the rest are skipped.
    const doms = (S, T) => S.map((_, i) => S.reduce((m, _, j) => {
      if (j === i) return m;
      const le = S[j][0] <= S[i][0] && S[j][1] <= S[i][1] && S[j][2] <= S[i][2] && T[j] <= T[i];
      const eq = S[j][0] === S[i][0] && S[j][1] === S[i][1] && S[j][2] === S[i][2] && T[j] === T[i];
      return le && (!eq || j < i) ? m | (1 << j) : m;
    }, 0));
    this.domA = doms(this.SA, this.TA); this.domB = doms(this.SB, this.TB);
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
        let ok = true; const rr = [], same = [0, 0, 0];
        for (let j = 0; j < 11; j++) if (mb >> j & 1) { rr[j] = this.duel(i, j, s, true); same[rr[j] + 1] |= 1 << j; }
        for (let pass = 0; pass < 2 && ok; pass++) for (const j of this.byTB) {
          if (!(mb >> j & 1)) continue;
          const r = rr[j]; if ((pass === 0) !== (r < 0)) continue;
          if (this.domB[j] & same[r + 1]) continue;
          if (!this.win(ma & ~(1 << i), mb & ~(1 << j), d + r, thr)) { ok = false; break; }
        }
        if (ok) { res = true; break outer; }
      }
    } else {
      res = true;
      outer2: for (let s = 0; s < 3; s++) for (const j of this.ordB[s]) {
        if (!(mb >> j & 1)) continue;
        let ok = false; const rr = [], same = [0, 0, 0];
        for (let i = 0; i < 11; i++) if (ma >> i & 1) { rr[i] = this.duel(i, j, s, false); same[rr[i] + 1] |= 1 << i; }
        for (let pass = 0; pass < 2 && !ok; pass++) for (const i of this.byTA) {
          if (!(ma >> i & 1)) continue;
          const r = rr[i]; if ((pass === 0) !== (r > 0)) continue;
          if (this.domA[i] & same[r + 1]) continue;
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
  // Only win / draw / loss (as level 3 / 2 / 0): at most two searches instead of four. Used live in Match Helper.
  outcome(ma = 2047, mb = 2047, d = 0) {
    if (!this.win(ma, mb, d, 0)) return 0;
    return this.win(ma, mb, d, 1) ? 3 : 2;
  }
}
function popcount(x) { x -= (x >> 1) & 0x55555555; x = (x & 0x33333333) + ((x >> 2) & 0x33333333); return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
const LEVEL_NAME = l => (l >= 3 ? "WIN" : l === 2 ? "DRAW" : "LOSS");

// ---------------- Sim head-to-head ----------------
// One possession: random control card vs random control card; the winner's random attacker
// vs the loser's random defender. Ties: random choice of attack / defence / total comparison.
// Each possession 3 control cards are picked; the attack needs 3 cards not picked for control. With fewer than 3
// natural attackers left (always in 5-3-2) the game fills in by MAIN position: CM first, then CDM, ... (same as fatal/sim.py)
const FILL = [["ST", "CF"], ["LW", "RW"], ["CAM"], ["LM", "RM"], ["CM"], ["CDM"], ["LB", "RB"], ["CB"], ["GK"]];
function attackWeights(R) {
  const n = R.length, N = [], C = [];
  R.forEach((r, i) => { if (ATT.has(r.slot)) N.push(i); if (CTRL.has(r.slot)) C.push(i); });
  const picks = [];
  if (C.length < 3) picks.push(C.slice());
  else for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) for (let c = b + 1; c < C.length; c++) picks.push([C[a], C[b], C[c]]);
  const w = new Array(n).fill(0);
  for (const P of picks) {
    const avail = N.filter(i => !P.includes(i));
    if (avail.length >= 3) { avail.forEach(i => w[i] += 1 / avail.length); continue; }
    avail.forEach(i => w[i] += 1 / 3);
    let need = 3 - avail.length;
    const rest = [...Array(n).keys()].filter(i => !P.includes(i) && !avail.includes(i));
    for (const lvl of FILL) {
      if (need <= 0) break;
      const g = rest.filter(i => lvl.includes(R[i].pos || R[i].slot)); if (!g.length) continue;
      const take = Math.min(need, g.length); g.forEach(i => w[i] += take / g.length / 3); need -= take;
    }
  }
  return w.map(x => x / picks.length);
}
function simMatch(R1, R2) {      // R = [{slot, pos (card's main position), a, c, d, t}]
  const cmpv = (x, y) => (x > y ? 1 : x === y ? 0.5 : 0);
  const tieBreak = (x, y) => (cmpv(x.a, y.a) + cmpv(x.d, y.d) + cmpv(x.a + x.c + x.d, y.a + y.c + y.d)) / 3;
  const C1 = R1.filter(r => CTRL.has(r.slot)), C2 = R2.filter(r => CTRL.has(r.slot));
  const W1 = attackWeights(R1), W2 = attackWeights(R2);
  const D1 = R1.filter(r => DEF.has(r.slot)), D2 = R2.filter(r => DEF.has(r.slot));
  let pc = 0;
  for (const x of C1) for (const y of C2) pc += x.c !== y.c ? (x.c > y.c ? 1 : 0) : tieBreak(x, y);
  pc /= C1.length * C2.length;
  const pa = (R, W, D) => { let s = 0; R.forEach((x, i) => { if (!W[i]) return; let t = 0; for (const y of D) t += x.a !== y.d ? (x.a > y.d ? 1 : 0) : tieBreak(x, y); s += W[i] * t / D.length; }); return s; };
  return { control: pc, scoreA: pc * pa(R1, W1, D2), scoreB: (1 - pc) * pa(R2, W2, D1) };
}
