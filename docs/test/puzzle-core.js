// Puzzles: shared by the site and the leaderboard server (which adds it after sbc-solver.js), so a squad is scored
// the same way in both places. A puzzle: a formation, some locked cards in set spots, a chem target, points for
// finishing it and bonus points (each card from a league / nation / club, a bonus for using no Icons or Heroes, and
// budget points for a squad rating under par).
"use strict";

const PZ_TIERS = {
  easy: { name: "Easy", note: "2 locked cards" },
  medium: { name: "Medium", note: "3 locked cards" },
  hard: { name: "Hard", note: "4 locked cards" },
  expert: { name: "Expert", note: "5 locked cards, full chem" },
};

function pzPos(c) { return c.P || (c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)])); }
const pzFits = (c, slot) => !!c && pzPos(c).has(slot);
const pzNoSBC = c => NO_SBC_ID.has(c.id) || NO_SBC.has(c.color) || NO_SBC.has(String(c.color).replace("rare_", ""));

// chem per spot. A card out of position gets 0 and adds nothing to anyone else (like the game)
function pzChem(slots, team) {
  const idx = []; team.forEach((c, i) => { if (c && pzFits(c, slots[i])) idx.push(i); });
  const ch = sbcChem(idx.map(i => team[i])), out = team.map(() => 0);
  idx.forEach((i, k) => { out[i] = ch[k]; });
  return out;
}

// budget points: for every point the squad rating is under the puzzle's par (like doing an SBC cheaply)
const pzBudget = (pz, rating) => pz.budget && rating ? Math.max(0, pz.budget.par - rating) * pz.budget.each : 0;

// does card c count for the puzzle's bonus?
function pzBonusHit(c, b) {
  if (!b || !c) return false;
  return b.on === "league" ? c.leagueId === b.id : b.on === "nation" ? c.nationId === b.id : b.on === "club" ? c.clubId === b.id : false;
}

// team: cards (or null) in the puzzle's formation order. -> { ok, why, chem: per spot, total, pts, base, bonus, noIcon }
function pzScore(pz, slots, team) {
  const chem = pzChem(slots, team), total = chem.reduce((a, b) => a + b, 0);
  const full = team.every(Boolean), rating = full ? teamRatingOf(team.map(c => c.rating)) : 0;
  const res = { ok: false, why: "", chem, total, rating, base: pz.pts, bonus: 0, hits: 0, noIcon: 0, budget: 0, pts: 0 };
  const locked = new Map(pz.locked.map(l => [l.i, l.id]));
  if (team.length !== slots.length || team.some(c => !c)) { res.why = "Fill every spot"; return res; }
  for (const [i, id] of locked) if (team[i].id !== id) { res.why = "A locked card was moved"; return res; }
  const keys = new Set();
  for (let i = 0; i < team.length; i++) {
    const c = team[i];
    if (keys.has(playerKey(c))) { res.why = `${c.name} is in twice`; return res; }
    keys.add(playerKey(c));
    if (!locked.has(i) && pzNoSBC(c)) { res.why = `${c.name} can't be used here`; return res; }
  }
  if (total < pz.target) { res.why = `Needs ${pz.target} chem`; return res; }
  const free = team.filter((c, i) => !locked.has(i));
  res.hits = free.filter(c => pzBonusHit(c, pz.bonus)).length;
  res.bonus = pz.bonus ? res.hits * pz.bonus.each : 0;
  res.noIcon = free.some(c => SBC_AUTO.has(c.color)) ? 0 : (pz.noIcon || 0);
  res.budget = pzBudget(pz, rating);
  res.ok = true; res.pts = pz.pts + res.bonus + res.noIcon + res.budget;
  return res;
}
