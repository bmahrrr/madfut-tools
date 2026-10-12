// Game plan for each built My Club team: which opening leads keep the team's guaranteed result against
// every opponent it was tested on (exact solver, perfect play), plus cards to watch and the tiebreak.
//   node scripts/plan.js docs/results/myclub_73.json [more files...]   -> adds a "plan" field to each file
"use strict";
const fs = require("fs"), path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "docs", "engine.js"), "utf8").replace(/"use strict";/, "") + ";globalThis.Solver=Solver;");
const STAT = ["attack", "control", "defence"];
const eff = ps => ps.map(p => ({ a: p.eff[0], c: p.eff[1], d: p.eff[2], t: p.tiebreak }));

function plan(t) {
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
  const watch = [];
  t.players.forEach(p => {
    const e = p.eff, weak = [0, 1, 2].filter(s => e[s] < 55), best = [0, 1, 2].sort((x, y) => e[y] - e[x])[0];
    if (weak.length === 2) watch.push({ name: p.name, text: `Only use for ${STAT[best]} (${e[best]}); ${weak.map(s => `${STAT[s]} ${e[s]}`).join(", ")}` });
    else if (weak.length === 1) watch.push({ name: p.name, text: `Never use for ${STAT[weak[0]]} (${e[weak[0]]})` });
  });
  const byTB = [...t.players].sort((a, b) => a.tiebreak - b.tiebreak);
  const lv = ["LOSS", "LOSS", "DRAW", "WIN", "WIN"];
  return {
    guaranteed: lv[G], safe: pick(worst, G), total_openers: 33,
    reddit: opps.some(([n]) => n.startsWith("reference")) ? { guaranteed: lv[GRef], safe: pick(worstRef, GRef) } : null,
    watch, low_tb: { name: byTB[0].name, tb: byTB[0].tiebreak }, high_tb: { name: byTB[10].name, tb: byTB[10].tiebreak },
  };
}
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!d.team || !d.team.opponent_teams) { console.log("skip", f); continue; }
  const t0 = Date.now(); d.team.plan = plan(d.team);
  fs.writeFileSync(f, JSON.stringify(d, null, 1));
  console.log(f, ((Date.now() - t0) / 1000).toFixed(1) + "s", d.team.plan.guaranteed, d.team.plan.safe.length + " safe openers");
}
