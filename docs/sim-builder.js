// Fatal Sim team builder that runs in the browser (same model as fatal/sim.py + fatal/milp.py, solved with HiGHS).
// Priority: the highest Control in every control position, all on full chem; then Attack; then Defence.
// Needs engine.js (boosted, effective, CTRL/ATT/DEF, AUTO, ICON) loaded first.
"use strict";
const SIM_FORMATIONS = ["3-1-4-2", "3-4-1-2", "3-5-2", "5-2-1-2", "5-3-2", "5-4-1"];
const SIM_THRESH = { n: [2, 5, 8], l: [3, 5, 8], k: [2, 4, 7] };
const simSolo = x => x.specialChem === "solo";
const simFull = x => AUTO.has(x.color) || simSolo(x);
const simType = x => String(x.color).replace("rare_", "");
function simPid(c) { return typeof c.baseId === "number" && c.baseId > 0 ? "b" + c.baseId : "n" + c.name + "|" + c.nationId; }

// One squad MILP. cards: candidates with A/C/D (boosted) and P (positions); returns 11 cards in slot order or null.
function simSquad(highs, cards, slots, value, chemW, forceFull, opt, timeLimit) {
  const rows = [], bounds = [], bins = [], gens = [], obj = [];
  const lin = t => t.map(([co, v], j) => (j && co >= 0 ? "+ " : "") + (co < 0 ? "- " : "") + (Math.abs(co) === 1 ? "" : Math.abs(co) + " ") + v).join(" ");
  const row = (t, op, rhs) => { if (t.length) rows.push(`c${rows.length}: ${lin(t)} ${op} ${rhs}`); };
  const X = [];                                    // {name, i, k}
  slots.forEach((s, k) => cards.forEach((c, i) => { if (c.P.has(s)) { const v = value(c, s); if (v != null) X.push({ name: `x${i}_${k}`, i, k, v }); } }));
  for (let k = 0; k < 11; k++) { const t = X.filter(x => x.k === k).map(x => [1, x.name]); if (!t.length) return null; row(t, "=", 1); }
  X.forEach(x => bins.push(x.name));
  const Yt = i => X.filter(x => x.i === i).map(x => [1, x.name]);   // "card i is in the team"
  const used = [...new Set(X.map(x => x.i))];
  const byPid = new Map(); used.forEach(i => { const p = simPid(cards[i]); if (!byPid.has(p)) byPid.set(p, []); byPid.get(p).push(i); });
  for (const L of byPid.values()) row(L.flatMap(Yt), "<=", 1);        // each player once
  // chem: counts per nation / league / club, threshold indicators z, chem h per card
  const cnt = { n: new Map(), l: new Map(), k: new Map() }, add = (m, g, i, w) => { if (!m.has(g)) m.set(g, []); m.get(g).push([i, w]); };
  const icons = used.filter(i => ICON.has(cards[i].color));
  used.forEach(i => { const x = cards[i]; if (simSolo(x)) return;
    add(cnt.n, x.nationId, i, 1);
    if (!ICON.has(x.color)) add(cnt.l, x.leagueId, i, x.specialChem === "league2" ? 2 : 1);
    if (!AUTO.has(x.color)) add(cnt.k, x.clubId, i, 1); });
  const Z = new Map();
  for (const tag of ["n", "l", "k"]) for (const [g, mem] of cnt[tag]) {
    const tot = mem.flatMap(([i, w]) => Yt(i).map(([, v]) => [w, v])).concat(tag === "l" ? icons.flatMap(Yt) : []);
    const maxTot = mem.reduce((a, [, w]) => a + w, 0) + (tag === "l" ? icons.length : 0);
    for (const t of SIM_THRESH[tag]) { if (maxTot < t) continue;
      const z = `z${tag}${Z.size}`; Z.set(`${tag}|${g}|${t}`, z); bins.push(z);
      row([[t, z], ...tot.map(([w, v]) => [-w, v])], "<=", 0); }
  }
  const zs = (tag, g) => SIM_THRESH[tag].map(t => Z.get(`${tag}|${g}|${t}`)).filter(Boolean).map(z => [-1, z]);
  used.forEach(i => { const x = cards[i], h = `h${i}`; bounds.push(`0 <= ${h} <= 3`);
    row([[1, h], ...Yt(i).map(([, v]) => [-3, v])], "<=", 0);
    if (!simFull(x)) row([[1, h], ...zs("n", x.nationId), ...(ICON.has(x.color) ? [] : zs("l", x.leagueId)), ...zs("k", x.clubId)], "<=", 0);
    X.filter(v => v.i === i).forEach(v => { const s = slots[v.k];
      if (forceFull && forceFull(x, s)) row([[1, h], [-3, v.name]], ">=", 0);
      const w = chemW && chemW(x, s);
      if (w) { const hs = `s${i}_${v.k}`; bounds.push(`0 <= ${hs} <= 3`); row([[1, hs], [-1, h]], "<=", 0); row([[1, hs], [-3, v.name]], "<=", 0); obj.push([w, hs]); } });
  });
  X.forEach(v => obj.push([v.v, v.name]));
  // squad bonuses: earn N different nations / card types / leagues / clubs
  const distinct = (key, n, tag) => { const G = new Map(); used.forEach(i => { const g = key(cards[i]); if (!G.has(g)) G.set(g, []); G.get(g).push(i); });
    const us = []; let j = 0;
    for (const mem of G.values()) { const u = `d${tag}${j++}`; bins.push(u); us.push([1, u]); row([[1, u], ...mem.flatMap(Yt).map(([, v]) => [-1, v])], "<=", 0); }
    row(us, ">=", n); };
  if (opt.min_nations) distinct(x => x.nationId, opt.min_nations, "n");
  if (opt.min_types) distinct(simType, opt.min_types, "t");
  if (opt.min_leagues) distinct(x => x.leagueId, opt.min_leagues, "l");
  if (opt.min_clubs) distinct(x => x.clubId, opt.min_clubs, "c");
  const lp = ["Maximize", " obj: " + lin(obj.map(([c, v]) => [Math.round(c * 1e6) / 1e6, v])).replace(/(.{1,200})( |$)/g, "$1\n  "), "Subject To", ...rows.map(r => " " + r),
    "Bounds", ...bounds.map(b => " " + b), "Binary", ...bins.map(b => " " + b), "End"].join("\n");
  let res; try { res = highs.solve(lp, { time_limit: timeLimit, mip_rel_gap: 0, mip_abs_gap: 0.5, output_flag: false }); } catch (e) { return null; }
  const sq = Array(11).fill(null);
  if (res.Columns) for (const v of X) { const col = res.Columns[v.name]; if (col && col.Primal > 0.5) sq[v.k] = cards[v.i]; }
  return sq.includes(null) ? null : sq;
}

function simEvaluate(team, slots, series) {
  const E = effective(team, series);
  const C = [], A = [], D = []; let bad = 0;
  slots.forEach((s, i) => { if (CTRL.has(s)) { C.push(E[i].c); if (E[i].chem < 3) bad++; } if (ATT.has(s)) A.push(E[i].a); if (DEF.has(s)) D.push(E[i].d); });
  const m = v => v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 100) / 100 : 0;
  return { control: m(C), attack: m(A), defence: m(D), chem: E.reduce((a, e) => a + e.chem, 0), ctrl_not_full: bad };
}

// series: {cap, boosts, bonuses}; cards: the card pool you own; FORMS: formations.json; progress(text)
function buildSimTeam(highs, series, cards, FORMS, progress, timeLimit = 20) {
  const pool = cards.filter(c => c.rating <= series.cap).map(c => { const [A, C, D] = boosted(c, series.boosts); return Object.assign({}, c, { A, C, D }); });
  const isCtrl = x => [...x.P].some(p => CTRL.has(p));
  const maxC = Math.max(...pool.filter(isCtrl).map(x => x.C));
  const ctrlc = pool.filter(x => isCtrl(x) && x.C >= maxC - 2);
  const nat = new Set(ctrlc.map(x => x.nationId)), lg = new Set(ctrlc.map(x => x.leagueId)), cl = new Set(ctrlc.map(x => x.clubId));
  let variants = [{}];
  for (const b of series.bonuses || []) {
    const key = { nations: "min_nations", types: "min_types", leagues: "min_leagues", clubs: "min_clubs" }[b.kind];
    if (key) variants = variants.concat(variants.map(v => Object.assign({}, v, { [key]: b.min })));
  }
  const results = [];
  const forms = SIM_FORMATIONS.filter(f => FORMS[f]);
  forms.forEach((form, fi) => {
    const slots = FORMS[form], cand = new Set();
    for (const s of new Set(slots)) {
      if (CTRL.has(s)) ctrlc.filter(x => x.P.has(s)).forEach(x => cand.add(x));
      else {
        const key = ATT.has(s) ? (x => x.A) : (x => x.D), el = pool.filter(x => x.P.has(s));
        [...el].sort((a, b) => key(b) - key(a)).slice(0, 50).forEach(x => cand.add(x));
        el.filter(x => cl.has(x.clubId) || simFull(x) || (lg.has(x.leagueId) && key(x) >= maxC - 6) || (nat.has(x.nationId) && key(x) >= maxC - 4)).forEach(x => cand.add(x));
      }
    }
    const cards_f = [...cand];
    const value = (c, s) => { const T = (c.A + c.C + c.D) / 1000; let v = 0; if (CTRL.has(s)) v += 1000 * (c.C + T); if (ATT.has(s)) v += 3 * c.A; if (DEF.has(s)) v += c.D; return v; };
    const chemW = (c, s) => (ATT.has(s) ? 3 : 0) + (DEF.has(s) ? 1 : 0) + 0.01;
    const full = (c, s) => CTRL.has(s) && !simFull(c);
    variants.forEach(v => {
      progress && progress(`Trying ${form} (${fi + 1} of ${forms.length})…`);
      const sq = simSquad(highs, cards_f, slots, value, chemW, full, v, timeLimit);
      if (sq) results.push({ ev: simEvaluate(sq, slots, series), form, sq });
    });
  });
  if (!results.length) return null;
  results.sort((a, b) => (b.ev.control - a.ev.control) || ((3 * b.ev.attack + b.ev.defence) - (3 * a.ev.attack + a.ev.defence)));
  const best = results.filter(r => r.ev.ctrl_not_full === 0)[0] || results[0];
  const slots = FORMS[best.form], E = effective(best.sq, series);
  return { formation: best.form, chem: best.ev.chem, metrics: best.ev,
    players: best.sq.map((x, i) => ({ slot: slots[i], id: x.id, name: x.name, rating: x.rating, color: x.color, position: x.position,
      nationId: x.nationId, leagueId: x.leagueId, clubId: x.clubId, card: [x.attack, x.control, x.defense], chem: E[i].chem, eff: [E[i].a, E[i].c, E[i].d] })) };
}
