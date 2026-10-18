// Game plan for each built My Club team: which opening leads keep the team's guaranteed result against
// every opponent it was tested on (exact solver, perfect play), plus cards to watch and the tiebreak.
//   node scripts/plan.js docs/results/myclub_73.json [more files...]   -> adds a "plan" field to each file
//   node scripts/plan.js --watch-only FILES...                           -> only redo the Cards to Watch notes
"use strict";
const fs = require("fs"), path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "docs", "engine.js"), "utf8").replace(/"use strict";/, "") + ";globalThis.Solver=Solver;globalThis.boosted=boosted;");
const STAT = ["attack", "control", "defence"];
const eff = ps => ps.map(p => ({ a: p.eff[0], c: p.eff[1], d: p.eff[2], t: p.tiebreak }));

// every card in the game (for "who can beat this card" notes)
const ROOT = path.join(__dirname, "..", "docs");
const CD = JSON.parse(fs.readFileSync(path.join(ROOT, "cards.json"), "utf8"));
let ALL = CD.cards.map(r => { const c = {}; CD.fields.forEach((f, i) => c[f] = r[i]); return c; });
try { ALL = ALL.concat(JSON.parse(fs.readFileSync(path.join(ROOT, "results", "extras.json"), "utf8")).cards || []); } catch (e) {}

// Matchup notes: for each card's attack / control / defence, every card under the cap that could beat it in that duel
// (attack vs defence, control vs control) at its best - boosts, full chem and every squad bonus. 0 = nothing in the
// series beats it; 1-2 = only those cards do. Ties on value go to the higher tiebreak total.
function matchups(t, series) {
  const cap = series.cap || 99, bon = [0, 0, 0];
  for (const b of series.bonuses || []) { bon[0] += b.att || 0; bon[1] += b.ctl || 0; bon[2] += b.def || 0; }
  const pool = ALL.filter(c => c.rating <= cap).map(c => { const [a, k, d] = boosted(c, series.boosts); return { name: c.name, rating: c.rating, v: [a + 2 + bon[0], k + 2 + bon[1], d + 2 + bon[2]], t: c.attack + c.control + c.defense + 6 }; });
  const CTR = [2, 1, 0], out = [];
  const label = x => `${x.name} ${x.rating}`;
  for (const p of t.players) {
    for (const s of [0, 2, 1]) {
      const v = p.eff[s], cs = CTR[s];
      if (s !== 1 && v < Math.max(p.eff[0], p.eff[2])) continue;          // attack / defence: only the card's main one
      const beat = new Map(), tie = new Map();
      for (const x of pool) {
        if (x.v[cs] > v || (x.v[cs] === v && x.t > p.tiebreak)) beat.set(x.name, x);
        else if (x.v[cs] === v && x.t === p.tiebreak && x.name !== p.name) tie.set(x.name, x);
      }
      const B = [...beat.values()].sort((a, b) => b.v[cs] - a.v[cs]);
      const what = `${STAT[s]} ${v}`;
      const info = { s, v, beat: B.slice(0, 2).map(x => ({ name: x.name, rating: x.rating, v: x.v[cs], tie: x.v[cs] === v })), ties: [...tie.keys()].slice(0, 2) };
      if (!B.length) out.push({ ...info, name: p.name, rank: 0, text: `Unbeatable ${what}: no card in the series wins that duel${tie.size ? ` (${[...tie.keys()].slice(0, 2).join(", ")} can tie)` : ""}.` });
      else if (B.length <= 2) out.push({ ...info, name: p.name, rank: B.length, text: `${what[0].toUpperCase() + what.slice(1)} only loses to ${B.map(x => `${label(x)} (${STAT[cs]} ${x.v[cs]}${x.v[cs] === v ? ", wins the tie on total" : ""})`).join(" and ")}.` });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function plan(t, series) {
  const A = eff(t.players), opps = Object.entries(t.opponent_teams || {});
  if (!opps.length) return null;
  const worst = Array(33).fill(9), worstRef = Array(33).fill(9);
  let G = 9, GRef = 9;
  for (const [name, o] of opps) {
    const B = eff(o.players), S = new Solver(A, B, 0), isRef = name.startsWith("reference");
    const g = S.level(); G = Math.min(G, g); if (isRef) GRef = Math.min(GRef, g);
    for (let i = 0; i < 11; i++) for (let s = 0; s < 3; s++) {
      let w = 9;
      for (let j = 0; j < 11 && w > 0; j++) w = Math.min(w, S.level(2047 & ~(1 << i), 2047 & ~(1 << j), S.duel(i, j, s, true)));
      worst[i * 3 + s] = Math.min(worst[i * 3 + s], w); if (isRef) worstRef[i * 3 + s] = Math.min(worstRef[i * 3 + s], w);
    }
  }
  const pick = (W, g) => W.map((w, k) => ({ w, k })).filter(x => x.w >= g).map(x => ({ slot: t.players[Math.floor(x.k / 3)].slot, name: t.players[Math.floor(x.k / 3)].name, stat: STAT[x.k % 3] }));
  const watch = matchups(t, series);
  const byTB = [...t.players].sort((a, b) => a.tiebreak - b.tiebreak);
  const lv = ["LOSS", "LOSS", "DRAW", "WIN", "WIN"];
  return {
    guaranteed: lv[G], safe: pick(worst, G), total_openers: 33,
    reddit: opps.some(([n]) => n.startsWith("reference")) ? { guaranteed: lv[GRef], safe: pick(worstRef, GRef) } : null,
    watch, low_tb: { name: byTB[0].name, tb: byTB[0].tiebreak }, high_tb: { name: byTB[10].name, tb: byTB[10].tiebreak },
  };
}
function weakNotes(t) {
  const out = [];
  t.players.forEach(p => {
    const e = p.eff, weak = [0, 1, 2].filter(s => e[s] < 55), best = [0, 1, 2].sort((x, y) => e[y] - e[x])[0];
    if (weak.length === 2) out.push({ name: p.name, text: `Only use for ${STAT[best]} (${e[best]}); ${weak.map(s => `${STAT[s]} ${e[s]}`).join(", ")}` });
    else if (weak.length === 1) out.push({ name: p.name, text: `Never use for ${STAT[weak[0]]} (${e[weak[0]]})` });
  });
  return out;
}
const watchOnly = process.argv[2] === "--watch-only";
for (const f of process.argv.slice(watchOnly ? 3 : 2)) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!d.team || !d.team.opponent_teams) { console.log("skip", f); continue; }
  if (watchOnly) {
    if (!d.team.plan) { console.log("no plan yet", f); continue; }
    d.team.plan.watch = matchups(d.team, d.series || {});
    fs.writeFileSync(f, JSON.stringify(d, null, 1)); console.log(f, d.team.plan.watch.length, "notes"); continue;
  }
  const t0 = Date.now(); d.team.plan = plan(d.team, d.series || {});
  fs.writeFileSync(f, JSON.stringify(d, null, 1));
  console.log(f, ((Date.now() - t0) / 1000).toFixed(1) + "s", d.team.plan.guaranteed, d.team.plan.safe.length + " safe openers");
}
