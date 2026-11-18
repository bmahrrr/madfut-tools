// Helpers for scripts/pz_max.py, using the site's own rules so the top scores match what players get.
//   node scripts/pz_max.js elig <out json>                      cards a puzzle squad may use (not Icons / Heroes)
//   node scripts/pz_max.js eligall <out json>                   the same with Icons and Heroes (for the Icons check)
//   node scripts/pz_max.js merge <out json> <result json>...     score every squad found, keep each puzzle's best
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const D = path.join(__dirname, "..", "docs") + "/";
vm.runInThisContext(fs.readFileSync(D + "sbc-solver.js", "utf8"));
vm.runInThisContext(fs.readFileSync(process.env.PZ_CORE || D + "puzzle-core.js", "utf8"));   // PZ_CORE / PZ_FILE: a test copy's own
const d = JSON.parse(fs.readFileSync(D + "cards.json", "utf8")), FORMS = JSON.parse(fs.readFileSync(D + "formations.json", "utf8"));
const cards = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
const [mode, out, ...ins] = process.argv.slice(2);
if (mode === "elig" || mode === "eligall") {
  fs.writeFileSync(out, JSON.stringify(cards.filter(c => !pzNoSBC(c) && (mode === "eligall" || !SBC_AUTO.has(c.color))).map(c => c.id)));
} else if (mode === "merge") {
  const P = JSON.parse(fs.readFileSync(process.env.PZ_FILE || D + "puzzles.json", "utf8")), by = new Map(cards.map(c => [c.id, c]));
  const all = new Map(P.sets.flatMap(s => s.puzzles).map(p => [p.id, p]));
  let res = {}; try { res = JSON.parse(fs.readFileSync(out, "utf8")).puzzles || {}; } catch (e) {}
  // a kept top score only stands if its squad still passes (the puzzle or the cards may have changed)
  for (const [id, r] of Object.entries(res)) { const pz = all.get(id), sc = pz && r.team && pzScore(pz, FORMS[pz.formation], r.team.map(i => by.get(i)).map(c => c || null));
    if (!sc || !sc.ok) delete res[id]; else r.max = sc.pts; }
  for (const [id, r] of Object.entries(res)) if (all.get(id).chemEach && !r.chem) r.proven = false;   // proven before chem points counted
  for (const f of ins) for (const [id, r] of Object.entries(JSON.parse(fs.readFileSync(f, "utf8")))) {
    const pz = all.get(id), slots = FORMS[pz.formation];
    if (pz.chemEach && !r.chem) r.proven = false;
    for (const ids of r.teams) {
      const sc = pzScore(pz, slots, ids.map(i => by.get(i)));
      if (!sc.ok) { console.log(id, "squad failed the site's check:", sc.why); continue; }
      const old = res[id];
      if (!old || sc.pts > old.max || (sc.pts === old.max && r.proven && !old.proven)) res[id] = { max: sc.pts, proven: !!r.proven, team: ids, ...(r.chem ? { chem: true } : {}), ...(r.icons && r.proven ? { icons: true } : {}) };
      else if (sc.pts === old.max && r.proven) { old.proven = true; if (r.chem) old.chem = true; if (r.icons) old.icons = true; }
    }
  }
  fs.writeFileSync(out, JSON.stringify({ made: new Date().toISOString(), puzzles: res }));
  const v = Object.values(res);
  console.log(`top scores: ${v.length} puzzles, ${v.filter(x => x.proven).length} proven`);
}
