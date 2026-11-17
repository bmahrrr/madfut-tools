// Re-picks every puzzle's bonus so it doesn't line up with the locked cards (maxing the bonus then costs chem, so
// players have to find the balance) and sets budget points (par squad rating, points per rating point under par).
// Puzzle ids, formations, locked cards and targets stay the same.   node scripts/rescore_puzzles.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const D = path.join(__dirname, "..", "docs") + "/";
vm.runInThisContext(fs.readFileSync(D + "sbc-solver.js", "utf8"));
const P = JSON.parse(fs.readFileSync(D + "puzzles.json", "utf8")), names = JSON.parse(fs.readFileSync(D + "names.json", "utf8"));
const d = JSON.parse(fs.readFileSync(D + "cards.json", "utf8"));
const cards = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; }).filter(c => !NO_SBC.has(String(c.color).replace("rare_", "")) && !SBC_AUTO.has(c.color));
const by = new Map(cards.map(c => [c.id, c]));
const count = k => { const m = new Map(); cards.forEach(c => m.set(c[k], (m.get(c[k]) || 0) + 1)); return m; };
const L = count("leagueId"), N = count("nationId"), C = count("clubId");
const bigL = [...L].filter(([, n]) => n >= 300).map(([id]) => id), bigN = [...N].filter(([, n]) => n >= 250).map(([id]) => id), bigC = [...C].filter(([, n]) => n >= 14).map(([id]) => id);
let seed = 7177; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648, pick = A => A[Math.floor(rnd() * A.length)];
const EACH = { easy: 20, medium: 30, hard: 40, expert: 50 }, BUDGET = { easy: 6, medium: 10, hard: 15, expert: 20 }, PAR = 85;
for (const s of P.sets) for (const pz of s.puzzles) {
  const locks = pz.locked.map(l => by.get(l.id)).filter(Boolean);
  const lg = new Set(locks.map(c => c.leagueId)), nt = new Set(locks.map(c => c.nationId)), cl = new Set(locks.map(c => c.clubId));
  const r = rnd(), kind = r < .6 ? "league" : r < .9 ? "nation" : "club";
  const pool = kind === "league" ? bigL.filter(x => !lg.has(x)) : kind === "nation" ? bigN.filter(x => !nt.has(x)) : bigC.filter(x => !cl.has(x));
  const id = pick(pool), label = (kind === "league" ? names.leagues : kind === "nation" ? names.nations : names.clubs)[String(id)];
  pz.bonus = { on: kind, id, each: kind === "club" ? EACH[s.tier] * 2 : EACH[s.tier], label };
  pz.budget = { par: PAR, each: BUDGET[s.tier] };
}
fs.writeFileSync(D + "puzzles.json", JSON.stringify(P));
console.log("rescored", P.sets.reduce((a, s) => a + s.puzzles.length, 0), "puzzles");
