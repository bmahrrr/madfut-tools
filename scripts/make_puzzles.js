// Makes docs/puzzles.json: sets of chem puzzles at 4 difficulties, each checked solvable with the SBC solver.
//   node scripts/make_puzzles.js [sets per difficulty, default 2] [puzzles per set, default 15] [only tier]
// A puzzle: a formation, locked cards in fixed spots (from different leagues and nations, so they're awkward to
// link), a chem target that rises through the set, a bonus (each card from a league / nation / club) and a bonus for
// no Icons or Heroes. Locked cards go where the solver put them in a squad that reaches the target, so every puzzle
// has at least one answer. Seeded, so the same settings give the same puzzles.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const D = path.join(__dirname, "..", "docs") + "/";
const SETS = +(process.argv[2] || 2), PER = +(process.argv[3] || 15), ONLY = process.argv[4] || "", OUT = process.env.PZ_OUT || D + "puzzles.json";

vm.runInThisContext(fs.readFileSync(D + "sbc-solver.js", "utf8"));
vm.runInThisContext(fs.readFileSync(D + "puzzle-core.js", "utf8"));
const Module = (() => { const src = fs.readFileSync(D + "vendor/highs.js", "utf8") + "\nmodule.exports = Module;";
  const m = { exports: {} }; new Function("module", "exports", "require", "__dirname", "__filename", src)(m, m.exports, require, D + "vendor", D + "vendor/highs.js"); return m.exports; })();

const d = JSON.parse(fs.readFileSync(D + "cards.json", "utf8")), FORMS = JSON.parse(fs.readFileSync(D + "formations.json", "utf8"));
const names = JSON.parse(fs.readFileSync(D + "names.json", "utf8"));
const cards = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
cards.forEach(c => { c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)]); });

let seed = 20261117;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = L => L[Math.floor(rnd() * L.length)];

const TIER = {
  easy:   { locks: 2, t0: 24, t1: 30, pts: 100, step: 10, each: 20, noIcon: 50 },
  medium: { locks: 3, t0: 28, t1: 32, pts: 200, step: 15, each: 30, noIcon: 100, reverse: true },
  hard:   { locks: 4, t0: 31, t1: 33, pts: 350, step: 20, each: 40, noIcon: 150, reverse: true },
  expert: { locks: 5, t0: 33, t1: 33, pts: 500, step: 25, each: 50, noIcon: 250, reverse: true },
};
// each set's name (puzzle and set ids stay the same, so leaderboards aren't affected by a rename)
const SET_NAMES = { easy: ["Kick Off", "Sunday League", "Pre-Season", "Warm Up", "Five-a-Side"], medium: ["Derby Day", "Cup Run", "Midweek Lights", "Transfer Window", "Extra Time"],
  hard: ["Title Race", "Away Days", "Deadline Day", "Relegation Battle", "Penalty Shootout"], expert: ["Final Whistle", "Invincibles", "The Treble", "Hall of Fame", "Golden Boot"] };
const FORMATIONS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-2-1-2", "3-4-3", "4-4-1-1", "5-3-2", "4-3-2-1", "3-4-1-2", "4-5-1", "4-2-2-2", "5-2-1-2", "3-1-4-2"].filter(f => FORMS[f]);

// cards that can be locked: real players people know, gold or special, not Icons / Heroes, rated 70 to 86
const lockPool = cards.filter(c => !pzNoSBC(c) && !SBC_AUTO.has(c.color) && c.rating >= 70 && c.rating <= 86);
const big = new Map(); lockPool.forEach(c => big.set(c.leagueId, (big.get(c.leagueId) || 0) + 1));
const bigLeagues = [...big].filter(([, n]) => n >= 150).map(([l]) => l);

function chooseLocks(n, slots) {
  for (let tries = 0; tries < 200; tries++) {
    const got = [], used = new Set(), lg = new Set(), nat = new Set(), keys = new Set();
    for (let k = 0; k < 400 && got.length < n; k++) {
      const c = pick(lockPool);
      if (lg.has(c.leagueId) || nat.has(c.nationId) || keys.has(playerKey(c))) continue;   // awkward: no shared league or nation
      if (!bigLeagues.includes(c.leagueId) && rnd() < .6) continue;                          // mostly leagues with plenty of links
      const free = slots.map((s, i) => i).filter(i => !used.has(i) && c.P.has(slots[i]));
      if (!free.length) continue;
      const i = pick(free); used.add(i); lg.add(c.leagueId); nat.add(c.nationId); keys.add(playerKey(c)); got.push(c);
    }
    if (got.length === n) return got;
  }
  return null;
}

(async () => {
  const highs = await Module({ locateFile: f => D + "vendor/" + f });
  const out = fs.existsSync(OUT) && ONLY ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { sets: [] };
  if (ONLY) out.sets = out.sets.filter(s => s.tier !== ONLY);
  for (const [tier, T] of Object.entries(TIER)) {
    if (ONLY && tier !== ONLY) continue;
    seed = 20261117 + tier.length * 7919;
    for (let si = 1; si <= SETS; si++) {
      const set = { id: `${tier}-${si}`, tier, name: (SET_NAMES[tier] || [])[si - 1] || `${PZ_TIERS[tier].name} ${si}`, puzzles: [] };
      while (set.puzzles.length < PER) {
        const n = set.puzzles.length + 1, f = pick(FORMATIONS), slots = FORMS[f];
        const target = Math.round(T.t0 + (T.t1 - T.t0) * (n - 1) / Math.max(1, PER - 1));
        const t0 = Date.now();
        let locks, r;
        if (!T.reverse) {      // Easy / Medium: pick awkward locked cards, then check a squad exists around them
          locks = chooseLocks(T.locks, slots);
          if (!locks) continue;
          const req = { formation: f, priority: "gold_first", allow_specials: true, allow_icons: true, rules: [], include: locks.map(c => c.id), exclude: [], min_chem: target };
          try { r = solveSBC(highs, req, cards, FORMS, () => {}, 12, {}, () => {}); } catch (e) { r = { none: true }; }
          if (!r || r.none || !r.players || r.chem < target) { process.stderr.write("."); continue; }
        } else {               // Hard / Expert: build a varied squad that hits the target with no Icons, then lock its most awkward cards
          const L = bigLeagues.slice().sort(() => rnd() - .5), rules = [{ on: "league", id: L[0], op: ">=", n: 1 }, { on: "league", id: L[1], op: ">=", n: 1 }];
          if (rnd() < .6) rules.push({ on: "league", id: L[2], op: ">=", n: 1 });
          const req = { formation: f, priority: "gold_first", allow_specials: true, allow_icons: false, rules, include: [], exclude: [], min_chem: target, min_nations: 4 + Math.floor(rnd() * 3), min_leagues: rules.length };
          try { r = solveSBC(highs, req, cards, FORMS, () => {}, 12, {}, () => {}); } catch (e) { r = { none: true }; }
          if (!r || r.none || !r.players || r.chem < target) { process.stderr.write("."); continue; }
          const sq = r.players.map(p => cards.find(c => c.id === p.id)), cnt = (k, v) => sq.filter(c => c[k] === v).length;
          // awkward = few teammates share its league / nation / club
          const aw = c => cnt("leagueId", c.leagueId) + cnt("nationId", c.nationId) + cnt("clubId", c.clubId) + rnd();
          const order = sq.filter(c => c.position !== "GK" || rnd() < .5).sort((a, b) => aw(a) - aw(b)), got = [], lg = new Set();
          for (const c of order) { if (got.length >= T.locks) break; if (lg.has(c.leagueId) && rnd() < .7) continue; got.push(c); lg.add(c.leagueId); }
          for (const c of order) { if (got.length >= T.locks) break; if (!got.includes(c)) got.push(c); }
          locks = got;
        }
        // where the solver put each locked card
        const at = new Map(); r.players.forEach((p, k) => at.set(p.id, k));
        if (r.players.some((p, k) => p.slot !== slots[k])) { process.stderr.write("?"); continue; }
        const locked = locks.map(c => ({ i: at.get(c.id), id: c.id })).sort((a, b) => a.i - b.i);
        if (locked.some(l => l.i == null)) continue;
        // bonus: cards from the league / nation of one locked card, or a big league
        const lc = pick(locks), kind = pick(["league", "league", "nation", "club"]);
        const id = kind === "league" ? (rnd() < .5 ? lc.leagueId : pick(bigLeagues)) : kind === "nation" ? lc.nationId : lc.clubId;
        const label = (kind === "league" ? names.leagues : kind === "nation" ? names.nations : names.clubs)[String(id)] || "?";
        const pz = { id: `${set.id}-${String(n).padStart(2, "0")}`, n, formation: f, target, locked,
          bonus: { on: kind, id, each: kind === "club" ? T.each * 2 : T.each, label }, noIcon: T.noIcon, pts: T.pts + T.step * (n - 1) };
        // the solver's squad has to pass the site's own scoring too
        const team = r.players.map(p => cards.find(c => c.id === p.id));
        const sc = pzScore(pz, slots, team);
        if (!sc.ok) { process.stderr.write("x"); continue; }
        set.puzzles.push(pz);
        console.log(`${pz.id} ${f} target ${target} locks ${locks.map(c => c.name).join(", ")} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      }
      out.sets.push(set);
    }
  }
  const order = Object.keys(TIER);
  out.sets.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  out.made = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("wrote", out.sets.length, "sets,", out.sets.reduce((a, s) => a + s.puzzles.length, 0), "puzzles");
})();
