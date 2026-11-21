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
  const res = { ok: false, why: "", chem, total, rating, base: pz.pts, bonus: 0, hits: 0, noIcon: 0, budget: 0, extra: 0, chemPts: 0, pts: 0 };
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
  if (pz.lockChem) for (const i of locked.keys()) if (chem[i] < pz.lockChem) { res.why = pz.lockChem >= 3 ? "Locked cards need full chem" : `Locked cards need ${pz.lockChem} chem`; return res; }
  const free = team.filter((c, i) => !locked.has(i));
  res.hits = free.filter(c => pzBonusHit(c, pz.bonus)).length; res.free = free.length; res.icons = free.filter(c => SBC_AUTO.has(c.color)).length;
  res.bonus = pz.bonus ? res.hits * pz.bonus.each : 0;
  res.noIcon = free.some(c => SBC_AUTO.has(c.color)) ? 0 : (pz.noIcon || 0);
  res.budget = pzBudget(pz, rating);
  res.extra = total - pz.target; res.chemPts = pz.chemEach ? res.extra * pz.chemEach : 0;   // points for each chem over the target
  res.ok = true; res.pts = pz.pts + res.bonus + res.noIcon + res.budget + res.chemPts;
  return res;
}

// score colours: how close a score is to the puzzle's top score. Perfect is the top score itself
const PZ_BANDS = [["perfect", 1, "Perfect"], ["gold", .96, "Gold"], ["silver", .9, "Silver"], ["bronze", .8, "Bronze"]];
const pzBandOf = (top, pts) => { if (!top || !pts) return ""; const b = PZ_BANDS.find(([, f]) => pts / top >= f); return b ? b[0] : "plain"; };

// ---------- Puzzles achievements (shared with the server) ----------
// [key, name, what it takes, group]. Count achievements come from the bests; the rest are earned when a squad is sent
const PZ_ACH = [
  ["solve1", "First Steps", "Solve your first puzzle", "Progress"],
  ["solve10", "Getting Going", "Solve 10 puzzles", "Progress"],
  ["solve25", "Warming Up", "Solve 25 puzzles", "Progress"],
  ["solve50", "Committed", "Solve 50 puzzles", "Progress"],
  ["solve100", "Centurion", "Solve 100 puzzles", "Progress"],
  ["solve150", "Nearly There", "Solve 150 puzzles", "Progress"],
  ["solveall", "Completionist", "Solve every puzzle", "Progress"],
  ["setclear", "Set Cleared", "Solve every puzzle in a set", "Progress"],
  ["tierclear", "Tier Cleared", "Solve every Easy, Medium, Hard or Expert puzzle", "Progress"],
  ["perf1", "Flawless", "Get your first Perfect", "Perfection"],
  ["perf10", "Perfectionist I", "Get 10 Perfects", "Perfection"],
  ["perf25", "Perfectionist II", "Get 25 Perfects", "Perfection"],
  ["perf50", "Perfectionist III", "Get 50 Perfects", "Perfection"],
  ["perfset", "Perfect Set", "Every puzzle in a set at Perfect", "Perfection"],
  ["perftier", "Perfect Tier", "Every puzzle in a tier at Perfect", "Perfection"],
  ["perfall", "The Full Set", "Every puzzle at Perfect", "Perfection"],
  ["pure", "Pure", "A Perfect with no Icons or Heroes", "Skill"],
  ["budget", "Budget King", "A Perfect on a Medium or harder puzzle with a squad rated under 80", "Skill"],
  ["over", "Overachiever", "Finish 5 or more chem over the target", "Skill"],
  ["loyal", "Loyalist", "Fill every open spot with bonus cards", "Skill"],
  ["expert", "Expert Touch", "A Perfect on an Expert puzzle", "Skill"],
  ["podium", "Podium", "Top 3 on any puzzle", "Competition"],
  ["top1", "Number One", "#1 on any puzzle (a shared #1 counts)", "Competition"],
  ["elite", "Elite", "Top 10% on 10 puzzles", "Competition"],
  ["setchamp", "Set Champion", "#1 on a set's leaderboard", "Competition"],
  ["world", "Top of the World", "#1 overall", "Competition"],
  ["comeback", "Comeback", "Beat a score you set 7 or more days earlier", "Dedication"],
  ["grinder", "Grinder", "Send 100 squads", "Dedication"],
  ["noundo", "No Undo", "Solve a Hard or Expert puzzle without using Undo", "Dedication"],
];
const PZ_ACH_N = { solve: [[1, "solve1"], [10, "solve10"], [25, "solve25"], [50, "solve50"], [100, "solve100"], [150, "solve150"]], perf: [[1, "perf1"], [10, "perf10"], [25, "perf25"], [50, "perf50"]] };
// from the bests: best = {puzzle id: points}, top = id -> top score, sets = puzzles.json sets
function pzAchFrom(best, top, sets) {
  const out = new Set(), all = sets.flatMap(s => s.puzzles), done = p => best[p.id] > 0, perf = p => { const t = top(p.id); return !!t && best[p.id] >= t; };
  const solved = all.filter(done).length, perfs = all.filter(perf).length;
  for (const [n, k] of PZ_ACH_N.solve) if (solved >= n) out.add(k);
  for (const [n, k] of PZ_ACH_N.perf) if (perfs >= n) out.add(k);
  if (all.length && solved === all.length) out.add("solveall");
  if (all.length && perfs === all.length) out.add("perfall");
  if (sets.some(s => s.puzzles.every(done))) out.add("setclear");
  if (sets.some(s => s.puzzles.every(perf))) out.add("perfset");
  const tiers = [...new Set(sets.map(s => s.tier))], inTier = t => sets.filter(s => s.tier === t).flatMap(s => s.puzzles);
  if (tiers.some(t => inTier(t).every(done))) out.add("tierclear");
  if (tiers.some(t => inTier(t).every(perf))) out.add("perftier");
  if (inTier("expert").some(perf)) out.add("expert");
  return out;
}
// from one squad sent: x = { pz, tier, sc (pzScore), top, prev: {pts, at (ms)} or null, now (ms), undo (Undo was used), rank: {puzzle, set, all} }
function pzAchEvent(x) {
  const out = [], sc = x.sc, perf = !!x.top && sc.pts >= x.top, r = x.rank || {};
  if (perf && !sc.icons) out.push("pure");
  if (perf && x.tier !== "easy" && sc.rating < 80) out.push("budget");
  if (sc.extra >= 5) out.push("over");
  if (x.pz.bonus && sc.free && sc.hits >= sc.free) out.push("loyal");
  if (x.prev && x.prev.at && sc.pts > x.prev.pts && x.now - x.prev.at >= 7 * 864e5) out.push("comeback");
  if (!x.undo && (x.tier === "hard" || x.tier === "expert")) out.push("noundo");
  if (r.puzzle && r.puzzle <= 3) out.push("podium");
  if (r.puzzle === 1) out.push("top1");
  if (r.set === 1) out.push("setchamp");
  if (r.all === 1) out.push("world");
  return out;
}
// "Top x%" on a puzzle: n players with a score, above = how many scored more
const pzTopPctOf = (above, n) => Math.max(1, Math.ceil((above + 1) / Math.max(n, above + 1) * 100));
