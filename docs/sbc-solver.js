// SBC solver that runs in the browser (inside sbcworker.js) using the HiGHS solver compiled to WebAssembly.
// Finds the cheapest squad that meets every requirement, in your cost order:
// golds first (lowest rated first), then silvers / bronzes, then specials rated 83 or lower, then 84+ specials
// (normal special packs give far more 83- specials than 84+).
"use strict";

const SBC_AUTO = new Set(["icon", "debut_icon", "hero", "hall_of_fut"]);
const SBC_ICON = new Set(["icon", "debut_icon"]);
const SBC_HERO = new Set(["hero", "hall_of_fut"]);
// Card types the game doesn't allow in SBCs.
const NO_SBC = new Set(["evo", "elite_evo", "sbc_premium", "ltm", "epl_potm", "laliga_potm", "seriea_potm", "bundesliga_potm", "ligue1_potm", "ligue_1_potm"]);
const COMMON_FORMS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-2-1-2", "3-4-3", "4-4-1-1", "5-3-2", "4-3-2-1", "3-4-1-2"];
const THRESH = { n: [2, 5, 8], l: [3, 5, 8], k: [2, 4, 7] };

const sbcType = c => String(c.color).replace("rare_", "");
const rarity = c => { const t = sbcType(c); return t === "gold" || t === "silver" || t === "bronze" ? t : "special"; };
const playerKey = c => (Number.isInteger(c.baseId) && c.baseId > 0 ? "b" + c.baseId : c.name + "|" + c.nationId);

function sbcCost(c, pr) {
  // Like coin prices: each rating point costs a little up to 80, then far more (a 90 costs ~5x an 80).
  const r = rarity(c), q = c.rating, steep = q > 80 ? 40 * (q - 80) * (q - 80) : 0;
  if (pr === "lowest_rating") return (r === "special" ? 300 : 0) + q * 10 + steep;
  let base = { gold: 0, silver: 400, bronze: 400, special: q >= 84 ? 1600 : 800 }[r];
  if (SBC_AUTO.has(c.color)) base = 2000;
  return base + q * 10 + steep;
}

function ruleMatch(c, r) {
  switch (r.on) {
    case "nation": return c.nationId === r.id;
    case "league": return c.leagueId === r.id;
    case "club": return c.clubId === r.id;
    case "color": {                // a Debut Icon counts as an ICON (so "ICON: Max 1" never allows an Icon plus a Debut Icon)
      const id = String(r.id).replace("rare_", "");
      return id === "icon" ? SBC_ICON.has(c.color) : sbcType(c) === id;
    }
    case "rarity": return rarity(c) === r.id;
  }
  return false;
}

function teamRatingOf(rs) {        // EA / FUTBIN squad rating
  const tot = rs.reduce((a, b) => a + b, 0), avg = tot / rs.length;
  const ex = rs.reduce((a, r) => a + (r > avg ? r - avg : 0), 0);
  return Math.floor(Math.round(tot + ex + 1e-9) / rs.length);
}

// SBC chemistry. Icons: +2 to their nation, +1 to every league. Heroes: +1 nation, +2 league.
// Squad Foundations: +2 to their league. Icons and heroes are always on full chem.
const natW = c => (SBC_ICON.has(c.color) ? 2 : 1);
const lgW = c => (SBC_HERO.has(c.color) || c.specialChem === "league2" ? 2 : 1);
function sbcChem(team) {
  const nat = new Map(), lg = new Map(), club = new Map(); let icons = 0;
  const inc = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  for (const x of team) {
    inc(nat, x.nationId, natW(x));
    if (!SBC_AUTO.has(x.color)) inc(club, x.clubId, 1);
    if (SBC_ICON.has(x.color)) icons++; else inc(lg, x.leagueId, lgW(x));
  }
  const lvl = (v, T) => (v >= T[2] ? 3 : v >= T[1] ? 2 : v >= T[0] ? 1 : 0);
  return team.map(x => SBC_AUTO.has(x.color) ? 3 :
    Math.min(3, lvl(nat.get(x.nationId) || 0, THRESH.n) + lvl((lg.get(x.leagueId) || 0) + icons, THRESH.l) + lvl(club.get(x.clubId) || 0, THRESH.k)));
}

// ---------- candidate selection ----------
function sbcPool(req, cards) {
  const ex = new Set((req.exclude || []).map(String)), inc = new Set((req.include || []).map(String));
  const rules = req.rules || [];
  const lo = req.min_card_rating || 0, hi = req.max_card_rating || 99;
  return cards.filter(c => {
    if (ex.has(c.id) || NO_SBC.has(c.color) || NO_SBC.has(String(c.color).replace("rare_", ""))) return false;
    if (inc.has(c.id)) return true;
    if (c.rating < lo || c.rating > hi) return false;
    if (SBC_AUTO.has(c.color)) return !!req.allow_icons;
    if (rarity(c) === "special" && !req.allow_specials) return rules.some(r => r.on === "color" && ruleMatch(c, r));
    return true;
  });
}

function sbcCandidates(req, pool, forms, FORMS, K = {}) {
  const k1 = K.per ?? 45, k2 = K.rule ?? 20, k3 = K.tr ?? 25, k4 = K.groups ?? 6, k5 = K.depth ?? 8;
  const pr = req.priority || "gold_first", tr = req.min_rating || 0, rules = req.rules || [];
  const lo = tr ? tr - 8 : 0;
  const chosen = new Map(), add = x => chosen.set(x.id, x);
  const pos = new Set(); forms.forEach(f => FORMS[f].forEach(p => pos.add(p)));
  const byCost = (a, b) => sbcCost(a, pr) - sbcCost(b, pr);
  const el = {};
  for (const p of pos) {
    el[p] = pool.filter(x => x.P.has(p) && x.rating >= lo).sort(byCost);
    el[p].slice(0, k1).forEach(add);
    for (const r of rules) el[p].filter(y => ruleMatch(y, r)).slice(0, k2).forEach(add);
    if (tr) el[p].filter(y => y.rating >= tr).slice(0, k3).forEach(add);
    // a squad rating with low cards in it (a bronze for card types, say) needs some higher ones: a few at each rating above
    if (tr) for (let q = tr + 1; q <= tr + 7; q++) el[p].filter(y => y.rating === q).slice(0, K.ladder ?? 6).forEach(add);
  }
  // chem clusters: extra depth in the most common leagues and nations among the cheap cards
  const cheap = [...chosen.values()].sort(byCost).slice(0, 300);
  for (const key of ["leagueId", "nationId"]) {
    const cnt = new Map(); cheap.forEach(x => cnt.set(x[key], (cnt.get(x[key]) || 0) + 1));
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, k4).map(e => e[0]);
    for (const g of top) for (const p of pos) el[p].filter(x => x[key] === g).slice(0, k5).forEach(add);
  }
  // card-type rules: the cheapest few of every type at any rating (a 4th type needs a special, specials are never among
  // the cheapest, and with a squad rating a bronze is below the usual rating floor)
  if (req.min_types || req.max_types) for (const p of pos) {
    const seen = new Map();
    for (const x of pool.filter(y => y.P.has(p)).sort(byCost)) { const t = sbcType(x), n = seen.get(t) || 0; if (n < (K.types ?? 3)) { seen.set(t, n + 1); add(x); } }
  }
  // groups named in the rules and the same-group requirements get extra depth
  const inc = new Set((req.include || []).map(String));
  pool.forEach(x => { if (inc.has(x.id)) add(x); });
  return [...chosen.values()];
}

// ---------- model (CPLEX LP text, read by HiGHS) ----------
function buildLP(req, cands, slots, rsum) {
  const pr = req.priority || "gold_first";
  const X = [];                       // {i, k, name}
  const xsOf = cands.map(() => []);
  slots.forEach((s, k) => cands.forEach((c, i) => { if (c.P.has(s)) { const v = { i, k, name: "x" + X.length }; X.push(v); xsOf[i].push(v.name); } }));
  for (let k = 0; k < slots.length; k++) if (!X.some(v => v.k === k)) return null;
  const used = cands.map((c, i) => i).filter(i => xsOf[i].length);
  const Y = i => xsOf[i];             // list of var names whose sum = 1 if card i is picked
  const rows = []; let rc = 0;
  const lin = (terms) => terms.map(([co, v], j) => (j && co >= 0 ? "+ " : "") + (co < 0 ? "- " : "") + (Math.abs(co) === 1 ? "" : Math.abs(co) + " ") + v).join(" ");
  let infeasible = false;
  const row = (terms, op, rhs) => {
    if (!terms.length) { if ((op === ">=" && rhs > 0) || (op === "=" && rhs !== 0) || (op === "<=" && rhs < 0)) infeasible = true; return; }
    rows.push(`r${rc++}: ${wrap(lin(terms))} ${op} ${rhs}`);
  };
  const ysum = (ids, w = () => 1) => ids.flatMap(i => Y(i).map(v => [w(cands[i]), v]));
  const ints = X.map(v => v.name), conts = [];
  const bounds = [];

  slots.forEach((s, k) => row(X.filter(v => v.k === k).map(v => [1, v.name]), "=", 1));
  const byP = new Map();
  used.forEach(i => { const p = playerKey(cands[i]); if (!byP.has(p)) byP.set(p, []); byP.get(p).push(i); });
  for (const ids of byP.values()) { const t = ysum(ids); if (t.length > 1) row(t, "<=", 1); }
  (req.include || []).forEach(id => { const ids = used.filter(i => cands[i].id === String(id)); if (ids.length) row(ysum(ids), ">=", 1); });

  const needChem = req.min_chem || req.min_player_chem;
  if (needChem) {
    const groups = { n: new Map(), l: new Map(), k: new Map() };
    const icons = used.filter(i => SBC_ICON.has(cands[i].color));
    const put = (m, g, i, w) => { if (!m.has(g)) m.set(g, []); m.get(g).push([i, w]); };
    used.forEach(i => {
      const c = cands[i];
      put(groups.n, c.nationId, i, natW(c));
      if (!SBC_ICON.has(c.color)) put(groups.l, c.leagueId, i, lgW(c));
      if (!SBC_AUTO.has(c.color)) put(groups.k, c.clubId, i, 1);
    });
    const Z = new Map();               // "tag|g" -> [z names]
    let zc = 0;
    for (const tag of ["n", "l", "k"]) for (const [g, mem] of groups[tag]) {
      const terms = mem.flatMap(([i, w]) => Y(i).map(v => [w, v]));
      if (tag === "l") icons.forEach(i => Y(i).forEach(v => terms.push([1, v])));
      const maxPossible = Math.min(11 * 2, mem.reduce((a, [, w]) => a + w, 0) + (tag === "l" ? icons.length : 0));
      const zs = [];
      for (const t of THRESH[tag]) {
        if (maxPossible < t) break;
        const z = "z" + zc++; ints.push(z); zs.push(z);
        row([...terms, [-t, z]], ">=", 0);
        if (zs.length > 1) row([[1, z], [-1, zs[zs.length - 2]]], "<=", 0);
      }
      Z.set(tag + "|" + g, zs);
    }
    const H = [];
    used.forEach(i => {
      const c = cands[i], h = "h" + i; H.push(h); conts.push(h); bounds.push(`0 <= ${h} <= 3`);
      row([[1, h], ...Y(i).map(v => [-3, v])], "<=", 0);
      if (!SBC_AUTO.has(c.color)) {
        const pts = [...(Z.get("n|" + c.nationId) || []), ...(SBC_ICON.has(c.color) ? [] : Z.get("l|" + c.leagueId) || []), ...(Z.get("k|" + c.clubId) || [])];
        row([[1, h], ...pts.map(z => [-1, z])], "<=", 0);
      }
      if (req.min_player_chem) row([[1, h], ...Y(i).map(v => [-req.min_player_chem, v])], ">=", 0);
    });
    if (req.min_chem) row(H.map(h => [1, h]), ">=", req.min_chem);
  }
  const groupBy = key => { const m = new Map(); used.forEach(i => { const g = key(cands[i]); if (!m.has(g)) m.set(g, []); m.get(g).push(i); }); return m; };
  let uc = 0;
  const KEY = { nation: c => c.nationId, league: c => c.leagueId, club: c => c.clubId };
  for (const kind of ["nation", "league", "club"]) {
    const lo = req[`min_${kind}s`], hi = req[`max_${kind}s`], ms = req[`max_same_${kind}`], mn = req[`min_same_${kind}`];
    if (!lo && !hi && !ms && !mn) continue;
    const G = groupBy(KEY[kind]);
    if (lo || hi) {
      const us = [];
      for (const ids of G.values()) {
        const u = "u" + uc++; ints.push(u); us.push(u);
        const t = ysum(ids);
        if (lo) row([[1, u], ...t.map(([, v]) => [-1, v])], "<=", 0);
        if (hi) t.forEach(([, v]) => row([[1, u], [-1, v]], ">=", 0));
      }
      if (lo) row(us.map(u => [1, u]), ">=", lo);
      if (hi) row(us.map(u => [1, u]), "<=", hi);
    }
    if (ms) for (const ids of G.values()) { const t = ysum(ids); if (t.length > ms) row(t, "<=", ms); }
    if (mn) {
      const ws = [];
      for (const ids of G.values()) {
        if (new Set(ids.map(i => playerKey(cands[i]))).size < mn) continue;
        const w = "u" + uc++; ints.push(w); ws.push(w);
        row([...ysum(ids), [-mn, w]], ">=", 0);
      }
      if (!ws.length) return null;
      row(ws.map(w => [1, w]), ">=", 1);
    }
  }
  if (req.min_types || req.max_types) {
    const vs = [];
    for (const ids of groupBy(sbcType).values()) {
      const v = "u" + uc++, t = ysum(ids); ints.push(v); vs.push(v);
      if (req.min_types) row([[1, v], ...t.map(([, x]) => [-1, x])], "<=", 0);
      if (req.max_types) t.forEach(([, x]) => row([[1, v], [-1, x]], ">=", 0));
    }
    if (req.min_types) row(vs.map(v => [1, v]), ">=", req.min_types);
    if (req.max_types) row(vs.map(v => [1, v]), "<=", req.max_types);
  }
  for (const r of req.rules || []) {
    const t = ysum(used.filter(i => ruleMatch(cands[i], r)));
    row(t, r.op === "<=" ? "<=" : r.op === "=" ? "=" : ">=", r.n);
  }
  if (req.min_rating) {
    // Exact EA squad rating >= T:  round(tot + sum_k max(0, r_k - avg)) / 11 >= T,  avg = tot / 11.
    // For L = floor(avg) the excess equals f_L - theta * n_L, where f_L = sum_k max(0, r_k - L)
    // (linear), n_L = number of players rated above L and theta = avg - L in [0, 1).
    // theta * n_L = sum_k theta * d_k with d_k = [r_k > L] binary, linearised exactly by p_k >= theta + d_k - 1.
    // One switch lam_L picks the L that matches the squad's average.
    const T = req.min_rating, BIG = 2000;
    conts.push("tot"); bounds.push("0 <= tot <= 1100");
    row([[1, "tot"], ...X.map(v => [-cands[v.i].rating, v.name])], "=", 0);
    const lams = [];
    const Lr = req._L != null ? [req._L, req._L] : [T - 8, T + 3];
    for (let L = Lr[0]; L <= Lr[1]; L++) {
      const lam = "lam" + L; ints.push(lam); lams.push(lam);
      row([[1, "tot"], [-BIG, lam]], ">=", 11 * L - BIG);
      row([[1, "tot"], [BIG, lam]], "<=", 11 * L + 10 + BIG);
      const ps = [];
      slots.forEach((s, k) => {
        const pk = `p${L}_${k}`; ps.push(pk); conts.push(pk);
        // 11*p_k >= tot - 11L + 11*d_k - 11 - BIG*(1 - lam)
        row([[11, pk], [-1, "tot"], ...X.filter(v => v.k === k && cands[v.i].rating > L).map(v => [-11, v.name]), [-BIG, lam]], ">=", -11 * L - 11 - BIG);
      });
      // tot + f_L - sum p_k >= 11T - BIG*(1 - lam)   (no rounding slack, so it holds whichever way the game rounds)
      row([[1, "tot"], ...X.filter(v => cands[v.i].rating > L).map(v => [cands[v.i].rating - L, v.name]), ...ps.map(pk => [-1, pk]), [-BIG, lam]], ">=", 11 * T - BIG);
    }
    row(lams.map(l => [1, l]), "=", 1);
  }
  if (rsum) row(X.map(v => [cands[v.i].rating, v.name]), ">=", rsum);
  if (infeasible) return null;
  const obj = X.map(v => [sbcCost(cands[v.i], pr), v.name]);
  const lp = ["Minimize", " obj: " + wrap(lin(obj)), "Subject To", ...rows.map(r => " " + r),
    "Bounds", ...bounds.map(b => " " + b), "Binary", ...chunk(ints), "End"].join("\n");
  return { lp, X, cands };
}
function wrap(s) { const parts = s.split(" "); const out = []; for (let i = 0; i < parts.length; i += 24) out.push(parts.slice(i, i + 24).join(" ")); return out.join("\n  "); }
function chunk(names) { const out = []; for (let i = 0; i < names.length; i += 20) out.push(" " + names.slice(i, i + 20).join(" ")); return out; }

// ---------- fast search (simulated annealing) ----------
// Finds a good valid squad in a second or two; the exact solver then tries to beat it or prove it is cheapest.
function annealSBC(req, cands, slots, opts = {}) {
  const pr = req.priority || "gold_first", n = cands.length, S = slots.length;
  const rules = req.rules || [], R = rules.length;
  const cost = cands.map(c => sbcCost(c, pr)), rat = cands.map(c => c.rating);
  const idx = (key) => { const m = new Map(); return cands.map(c => { const k = key(c); if (!m.has(k)) m.set(k, m.size); return m.get(k); }); };
  const NAT = idx(c => c.nationId), LG = idx(c => c.leagueId), CL = idx(c => c.clubId), TY = idx(sbcType), PK = idx(playerKey);
  const isIcon = cands.map(c => SBC_ICON.has(c.color)), isAuto = cands.map(c => SBC_AUTO.has(c.color));
  const nw = cands.map(natW), lw = cands.map(lgW);
  const rm = cands.map(c => rules.map(r => ruleMatch(c, r)));
  const incl = (req.include || []).map(String);
  const elig = slots.map(sl => { const L = []; for (let i = 0; i < n; i++) if (cands[i].P.has(sl)) L.push(i); return L.sort((a, b) => cost[a] - cost[b]); });
  if (elig.some(L => !L.length)) return null;
  // group partners for chem-building moves
  const byG = [NAT, LG, CL].map(arr => { const m = new Map(); arr.forEach((g, i) => { if (!m.has(g)) m.set(g, []); m.get(g).push(i); }); return m; });
  const eligSet = slots.map((sl, k) => new Set(elig[k]));
  const NG = Math.max(...NAT, ...LG, ...CL, ...TY) + 1;
  const cN = new Int16Array(NG), cL = new Int16Array(NG), cC = new Int16Array(NG), cT = new Int16Array(NG);
  const lv = (v, T) => (v >= T[2] ? 3 : v >= T[1] ? 2 : v >= T[0] ? 1 : 0);
  const W = 400, Tg = req.min_rating || 0;
  function evaluate(sq) {
    let c0 = 0, tot = 0, icons = 0, pen = 0;
    for (const i of sq) { cN[NAT[i]] = cL[LG[i]] = cC[CL[i]] = cT[TY[i]] = 0; }
    for (const i of sq) {
      c0 += cost[i]; tot += rat[i];
      cN[NAT[i]] += nw[i]; if (!isAuto[i]) cC[CL[i]]++; if (isIcon[i]) icons++; else cL[LG[i]] += lw[i]; cT[TY[i]]++;
    }
    // duplicates of the same player
    for (let a = 0; a < S; a++) for (let b = a + 1; b < S; b++) if (PK[sq[a]] === PK[sq[b]]) pen += 50;
    if (Tg) { const avg = tot / S; let ex = 0; for (const i of sq) if (rat[i] > avg) ex += rat[i] - avg; const d = 11 * Tg - (tot + ex); if (d > 0) pen += d + 1; }
    if (req.min_chem || req.min_player_chem) {
      let chem = 0;
      for (const i of sq) {
        const h = isAuto[i] ? 3 : Math.min(3, lv(cN[NAT[i]], THRESH.n) + lv(cL[LG[i]] + icons, THRESH.l) + lv(cC[CL[i]], THRESH.k));
        chem += h; if (req.min_player_chem && h < req.min_player_chem) pen += req.min_player_chem - h;
      }
      if (req.min_chem && chem < req.min_chem) pen += req.min_chem - chem;
    }
    if (R) for (let r = 0; r < R; r++) {
      let m = 0; for (const i of sq) if (rm[i][r]) m++;
      const ru = rules[r]; if (ru.op === ">=" && m < ru.n) pen += ru.n - m; else if (ru.op === "<=" && m > ru.n) pen += m - ru.n; else if (ru.op === "=" && m !== ru.n) pen += Math.abs(m - ru.n);
    }
    const distinct = (arr) => { const st = new Set(); for (const i of sq) st.add(arr[i]); return st.size; };
    const most = (arr) => { const m = new Map(); let b = 0; for (const i of sq) { const v = (m.get(arr[i]) || 0) + 1; m.set(arr[i], v); if (v > b) b = v; } return b; };
    for (const [kind, arr] of [["nation", NAT], ["league", LG], ["club", CL]]) {
      const lo = req[`min_${kind}s`], hi = req[`max_${kind}s`], ms = req[`max_same_${kind}`], mn = req[`min_same_${kind}`];
      if (lo || hi) { const d = distinct(arr); if (lo && d < lo) pen += lo - d; if (hi && d > hi) pen += d - hi; }
      if (ms || mn) { const b = most(arr); if (ms && b > ms) pen += b - ms; if (mn && b < mn) pen += mn - b; }
    }
    if (req.min_types || req.max_types) { const d = distinct(TY); if (req.min_types && d < req.min_types) pen += req.min_types - d; if (req.max_types && d > req.max_types) pen += d - req.max_types; }
    for (const id of incl) if (!sq.some(i => cands[i].id === id)) pen += 3;
    return { cost: c0, pen, score: c0 + W * pen };
  }
  const rnd = (k) => Math.floor(Math.random() * k);
  const pickCheap = (L) => L[Math.min(L.length - 1, Math.floor(-Math.log(1 - Math.random()) * Math.min(12, L.length)))];
  let best = null;
  const iters = opts.iters || 60000, restarts = opts.restarts || 4;
  const init = opts.init && opts.init.every((i, k) => i >= 0 && eligSet[k].has(i)) ? opts.init : null;
  const tEnd = opts.ms ? Date.now() + opts.ms : 0;
  // fixed number of runs, or (with ms) as many runs as fit in the time - more runs, steadier results
  for (let rs = 0; rs < restarts + (init ? 1 : 0) || (tEnd && Date.now() < tEnd); rs++) {      // a known squad gets an extra run of its own
    let sq = init && rs === 0 ? init.slice() : elig.map(L => pickCheap(L));     // first run: improve a known good squad
    // put must-include cards in a slot they fit
    for (const id of incl) { const i = cands.findIndex(c => c.id === id); if (i < 0) continue; const k = slots.findIndex((sl, k) => eligSet[k].has(i)); if (k >= 0) sq[k] = i; }
    let cur = evaluate(sq);
    const T0 = init && rs === 0 ? 60 : 300;          // a known squad: explore near it (cooler start)
    let T = T0;
    if (init && rs === 0) { const e0 = evaluate(sq); if (e0.pen === 0) best = { cost: e0.cost, sq: sq.slice() }; }
    const N = init && rs === 0 ? Math.ceil(iters / 4) : iters;        // polishing a known squad needs fewer steps
    for (let it = 0; it < N; it++) {
      T = T0 * Math.pow(0.5 / T0, it / N);
      const nsq = sq.slice(), mv = Math.random();
      if (mv < 0.25) {                                   // swap two slots
        const a = rnd(S), b = rnd(S); if (a === b || !eligSet[a].has(sq[b]) || !eligSet[b].has(sq[a])) continue;
        nsq[a] = sq[b]; nsq[b] = sq[a];
      } else {
        const k = rnd(S); let i;
        if (mv < 0.65) {                                 // a card sharing a nation / league / club with someone in the squad
          const other = sq[rnd(S)], g = rnd(3), L = byG[g].get([NAT, LG, CL][g][other]).filter(x => eligSet[k].has(x));
          if (!L.length) continue; i = L[rnd(L.length)];
        } else if (Tg && mv < 0.72) {                    // squad rating: a higher-rated card from the same league or nation
          const g = 1 - rnd(2), L = byG[g].get([NAT, LG][g][sq[k]]).filter(x => eligSet[k].has(x) && rat[x] > rat[sq[k]]);
          if (!L.length) continue; L.sort((a, b) => cost[a] - cost[b]); i = pickCheap(L);
        } else if (mv < 0.8 && R) {                      // a card that meets a requirement
          const r = rnd(R), L = elig[k].filter(x => rm[x][r]); if (!L.length) continue; i = pickCheap(L);
        } else i = pickCheap(elig[k]);
        if (i === sq[k]) continue;
        nsq[k] = i;
      }
      const ne = evaluate(nsq), d = ne.score - cur.score;
      if (d <= 0 || Math.random() < Math.exp(-d / T)) {
        sq = nsq; cur = ne;
        if (cur.pen === 0 && (!best || cur.cost < best.cost)) best = { cost: cur.cost, sq: sq.slice() };
      }
    }
  }
  return best;
}

// ---------- hybrid search: groups of "perfect links" (+ an Icon) ----------
// Many hybrid SBCs are solved by an Icon plus five pairs, each pair from the same club AND nation: with the Icon's +1
// to every league, each pair card gets club 1 + nation 1 + league 1 = 3 chem (33 total). Without an Icon, groups of
// three from one club and nation do the same. This builds those squads directly (cheapest first, every club / nation /
// league rule covered) and hands the best one to the exact solver as the price to beat.
function hybridSBC(req, pool, slots, ms = 2500) {
  const t0 = Date.now(), pr = req.priority || "gold_first", rules = req.rules || [];
  const cost = c => sbcCost(c, pr);
  const fits = sq => {                      // can these cards fill distinct slots? (bipartite matching)
    const match = new Array(slots.length).fill(-1);
    const tr = (i, seen) => { for (let j = 0; j < slots.length; j++) if (!seen[j] && sq[i].P.has(slots[j])) { seen[j] = true; if (match[j] < 0 || tr(match[j], seen)) { match[j] = i; return true; } } return false; };
    for (let i = 0; i < sq.length; i++) if (!tr(i, new Array(slots.length).fill(false))) return null;
    return match;
  };
  const iconMax = rules.filter(r => r.on === "color" && String(r.id) === "icon" && r.op !== ">=").reduce((m, r) => Math.min(m, r.n), 11);
  const icons = req.allow_icons && iconMax > 0 ? pool.filter(c => SBC_ICON.has(c.color)).sort((a, b) => cost(a) - cost(b)) : [];
  // units: the cheapest 2 (and 3) different players sharing a club and a nation
  const groups = new Map();
  for (const c of pool) { if (SBC_AUTO.has(c.color)) continue; const k = c.clubId + "|" + c.nationId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
  const units = [];
  for (const L of groups.values()) {
    L.sort((a, b) => cost(a) - cost(b));
    const seen = new Set(), U = [];
    for (const c of L) { const pk = playerKey(c); if (seen.has(pk)) continue; seen.add(pk); U.push(c); if (U.length === 3) break; }
    if (U.length >= 2) units.push({ cards: U.slice(0, 2), cost: cost(U[0]) + cost(U[1]) });
    if (U.length >= 3) units.push({ cards: U.slice(0, 3), cost: cost(U[0]) + cost(U[1]) + cost(U[2]) });
  }
  // units built around a card a rule asks for (e.g. a TOTW, or a player from a named club): that card plus the cheapest
  // partner(s) from its club and nation
  const need = rules.filter(r => r.op !== "<=" && r.n > 0 && !(r.on === "color" && ["icon", "debut_icon"].includes(String(r.id))));
  const unitOf = (L, k) => { const seen = new Set(), U = []; for (const c of L) { const pk = playerKey(c); if (seen.has(pk)) continue; seen.add(pk); U.push(c); if (U.length === k) break; } return U.length === k ? { cards: U, cost: U.reduce((a, c) => a + cost(c), 0) } : null; };
  for (const r of need) {
    const M = pool.filter(c => !SBC_AUTO.has(c.color) && ruleMatch(c, r)).sort((a, b) => cost(a) - cost(b)).slice(0, 25);
    for (const c of M) {
      const mates = (groups.get(c.clubId + "|" + c.nationId) || []).filter(x => playerKey(x) !== playerKey(c));
      for (const k of [1, 2]) { const u = unitOf(mates, k); if (u) units.push({ cards: [c, ...u.cards], cost: cost(c) + u.cost }); }
    }
  }
  // a squad rating target: units from cards near the target too (the cheapest pairs are often far below it)
  const tr = req.min_rating || 0;
  if (tr) for (const L of groups.values()) for (const k of [2, 3]) { const u = unitOf(L.filter(c => c.rating >= tr - 2), k); if (u) units.push(u); }
  // keep the cheapest units, the cheapest for every rule, and (with a rating target) the cheapest high-rated ones
  const pick = new Set(), byCost = units.slice().sort((a, b) => a.cost - b.cost);
  byCost.slice(0, 70).forEach(u => pick.add(u));
  for (const r of need) byCost.filter(u => u.cards.some(c => ruleMatch(c, r))).slice(0, 15).forEach(u => pick.add(u));
  if (tr) byCost.filter(u => u.cards.every(c => c.rating >= tr - 2)).slice(0, 50).forEach(u => pick.add(u));
  const U = [...pick].sort((a, b) => a.cost - b.cost);
  let best = null, nodes = 0;
  const minUnit = U.length ? U[0].cost / U[0].cards.length : 0;
  const tryHead = head => {                 // head: [] or [icon]
    // Unmet club / nation / league rules are covered first (branching only on units that meet one), then the rest is
    // filled with the cheapest units in order - far fewer squads to look at than trying everything.
    const dfs = (start, sq, c0, used) => {
      if (++nodes % 1024 === 0 && Date.now() - t0 > ms) return true;
      if (sq.length === 11) {
        const m = fits(sq); if (!m) return false;
        const ord = m.map(i => sq[i]);
        if (validSBC(req, ord) && (!best || c0 < best.cost)) best = { cost: c0, sq: ord };
        return false;
      }
      const left = 11 - sq.length;
      if (best && c0 + left * minUnit >= best.cost) return false;
      const unmet = need.filter(r => sq.filter(x => ruleMatch(x, r)).length < r.n);
      const ok = un => un.cards.length <= left && left - un.cards.length !== 1 && !un.cards.some(c => used.has(playerKey(c)));
      const go = (un, next) => {
        const nsq = sq.concat(un.cards);
        if (!fits(nsq)) return false;
        const nu = new Set(used); un.cards.forEach(c => nu.add(playerKey(c)));
        return dfs(next, nsq, c0 + un.cost, nu);
      };
      if (unmet.length) {
        const r = unmet[0];
        for (const un of U) {
          if (!ok(un) || !un.cards.some(c => ruleMatch(c, r))) continue;
          if (best && c0 + un.cost >= best.cost) break;
          if (go(un, start)) return true;
        }
        return false;
      }
      for (let u = start; u < U.length; u++) {
        const un = U[u]; if (!ok(un)) continue;
        if (best && c0 + un.cost >= best.cost) break;        // sorted by cost: nothing after is cheaper
        if (go(un, u + 1)) return true;
      }
      return false;
    };
    return dfs(0, head.slice(), head.reduce((a, c) => a + cost(c), 0), new Set(head.map(playerKey)));
  };
  // pairs only reach 3 chem with an Icon's league bonus, so with Icons allowed try them first; without, triples only
  for (const ic of icons.slice(0, 8)) if (tryHead([ic])) return best;
  if (!best) tryHead([]);
  return best;
}

// ---------- recipe search: the squads experienced players build for "N leagues / N nations" hybrids ----------
// Named clubs, no Icon (5 leagues / 5 nations style). Two recipes, each built slot by slot for this formation:
//  A: two named clubs from the SAME league (A, B) link through that league: a same-club-and-nation pair from A, plus
//     a nation chain - pairs from two other named clubs (C, D) and one player from B, all one nation (5 of a nation);
//     the last named club U has players in two leagues (e.g. a women's team): 3 from one league + 1 from the other who
//     shares a nation with one of the 3 (adds leagues and nations). U can't be A or B.
//  B: three named clubs (C, D, E) give a pair each, all one nation (6 of a nation: nation 2 + club 1), and 5 players
//     from the two same-league clubs (3 + 2 or 2 + 3, any nations: club 1 + league 2).
// Every squad is checked by validSBC, so a recipe can only miss, never return a wrong squad.
function recipeSBC(req, pool, slots, ms = 1500) {
  const t0 = Date.now(), pr = req.priority || "gold_first", cost = c => sbcCost(c, pr);
  const clubs = [...new Set((req.rules || []).filter(r => r.on === "club" && r.op !== "<=" && r.n > 0).map(r => r.id))];
  if (clubs.length < 3) return null;
  const P = pool.filter(c => !SBC_AUTO.has(c.color)).sort((a, b) => cost(a) - cost(b));
  const byClub = new Map(clubs.map(k => [k, P.filter(c => c.clubId === k)]));
  const slotTypes = [...new Set(slots)];
  const fits = sq => {
    const match = new Array(slots.length).fill(-1);
    const tr = (i, seen) => { for (let j = 0; j < slots.length; j++) if (!seen[j] && sq[i].P.has(slots[j])) { seen[j] = true; if (match[j] < 0 || tr(match[j], seen)) { match[j] = i; return true; } } return false; };
    for (let i = 0; i < sq.length; i++) if (!tr(i, new Array(slots.length).fill(false))) return null;
    return match;
  };
  // the cheapest cards that between them can play every position (2 per position, then the cheapest overall)
  const diverse = (L, k) => {
    const seen = new Set(), out = [], take = c => { const pk = playerKey(c); if (!seen.has(pk)) { seen.add(pk); out.push(c); } };
    for (const st of slotTypes) { let n = 0; for (const c of L) { if (n >= 2) break; if (c.P.has(st) && !seen.has(playerKey(c))) { take(c); n++; } } }
    for (const c of L) { if (out.length >= k) break; take(c); }
    return out.sort((a, b) => cost(a) - cost(b));
  };
  const grp = cards => ({ cards, cost: cards.reduce((a, c) => a + cost(c), 0) });
  const distinct = cards => new Set(cards.map(playerKey)).size === cards.length;
  const combos = (L, k) => { const out = []; const rec = (s, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < L.length; i++) { cur.push(L[i]); rec(i + 1, cur); cur.pop(); } }; rec(0, []); return out; };
  const pairs = (club, nat, k = 6) => {        // same club and nation (any league: a man + a woman counts too)
    const L = diverse((byClub.get(club) || []).filter(c => c.nationId === nat), k);
    return combos(L, 2).filter(distinct).filter(g => fits(g)).map(grp).sort((a, b) => a.cost - b.cost);
  };
  const leaguesOf = k => new Set((byClub.get(k) || []).map(c => c.leagueId));
  let best = null;
  const consider = sq => {
    if (sq.length !== 11 || !distinct(sq)) return;
    const m = fits(sq); if (!m) return;
    const ord = m.map(i => sq[i]), c = ord.reduce((a, x) => a + cost(x), 0);
    if ((!best || c < best.cost) && validSBC(req, ord)) best = { cost: c, sq: ord };
  };
  // depth-first over lists of groups (each list sorted by cost): cheapest combinations first, cost bound, slot check
  const assemble = lists => {
    const mins = lists.map(L => (L.length ? L[0].cost : Infinity));
    const rest = mins.map((_, i) => mins.slice(i).reduce((a, b) => a + b, 0));
    let n = 0;
    const dfs = (i, cur, c0) => {
      if (++n % 512 === 0 && Date.now() - t0 > ms) return true;
      if (i === lists.length) { consider(cur); return false; }
      for (const g of lists[i]) {
        if (best && c0 + g.cost + (rest[i + 1] || 0) >= best.cost) break;
        const nx = cur.concat(g.cards);
        if (!distinct(nx) || !fits(nx)) continue;
        if (dfs(i + 1, nx, c0 + g.cost)) return true;
      }
      return false;
    };
    return dfs(0, [], 0);
  };
  const nationsAt = k => new Set((byClub.get(k) || []).map(c => c.nationId));
  for (let a = 0; a < clubs.length; a++) for (let b = 0; b < clubs.length; b++) {
    if (a === b) continue;
    const A = clubs[a], B = clubs[b];
    for (const lg of [...leaguesOf(A)].filter(l => leaguesOf(B).has(l))) {       // e.g. Bayern + Dortmund (both genders share leagues too)
    const others = clubs.filter(k => k !== A && k !== B);
    // recipe B: a 5-player block from A + B (3 + 2) and a pair of one nation from each other named club
    if (b > a && others.length === 3) {
      const inA = diverse((byClub.get(A) || []).filter(c => c.leagueId === lg), 8), inB = diverse((byClub.get(B) || []).filter(c => c.leagueId === lg), 7);
      const blocks = [];
      for (const [X, Y] of [[inA, inB], [inB, inA]]) for (const x3 of combos(X.slice(0, 7), 3)) for (const y2 of combos(Y.slice(0, 6), 2)) { const g = [...x3, ...y2]; if (distinct(g) && fits(g)) blocks.push(grp(g)); }
      blocks.sort((p, q) => p.cost - q.cost);
      const nat3 = [...nationsAt(others[0])].filter(n => nationsAt(others[1]).has(n) && nationsAt(others[2]).has(n));
      for (const N of nat3) {
        const L = others.map(k => pairs(k, N).slice(0, 10)); if (L.some(x => !x.length)) continue;
        if (assemble([...L, blocks.slice(0, 400)])) return best;
      }
    }
    // recipe A: pair from A + chain (pairs from C and D + one from B, one nation) + two-league quad from U
    if (others.length === 3) for (const U of others) {
      const [C, D] = others.filter(k => k !== U), UL = byClub.get(U) || [];
      const ulg = [...new Set(UL.map(c => c.leagueId))]; if (ulg.length < 2) continue;
      const quads = [];
      for (const l1 of ulg) for (const l2 of ulg) {
        if (l1 === l2) continue;
        const men = diverse(UL.filter(c => c.leagueId === l1), 8), women = diverse(UL.filter(c => c.leagueId === l2), 6);
        for (const w of women) for (const t of combos(men, 3)) if (t.some(m => m.nationId === w.nationId)) { const g = [...t, w]; if (distinct(g) && fits(g)) quads.push(grp(g)); }
      }
      quads.sort((p, q) => p.cost - q.cost);
      const pA = [];
      for (const N of nationsAt(A)) pA.push(...pairs(A, N, 5).slice(0, 4));
      pA.sort((p, q) => p.cost - q.cost);
      for (const N of [...nationsAt(C)].filter(n => nationsAt(D).has(n) && nationsAt(B).has(n))) {
        const sB = diverse((byClub.get(B) || []).filter(c => c.nationId === N), 5).map(c => grp([c]));
        const L = [pairs(C, N).slice(0, 10), pairs(D, N).slice(0, 10), sB, pA.slice(0, 40), quads.slice(0, 200)];
        if (L.some(x => !x.length)) continue;
        if (assemble(L)) return best;
      }
    }
    }
  }
  return best;
}

// ---------- chem search: high-chem hybrids built player by player (no Icons) ----------
// Players are grouped into cells (same league, nation and club: chem only depends on how many of each are in the
// squad). Depth-first: required nations / clubs first, then the player furthest from full chem is fixed by adding a
// cell that shares his league, nation or club. A position check and "can every player still reach 3" prune the
// search; the width (cells tried per step) grows each round. Cards are picked per cell at the end (cheapest that fit).
function chemSearch(req, pool, slots, ms = 3000, opts = {}) {
  const t0 = Date.now(), pr = req.priority || "gold_first", cost = c => sbcCost(c, pr);
  const target = req.min_chem || 0, strict = target >= 33 || (req.min_player_chem || 0) >= 3;
  if (target < 27 && !strict) return null;
  const slack = strict ? 0 : 33 - target;
  const ST = [...new Set(slots)];
  const plan = opts.plan || null;          // optional: exactly these leagues, with these player counts
  const P = opts.P || pool.filter(c => !SBC_AUTO.has(c.color) && ST.some(s => c.P.has(s)) && (!plan || plan.has(c.leagueId))).sort((a, b) => cost(a) - cost(b));
  // ids for nations, leagues, clubs
  const ix = () => { const m = new Map(); return v => { if (!m.has(v)) m.set(v, m.size); return m.get(v); }; };
  const iN = ix(), iL = ix(), iK = ix();
  const cellOf = new Map(), cells = [];
  for (const c of P) {
    const key = c.leagueId + "|" + c.nationId + "|" + c.clubId;
    let cl = cellOf.get(key);
    if (!cl) { cl = { id: cells.length, n: iN(c.nationId), l: iL(c.leagueId), k: iK(c.clubId), cards: [], keys: new Set(), P: new Set() }; cellOf.set(key, cl); cells.push(cl); }
    const pk = playerKey(c);
    if (cl.keys.has(pk) || cl.cards.length >= 10) continue;
    cl.keys.add(pk); cl.cards.push(c); c.P.forEach(p => cl.P.add(p));
  }
  for (const cl of cells) { cl.cost = cl.cards.map(cost); cl.sample = cl.cards[0]; }
  const NN = 4096, cN = new Int16Array(NN), cL = new Int16Array(NN), cK = new Int16Array(NN);
  const index = (f) => { const m = new Map(); for (const cl of cells) { const g = f(cl); if (!m.has(g)) m.set(g, []); m.get(g).push(cl); } for (const L of m.values()) L.sort((a, b) => a.cost[0] - b.cost[0]); return m; };
  const byN = index(cl => cl.n), byL = index(cl => cl.l), byK = index(cl => cl.k);
  const lv = (v, T) => (v >= T[2] ? 3 : v >= T[1] ? 2 : v >= T[0] ? 1 : 0);
  const TN = [0, ...THRESH.n], TL = [0, ...THRESH.l], TK = [0, ...THRESH.k];
  const COMBOS = []; for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3 - a; b++) COMBOS.push([a, b, 3 - a - b]);
  const chemOf = cl => Math.min(3, lv(cN[cl.n], THRESH.n) + lv(cL[cl.l], THRESH.l) + lv(cK[cl.k], THRESH.k));
  // fewest more players one needs to reach 3 chem, by (nation, league, club) counts: a table, it's looked up a lot
  const NT = new Uint8Array(12 * 12 * 12);
  for (let x = 0; x < 12; x++) for (let y = 0; y < 12; y++) for (let z = 0; z < 12; z++) {
    let best = 99;
    for (const [a, b, d] of COMBOS) { const v = Math.max(TN[a] - x, TL[b] - y, TK[d] - z, 0); if (v < best) best = v; }
    NT[(x * 12 + y) * 12 + z] = best;
  }
  const LT = new Int16Array(NN).fill(-1);      // planned league sizes (by league index)
  // a plan gives each league a chem level: 0 = 1-2 players, 1 = 3-4, 2 = 5-7, 3 = 8+
  const LOW = [1, 3, 5, 8], HIGH = [2, 4, 7, 11], planL = [];
  if (plan) for (const [lg, a] of plan) { LT[iL(lg)] = a; planL.push(iL(lg)); }
  const NTL = new Uint8Array(4 * 12 * 12);
  for (let lvl = 0; lvl < 4; lvl++) for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) {
    let best = 99;
    for (let a = 0; a <= 3; a++) for (let d = 0; d <= 3; d++) if (a + lvl + d >= 3) { const v = Math.max(TN[a] - x, TK[d] - z, 0); if (v < best) best = v; }
    NTL[(lvl * 12 + x) * 12 + z] = best;
  }
  const lvL = v => (v >= 8 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0);
  // need: a guide (as if league counts could still grow, which steers toward filling leagues); needX: exact for a plan
  const need = plan ? (cl => NT[(Math.min(11, cN[cl.n]) * 12 + LT[cl.l]) * 12 + Math.min(11, cK[cl.k])])
    : (cl => NT[(Math.min(11, cN[cl.n]) * 12 + Math.min(11, cL[cl.l])) * 12 + Math.min(11, cK[cl.k])]);
  const needX = plan ? (cl => NTL[(lvL(LT[cl.l]) * 12 + Math.min(11, cN[cl.n])) * 12 + Math.min(11, cK[cl.k])]) : need;
  const maxAt = (cl, r) => Math.min(3, lv(cN[cl.n] + r, THRESH.n) + lv(cL[cl.l] + r, THRESH.l) + lv(cK[cl.k] + r, THRESH.k));
  // requirements
  const rules = req.rules || [];
  const sample = cl => cl.sample;
  const need1 = rules.filter(r => r.op !== "<=" && r.n > 0);
  const caps = rules.filter(r => r.op === "<=" || r.op === "=");
  const cellLevel = r => r.on === "nation" || r.on === "league" || r.on === "club";      // same answer for every card in a cell
  const cellRule = (cl, r) => cellLevel(r) ? ruleMatch(cl.sample, r) : cl.cards.some(c => ruleMatch(c, r));
  const ruleCells = need1.map(r => cells.filter(cl => cellRule(cl, r)).sort((a, b) => a.cost[0] - b.cost[0]));
  // pairs: two players from one club and nation (club +1 and nation +1 at once; the usual way to stretch a nation
  // across leagues). Same cell twice, or a men's + women's player of the same club.
  const units = [];
  for (const cl of cells) if (cl.cards.length >= 2) units.push({ cls: [cl, cl], c: cl.cost[0] + cl.cost[1] });
  for (const L of index(cl => cl.k * 4096 + cl.n).values()) for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length && b < a + 4; b++) if (L[a].l !== L[b].l) units.push({ cls: [L[a], L[b]], c: L[a].cost[0] + L[b].cost[0] });
  units.sort((a, b) => a.c - b.c);
  const unitsBy = (f) => { const m = new Map(); for (const u of units) { const g = f(u.cls[0]); if (!m.has(g)) m.set(g, []); const L = m.get(g); if (L.length < 40) L.push(u); } return m; };
  const uByN = unitsBy(cl => cl.n), uByK = unitsBy(cl => cl.k);
  const uByRule = need1.map(r => units.filter(u => u.cls.some(cl => cellRule(cl, r))).slice(0, 30));
  const minL = req.min_leagues || 0, maxL = req.max_leagues || 11, minN = req.min_nations || 0, maxN = req.max_nations || 11;
  const minK = req.min_clubs || 0, maxK = req.max_clubs || 11;
  const msN = req.max_same_nation || 11, msL = req.max_same_league || 11, msK = req.max_same_club || 11;
  const sq = [], mult = new Map(); let dN = 0, dL = 0, dK = 0;
  const add = cl => { sq.push(cl); mult.set(cl.id, (mult.get(cl.id) || 0) + 1); if (cN[cl.n]++ === 0) dN++; if (cL[cl.l]++ === 0) dL++; if (cK[cl.k]++ === 0) dK++; };
  const pop = () => { const cl = sq.pop(); mult.set(cl.id, mult.get(cl.id) - 1); if (--cN[cl.n] === 0) dN--; if (--cL[cl.l] === 0) dL--; if (--cK[cl.k] === 0) dK--; };
  const fitsPos = () => {                       // can the chosen cells fill distinct slots? (cell = any of its cards' positions)
    const match = new Array(slots.length).fill(-1);
    const tr = (i, seen) => { for (let j = 0; j < slots.length; j++) if (!seen[j] && sq[i].P.has(slots[j])) { seen[j] = true; if (match[j] < 0 || tr(match[j], seen)) { match[j] = i; return true; } } return false; };
    for (let i = 0; i < sq.length; i++) if (!tr(i, new Array(slots.length).fill(false))) return false;
    return true;
  };
  const ruleCount = r => { let m = 0; for (const cl of sq) if (cellRule(cl, r)) m++; return m; };
  // is the partial squad still completable (necessary conditions only)?
  const alive = () => {
    const r = 11 - sq.length;
    if (plan) { let lack = 0; for (const l of planL) { if (cL[l] > LT[l]) return false; lack += LT[l] - cL[l]; } if (lack !== 11 - sq.length) return false; }
    if (dL > maxL || dN > maxN || dK > maxK || dL + r < minL || dN + r < minN || dK + r < minK) return false;
    for (const cl of sq) if (cN[cl.n] > msN || cL[cl.l] > msL || cK[cl.k] > msK || mult.get(cl.id) > cl.cards.length) return false;
    let short = 0, pres = 0;
    for (const cl of sq) {
      if (strict) { if (needX(cl) > r) return false; pres += need(cl); }
      else { short += 3 - maxAt(cl, r); pres += 3 - chemOf(cl); }
    }
    if (short > slack) return false;
    let miss = 0; for (const ru of need1) miss = Math.max(miss, ru.n - ruleCount(ru));
    if (miss > r) return false;
    for (const ru of caps) if (ruleCount(ru) > ru.n) return false;
    let unmetN = 0; for (const ru of need1) unmetN += Math.max(0, ru.n - ruleCount(ru));
    return pres + 2 * (Math.max(0, minL - dL) + Math.max(0, minN - dN) + Math.max(0, minK - dK)) + 3 * unmetN;
  };
  const pressure = () => { let s = 2 * (Math.max(0, minL - dL) + Math.max(0, minN - dN) + Math.max(0, minK - dK)); for (const cl of sq) s += strict ? need(cl) : 3 - chemOf(cl); return s; };
  // cheapest cards for the chosen cells (min-cost flow: cell -> card -> slot)
  const assign = () => {
    const cs = [...new Set(sq)], cardNodes = [];
    cs.forEach((cl, ci) => cl.cards.forEach((c, j) => cardNodes.push({ ci, c, w: cl.cost[j] })));
    const S0 = 0, C0 = 1, D0 = C0 + cs.length, T0 = D0 + cardNodes.length, SK = T0 + slots.length, V = SK + 1;
    const G = Array.from({ length: V }, () => []);
    const edge = (u, v, cap, w) => { G[u].push({ v, cap, w, r: G[v].length }); G[v].push({ v: u, cap: 0, w: -w, r: G[u].length - 1 }); };
    cs.forEach((cl, ci) => edge(S0, C0 + ci, mult.get(cl.id), 0));
    cardNodes.forEach((cn, j) => { edge(C0 + cn.ci, D0 + j, 1, cn.w); slots.forEach((s, k) => { if (cn.c.P.has(s)) edge(D0 + j, T0 + k, 1, 0); }); });
    slots.forEach((s, k) => edge(T0 + k, SK, 1, 0));
    let flow = 0, tot = 0;
    while (flow < 11) {
      const dist = new Array(V).fill(Infinity), prev = new Array(V).fill(null), inq = new Array(V).fill(false), q = [S0]; dist[S0] = 0;
      while (q.length) { const u = q.shift(); inq[u] = false; G[u].forEach((e, ei) => { if (e.cap > 0 && dist[u] + e.w < dist[e.v]) { dist[e.v] = dist[u] + e.w; prev[e.v] = [u, ei]; if (!inq[e.v]) { inq[e.v] = true; q.push(e.v); } } }); }
      if (dist[SK] === Infinity) return null;
      for (let v = SK; v !== S0; v = prev[v][0]) { const [u, ei] = prev[v], e = G[u][ei]; e.cap--; G[v][e.r].cap++; }
      flow++; tot += dist[SK];
    }
    const out = new Array(11).fill(null);
    cardNodes.forEach((cn, j) => G[D0 + j].forEach(e => { if (e.v >= T0 && e.v < SK && e.cap === 0 && G[e.v][e.r].cap > 0) out[e.v - T0] = cn.c; }));
    return out.includes(null) ? null : { cost: tot, sq: out };
  };
  let best = null, nodes = 0, out = false;
  const lb = () => { let s = 0; const seen = new Map(); for (const cl of sq) { const j = seen.get(cl.id) || 0; seen.set(cl.id, j + 1); s += cl.cost[Math.min(j, cl.cost.length - 1)]; } return s; };
  const minCell = cells.length ? Math.min(...cells.map(cl => cl.cost[0])) : 0;
  const tried = new Set();
  const starts = cells.slice().sort((a, b) => a.cost[0] - b.cost[0]).slice(0, 300);
  const dfs = (W, budget) => {
    if (++nodes % 256 === 0 && Date.now() - t0 > ms) { out = true; return; }
    const r = 11 - sq.length;
    if (best && lb() + r * minCell >= best.cost) return;
    if (r === 0) {
      const sig = sq.map(cl => cl.id).sort((a, b) => a - b).join(","); if (tried.has(sig)) return; tried.add(sig);
      const a = assign(); if (!a) return;
      if (validSBC(req, a.sq) && (!best || a.cost < best.cost)) best = a;
      return;
    }
    // where to grow: an unmet requirement first, then the player furthest from full chem
    let cand = null;
    const unmet = need1.map((ru, i) => ruleCount(ru) < ru.n ? i : -1).filter(i => i >= 0);
    if (unmet.length && (!sq.length || rs % 2 === 0)) cand = unmet.flatMap(i => ruleCells[i].slice(0, 80));
    else if (unmet.length) {                // odd restarts: required cards or a fix for the weakest player, whichever scores best
      let worst = null, wv = -1;
      for (const cl of sq) { const v = strict ? need(cl) : 3 - chemOf(cl); if (v > wv) { wv = v; worst = cl; } }
      cand = unmet.flatMap(i => ruleCells[i].slice(0, 60));
      if (worst && wv > 0) cand = cand.concat(byK.get(worst.k) || [], (byN.get(worst.n) || []).slice(0, 100), (byL.get(worst.l) || []).slice(0, 100));
    }
    if (!cand) {
      let worst = null, wv = -1;
      for (const cl of sq) { const v = strict ? need(cl) : 3 - chemOf(cl); if (v > wv) { wv = v; worst = cl; } }
      if (!sq.length) cand = starts;
      else if (worst && wv > 0) cand = [...(byK.get(worst.k) || []), ...(byN.get(worst.n) || []).slice(0, 150), ...(byL.get(worst.l) || []).slice(0, 150)];
      else { const s = new Set(); cand = []; for (const cl of sq) for (const L of [byK.get(cl.k), (byN.get(cl.n) || []).slice(0, 40), (byL.get(cl.l) || []).slice(0, 40)]) for (const x of L || []) if (!s.has(x.id)) { s.add(x.id); cand.push(x); } }
    }
    // score each option: how close the squad gets to full chem, then cost
    const opts = [], seen = new Set();
    const match = new Array(slots.length).fill(-1);          // current squad on slots; each option only needs one more augmenting path
    const aug = (cl, i, seenS) => { for (let j = 0; j < slots.length; j++) if (!seenS[j] && cl.P.has(slots[j])) { seenS[j] = 1; if (match[j] < 0 || aug(sq[match[j]], match[j], seenS)) { match[j] = i; return true; } } return false; };
    for (let i = 0; i < sq.length; i++) aug(sq[i], i, new Uint8Array(slots.length));
    const canFit = cl => { const save = match.slice(); const ok = aug(cl, sq.length, new Uint8Array(slots.length)); for (let j = 0; j < save.length; j++) match[j] = save[j]; return ok; };
    for (const cl of cand) {
      if (seen.has(cl.id)) continue; seen.add(cl.id);
      if ((mult.get(cl.id) || 0) >= cl.cards.length) continue;
      if (!canFit(cl)) continue;
      add(cl);
      const pv = alive(); if (pv !== false) opts.push({ cl, p: pv + (noise ? noise * rand() : 0), c: cl.cost[0] });
      pop();
    }
    // pair moves (see units): toward the weakest player's nation or club, or an unmet requirement
    if (sq.length && 11 - sq.length >= 2) {
      let worst = null, wv = 0;
      for (const cl of sq) { const v = strict ? need(cl) : 3 - chemOf(cl); if (v > wv) { wv = v; worst = cl; } }
      const uc = [];
      if (worst) uc.push(...(uByN.get(worst.n) || []).slice(0, 30), ...(uByK.get(worst.k) || []).slice(0, 12));
      need1.forEach((ru, i) => { if (ruleCount(ru) < ru.n) uc.push(...uByRule[i].slice(0, 15)); });
      const seenU = new Set();
      for (const u of uc) {
        const [a, b] = u.cls, key = a.id + "|" + b.id; if (seenU.has(key)) continue; seenU.add(key);
        add(a); add(b);
        if ((mult.get(a.id) || 0) <= a.cards.length && (mult.get(b.id) || 0) <= b.cards.length && fitsPos()) { const pv = alive(); if (pv !== false) opts.push({ cls: [a, b], p: pv + (noise ? noise * rand() : 0), c: u.c }); }
        pop(); pop();
      }
    }
    opts.sort((a, b) => a.p - b.p || a.c - b.c);
    for (let i = 0; i < Math.min(W, opts.length) && i <= budget; i++) {
      const o = opts[i];
      if (o.cls) { add(o.cls[0]); add(o.cls[1]); dfs(W, budget - i); pop(); pop(); }
      else { add(o.cl); dfs(W, budget - i); pop(); }
      if (out) return;
    }
  };
  // limited discrepancy search: follow the best-scored option, allowing a few detours anywhere in the squad
  // first a full pass, then restarts that mix up the order a little (a different first choice can matter a lot)
  let bb = 0, rs = opts.rs0 || 0, noise = 0, seed = opts.seed || 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  if (plan) {                              // a league plan: a short full pass, then shuffled restarts until the time is up
    for (let b = 0; b <= 2; b++) { tried.clear(); dfs(10, b); if (out || best) break; }
    opts.exhausted = !out && nodes < 40;   // dead almost at once: no point coming back to this plan
    for (rs = 1; !out && !best && !opts.exhausted; rs++) { noise = 1.5; for (let b = 0; b <= 2; b++) { tried.clear(); dfs(10, b); if (out || best) break; } }
    return best;
  }
  for (; !out && !best; rs++) {
    noise = rs ? 1.5 : 0;
    for (let b = 0; b <= (rs ? 3 : 4); b++) { bb = b; tried.clear(); dfs(12, b); if (out || best) break; }
  }
  return best;
}

// The two searches are good at different puzzles, so they take turns: a quick free search, the league plans, then more
// of each (the free search restarts in a different order).
function hardSearch(req, pool, slots, ms = 8000) {
  const t0 = Date.now(), left = () => ms - (Date.now() - t0);
  let r = chemSearch(req, pool, slots, Math.min(1500, ms * 0.15));
  if (!r && left() > 0) r = planSearch(req, pool, slots, Math.min(left(), ms * 0.4));
  if (!r && left() > 0) r = chemSearch(req, pool, slots, Math.min(left(), ms * 0.15), { seed: 777, rs0: 1 });
  if (!r && left() > 0) r = planSearch(req, pool, slots, left(), { from: 1 });
  return r;
}

// League plans: which leagues the squad uses and how many players in each. With the plan fixed, every player's league
// chem is known up front, so the search above only has to sort out nations and clubs, which is quick. The plans are
// tried best-guess first, each for a short time, and the ones that ran out of time get longer in the next round.
function planSearch(req, pool, slots, ms = 8000, popts = {}) {
  const t0 = Date.now(), pr = req.priority || "gold_first";
  const P = pool.filter(c => !SBC_AUTO.has(c.color));
  const size = new Map(); P.forEach(c => size.set(c.leagueId, (size.get(c.leagueId) || 0) + 1));
  const rules = (req.rules || []).filter(r => r.op !== "<=" && r.n > 0);
  const lo = Math.max(1, req.min_leagues || 1), hi = Math.min(req.max_leagues || 11, lo + 1);
  // leagues for each required nation / club / league: most matching cards first, then the bigger league
  // a league that has players for several rules (e.g. Ligue 1 for Congo, Cameroon and Ghana) can hold them all in one block
  const ruleCnt = rules.map(r => { const m = new Map(); P.forEach(c => { if (ruleMatch(c, r)) m.set(c.leagueId, (m.get(c.leagueId) || 0) + 1); }); return m; });
  const cover = l => ruleCnt.filter(m => m.has(l)).length;
  const ruleLeagues = ruleCnt.map(m => [...m.keys()].sort((a, b) => (cover(b) - cover(a)) || (Math.min(3, m.get(b)) - Math.min(3, m.get(a))) || (size.get(b) - size.get(a))).slice(0, 5));
  // extra leagues: share the most nations with the rule cards' leagues (the links between leagues are nations)
  const anchor = new Set(ruleLeagues.flatMap(L => L.slice(0, 2)));
  const natsIn = new Map(); P.forEach(c => { if (!natsIn.has(c.leagueId)) natsIn.set(c.leagueId, new Map()); const m = natsIn.get(c.leagueId); m.set(c.nationId, (m.get(c.nationId) || 0) + 1); });
  const anchorNat = new Map(); for (const l of anchor) for (const [n, k] of natsIn.get(l) || []) anchorNat.set(n, (anchorNat.get(n) || 0) + k);
  // the other league of a club with a men's and a women's team links two leagues through club chem
  const lgOfClub = new Map(); P.forEach(c => { if (!lgOfClub.has(c.clubId)) lgOfClub.set(c.clubId, new Set()); lgOfClub.get(c.clubId).add(c.leagueId); });
  const twin = new Map(); for (const L of lgOfClub.values()) if (L.size > 1) for (const a of L) for (const b of L) if (a !== b && anchor.has(a)) twin.set(b, (twin.get(b) || 0) + 1);
  const extras0 = [...size.keys()].filter(l => size.get(l) >= 40).map(l => {
    let sc = 0; for (const [n, k] of natsIn.get(l)) if (anchorNat.has(n)) sc += Math.min(k, anchorNat.get(n));
    return [l, sc];
  }).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  // big men's + women's league pairs (Premier League + WSL, LALIGA + Liga F, ...): one player in each, linked by a club
  const pairCnt = new Map();
  for (const L of lgOfClub.values()) if (L.size === 2) { const [a, b] = [...L].sort((x, y) => x - y); const k = a + "|" + b; pairCnt.set(k, (pairCnt.get(k) || 0) + 1); }
  const pairs = [...pairCnt].filter(e => e[1] >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4).map(e => e[0].split("|").map(Number));
  // extras come in units: a men's + women's pair counts as one choice. (A rule's second league, e.g. its women's team,
  // can be an extra too: the set only ever holds each league once.)
  const singles = [...new Set([...ruleLeagues.flatMap(L => L.slice(1, 2)), ...[...twin.keys()].sort((a, b) => twin.get(b) - twin.get(a)).slice(0, 3), ...extras0])].slice(0, 10);
  const units = [];
  for (let i = 0; i < Math.max(pairs.length, singles.length); i++) { if (pairs[i]) units.push(pairs[i]); if (singles[i] != null) units.push([singles[i]]); }
  const extras = [...new Set(units.flat())];
  // league sets: one league per rule, then extras to reach the league count; lower rank = more promising
  const sets = [], seenSet = new Set();
  const pushSet = (S, rank) => { const k = [...S].sort((a, b) => a - b).join(","); if (!seenSet.has(k)) { seenSet.add(k); sets.push({ L: [...S], rank }); } };
  const addExtras = (S, rank) => {
    for (let m = lo; m <= hi; m++) {
      if (S.size > m) continue;
      const k = m - S.size;
      const rec = (j, T, rk) => {
        if (T.size === k) { pushSet(new Set([...S, ...T]), rank + rk + (m - lo) * 4); return; }
        for (let q = j; q < units.length; q++) {
          const add = units[q].filter(l => !S.has(l) && !T.has(l)); if (!add.length || T.size + add.length > k) continue;
          rec(q + 1, new Set([...T, ...add]), rk + q);
        }
      };
      rec(0, new Set(), 0);
    }
  };
  const pickRules = (i, S, rank) => {
    if (i === rules.length) { addExtras(S, rank + 6 * Math.max(0, S.size - 1)); return; }      // fewer rule leagues: one block holds them
    ruleLeagues[i].forEach((l, q) => { const S2 = new Set(S); S2.add(l); pickRules(i + 1, S2, rank + q * 2); });
  };
  pickRules(0, new Set(), 0);
  sets.sort((a, b) => a.rank - b.rank); sets.length = Math.min(sets.length, 250);
  // which leagues share a club (a men's and a women's team): a league with 1 player needs that link for club chem
  const shareClub = new Set();
  for (const L of lgOfClub.values()) if (L.size > 1) for (const a of L) for (const b of L) if (a !== b) shareClub.add(a + "|" + b);
  // players per league: fewest players without league chem first (3-3-3-2 before 5-3-2-1), counts on a chem step
  // (3, 5, 8) before the in-between ones (4, 6, 7: only useful for club or nation counts)
  const shapeCache = new Map(), permCache = new Map();
  const shapes = m => { if (shapeCache.has(m)) return shapeCache.get(m); const out = []; const rec = (left, k, maxv, cur) => { if (k === 0) { if (!left) out.push(cur); return; } for (let v = Math.min(maxv, left - (k - 1)); v >= 1; v--) rec(left - v, k - 1, v, cur.concat(v)); }; rec(11, m, 8, []);
    // chem the players still need from nation + club (3 minus their league chem, summed), plus a little per league of
    // 1-2 players (each needs a club link): smallest first
    const lv3 = v => (v >= 8 ? 3 : v >= 5 ? 2 : v >= 3 ? 1 : 0), sc = sh => sh.reduce((a, v) => a + (3 - lv3(v)) * v, 0) + 3 * sh.filter(v => v < 3).length + sh.filter(v => v === 4 || v === 6).length * 2;
    out.sort((a, b) => sc(a) - sc(b)); shapeCache.set(m, out); return out; };
  const perms = A => { const key = A.join(","); if (permCache.has(key)) return permCache.get(key); const out = new Set(); const rec = (cur, rest) => { if (!rest.length) { out.add(cur.join(",")); return; } rest.forEach((v, i) => rec(cur.concat(v), rest.slice(0, i).concat(rest.slice(i + 1)))); }; rec([], A); const r = [...out].map(x => x.split(",").map(Number)); permCache.set(key, r); return r; };
  const jobs = [];
  sets.forEach(({ L: S }, si) => {
    const byCap = S.slice().sort((a, b) => size.get(b) - size.get(a));          // biggest league gets the biggest count first
    shapes(S.length).slice(0, 20).forEach((sh, hi2) => perms(sh).forEach(pm => {
      // a league with one player needs club chem from a club it shares with another league in the set
      if (pm.some((v, i) => v === 1 && !byCap.some(l2 => l2 !== byCap[i] && shareClub.has(byCap[i] + "|" + l2)))) return;
      let dev = 0; for (let i = 0; i < pm.length; i++) dev += Math.abs(pm[i] - sh[i]);
      jobs.push({ plan: new Map(byCap.map((l, i) => [l, pm[i]])), pri: si * 0.4 + hi2 + dev * 0.15 });
    }));
  });
  jobs.sort((a, b) => a.pri - b.pri); if (jobs.length > 8000) jobs.length = 8000;
  const ST = [...new Set(slots)], cost = c => sbcCost(c, pr);
  const byLg = new Map(); P.filter(c => ST.some(s => c.P.has(s))).sort((a, b) => cost(a) - cost(b)).forEach(c => { if (!byLg.has(c.leagueId)) byLg.set(c.leagueId, []); byLg.get(c.leagueId).push(c); });
  const poolOf = plan => [...plan.keys()].flatMap(l => byLg.get(l) || []).sort((a, b) => cost(a) - cost(b));
  let best = null, tries = 0;
  for (let slice = popts.from ? 150 : 40; Date.now() - t0 < ms && jobs.length; slice *= 3) {
    for (const j of jobs) {
      if (j.done) continue;
      const left = ms - (Date.now() - t0); if (left <= 0) break;
      const o = { plan: j.plan, maxB: 5, P: poolOf(j.plan) };
      const r = chemSearch(req, pool, slots, Math.min(slice, left), o);
      if (o.exhausted) j.done = true;
      tries++;
      if (r && (!best || r.cost < best.cost)) { best = r; return best; }
    }
    if (jobs.every(j => j.done)) break;
  }
  return best;
}

// ---------- cell model: an exact search over "how many players from each cell" ----------
// Cards with the same league, nation and club give the same chem, so the solver only picks how many to take from
// each such cell (and for which positions); the cards themselves are chosen at the end. Far smaller than one
// variable per card per slot, which lets the exact solver finish hard full-chem hybrids on a focused card pool
// (e.g. only cards from the named clubs). Full chem only, no Icons; nation / league / club rules only.
function cellModelOK(req) {
  const full = (req.min_chem || 0) >= 33 || (req.min_player_chem || 0) >= 3;
  return full && !req.min_rating && !req.min_types && !req.max_types && !(req.include || []).length &&
    (req.rules || []).every(r => r.on === "nation" || r.on === "league" || r.on === "club");
}
function cellSBC(highs, req, pool, slots, timeLimit = 10) {
  if (!cellModelOK(req)) return null;
  const pr = req.priority || "gold_first", cost = c => sbcCost(c, pr);
  const PT = [...new Set(slots)], dem = new Map(PT.map(p => [p, slots.filter(s => s === p).length]));
  const cellMap = new Map(), cells = [];
  for (const c of pool.filter(c => !SBC_AUTO.has(c.color) && PT.some(p => c.P.has(p))).sort((a, b) => cost(a) - cost(b))) {
    const key = c.leagueId + "|" + c.nationId + "|" + c.clubId;
    let cl = cellMap.get(key); if (!cl) { cl = { i: cells.length, l: c.leagueId, n: c.nationId, k: c.clubId, cards: [], keys: new Set() }; cellMap.set(key, cl); cells.push(cl); }
    const pk = playerKey(c); if (cl.keys.has(pk) || cl.cards.length >= 24) continue; cl.keys.add(pk); cl.cards.push(c);
  }
  if (cells.length > 2500) return null;
  const rows = [], ints = [], bins = [], bounds = []; let rc = 0;
  const row = (t, op, rhs) => { if (!t.length) { return; } rows.push(` r${rc++}: ` + wrap(t.map(([a, v], j) => (j ? (a >= 0 ? "+ " : "- ") : (a < 0 ? "- " : "")) + (Math.abs(a) === 1 ? "" : Math.abs(a) + " ") + v).join(" ")) + ` ${op} ${rhs}`); };
  const X = [], obj = [];
  for (const cl of cells) {
    cl.vars = [];
    PT.forEach((p, pi) => {
      const L = cl.cards.filter(c => c.P.has(p)); if (!L.length) return;
      const v = `x${cl.i}_${pi}`; ints.push(v); bounds.push(` 0 <= ${v} <= ${Math.min(dem.get(p), L.length)}`);
      cl.vars.push(v); X.push({ v, cl, p }); obj.push([cost(L[0]), v]);
    });
    cl.u = "u" + cl.i; bins.push(cl.u);
    row(cl.vars.map(v => [1, v]), "<=", cl.cards.length);
    row([...cl.vars.map(v => [1, v]), [-11, cl.u]], "<=", 0);
    row([...cl.vars.map(v => [-1, v]), [1, cl.u]], "<=", 0);
  }
  for (const p of PT) row(X.filter(x => x.p === p).map(x => [1, x.v]), "=", dem.get(p));
  const groups = { n: new Map(), l: new Map(), k: new Map() };
  for (const cl of cells) for (const [t, g] of [["n", cl.n], ["l", cl.l], ["k", cl.k]]) { if (!groups[t].has(g)) groups[t].set(g, []); groups[t].get(g).push(cl); }
  const Z = new Map(); let zc = 0;
  for (const t of ["n", "l", "k"]) for (const [g, mem] of groups[t]) {
    const terms = mem.flatMap(cl => cl.vars.map(v => [1, v])), maxP = mem.reduce((a, cl) => a + cl.cards.length, 0);
    const zs = [];
    // g: the group is in the squad (set by any of its cells). A step at t players needs t - 1 OTHER players: written as
    // (t-1) z <= count - g, which is the same at whole numbers but much tighter for the solver's estimates
    const gv = "g" + zc++; bins.push(gv); mem.forEach(cl => row([[1, gv], [-1, cl.u]], ">=", 0));
    for (const th of THRESH[t]) { if (maxP < th) break; const z = "z" + zc++; bins.push(z); zs.push(z); row([...terms, [-th, z]], ">=", 0); if (!cellSBC.loose) row([...terms, [-(th - 1), z], [-1, gv]], ">=", 0); if (zs.length > 1) row([[1, z], [-1, zs[zs.length - 2]]], "<=", 0); }
    Z.set(t + g, zs);
  }
  // every cell in use: 3 chem from its nation, league and club counts
  for (const cl of cells) row([...[...(Z.get("n" + cl.n) || []), ...(Z.get("l" + cl.l) || []), ...(Z.get("k" + cl.k) || [])].map(z => [1, z]), [-3, cl.u]], ">=", 0);
  let wc = 0;
  for (const [kind, t] of [["nation", "n"], ["league", "l"], ["club", "k"]]) {
    const lo = req[`min_${kind}s`], hi = req[`max_${kind}s`], ms = req[`max_same_${kind}`], mn = req[`min_same_${kind}`];
    if (lo || hi) {
      const ws = [];
      for (const mem of groups[t].values()) {
        const w = "w" + wc++; bins.push(w); ws.push(w);
        if (lo) row([[1, w], ...mem.map(cl => [-1, cl.u])], "<=", 0);
        if (hi) mem.forEach(cl => row([[1, w], [-1, cl.u]], ">=", 0));
      }
      if (lo) row(ws.map(w => [1, w]), ">=", lo);
      if (hi) row(ws.map(w => [1, w]), "<=", hi);
    }
    if (ms) for (const mem of groups[t].values()) row(mem.flatMap(cl => cl.vars.map(v => [1, v])), "<=", ms);
    if (mn) { const ws = []; for (const mem of groups[t].values()) { const w = "w" + wc++; bins.push(w); ws.push(w); row([...mem.flatMap(cl => cl.vars.map(v => [1, v])), [-mn, w]], ">=", 0); } row(ws.map(w => [1, w]), ">=", 1); }
  }
  for (const r of req.rules || []) {
    const t = cells.filter(cl => ruleMatch(cl.cards[0], r)).flatMap(cl => cl.vars.map(v => [1, v]));
    if (!t.length) { if (r.op !== "<=" && r.n > 0) return null; continue; }
    row(t, r.op === "<=" ? "<=" : r.op === "=" ? "=" : ">=", r.n);
  }
  const lp = ["Minimize", " obj: " + wrap(obj.map(([a, v], j) => (j ? "+ " : "") + a + " " + v).join(" ")), "Subject To", ...rows, "Bounds", ...bounds,
    "General", ...chunk(ints), "Binary", ...chunk(bins), "End"].join("\n");
  let res;
  try { res = highs.solve(lp, Object.assign({ time_limit: Math.max(1, timeLimit), mip_rel_gap: 1, presolve: "on", output_flag: false }, cellSBC.opts || {})); } catch (e) { return null; }
  if (!res.Columns || !(res.Status === "Optimal" || res.Status === "Time limit reached")) return null;
  // cards: the cheapest that fill the slots with these many from each cell (min-cost flow: cell -> card -> slot)
  const cnt = new Map();
  for (const x of X) { const v = res.Columns[x.v]; if (v && v.Primal > 0.5) cnt.set(x.cl, (cnt.get(x.cl) || 0) + Math.round(v.Primal)); }
  const used = [...cnt.keys()]; if (used.reduce((a, cl) => a + cnt.get(cl), 0) !== 11) return null;
  const cardN = []; used.forEach((cl, ci) => cl.cards.forEach(c => cardN.push({ ci, c, w: cost(c) })));
  const S0 = 0, C0 = 1, D0 = C0 + used.length, T0 = D0 + cardN.length, SK = T0 + slots.length, V = SK + 1;
  const G = Array.from({ length: V }, () => []);
  const edge = (u, v, cap, w) => { G[u].push({ v, cap, w, r: G[v].length }); G[v].push({ v: u, cap: 0, w: -w, r: G[u].length - 1 }); };
  used.forEach((cl, ci) => edge(S0, C0 + ci, cnt.get(cl), 0));
  cardN.forEach((cn, j) => { edge(C0 + cn.ci, D0 + j, 1, cn.w); slots.forEach((s, k) => { if (cn.c.P.has(s)) edge(D0 + j, T0 + k, 1, 0); }); });
  slots.forEach((s, k) => edge(T0 + k, SK, 1, 0));
  let tot = 0;
  for (let f = 0; f < 11; f++) {
    const dist = new Array(V).fill(Infinity), prev = new Array(V).fill(null), inq = new Array(V).fill(false), q = [S0]; dist[S0] = 0;
    while (q.length) { const u = q.shift(); inq[u] = false; G[u].forEach((e, ei) => { if (e.cap > 0 && dist[u] + e.w < dist[e.v]) { dist[e.v] = dist[u] + e.w; prev[e.v] = [u, ei]; if (!inq[e.v]) { inq[e.v] = true; q.push(e.v); } } }); }
    if (dist[SK] === Infinity) return null;
    for (let v = SK; v !== S0; v = prev[v][0]) { const [u, ei] = prev[v], e = G[u][ei]; e.cap--; G[v][e.r].cap++; }
    tot += dist[SK];
  }
  const sq = new Array(11).fill(null);
  cardN.forEach((cn, j) => G[D0 + j].forEach(e => { if (e.v >= T0 && e.v < SK && e.cap === 0 && G[e.v][e.r].cap > 0) sq[e.v - T0] = cn.c; }));
  if (sq.includes(null) || !validSBC(req, sq)) return null;
  return { cost: tot, sq };
}

// ---------- link template: the shape most hard 33-chem hybrids take (no Icons) ----------
// 11 = a 4-player club block + a 3-player league block + two 2-player club pairs:
//  - club block: 4 from one club (club +2). All in one league (league +1), or 3 in one league + 1 from the club's other
//    league (e.g. its women's team) who shares a nation with one of the 3.
//  - league block: a same-club, same-nation pair plus one "link" player, all in one league (league +1).
//  - two pairs, each from one club and of the link player's nation (club +1). With the link player that nation has 5
//    (nation +2), which carries the pairs and the link player.
// Any clubs, nations and leagues: the rules only decide which pieces are tried first. Every squad is checked by
// validSBC, so this can only miss, never return a wrong squad.
function linkSBC(req, pool, slots, ms = 3000) {
  if (!cellModelOK(req)) return null;
  const t0 = Date.now(), pr = req.priority || "gold_first", cost = c => sbcCost(c, pr);
  const ST = [...new Set(slots)];
  const P = pool.filter(c => !SBC_AUTO.has(c.color) && ST.some(s => c.P.has(s))).sort((a, b) => cost(a) - cost(b));
  const rules = (req.rules || []).filter(r => r.op !== "<=" && r.n > 0);
  const fits = sq => {
    const match = new Array(slots.length).fill(-1);
    const tr = (i, seen) => { for (let j = 0; j < slots.length; j++) if (!seen[j] && sq[i].P.has(slots[j])) { seen[j] = true; if (match[j] < 0 || tr(match[j], seen)) { match[j] = i; return true; } } return false; };
    for (let i = 0; i < sq.length; i++) if (!tr(i, new Array(slots.length).fill(false))) return null;
    return match;
  };
  const group = key => { const m = new Map(); for (const c of P) { const k = key(c); if (!m.has(k)) m.set(k, []); const L = m.get(k); if (!L.some(x => playerKey(x) === playerKey(c))) L.push(c); } return m; };
  const byCN = group(c => c.clubId + "|" + c.nationId), byClub = group(c => c.clubId);
  const cov = cards => rules.map(r => cards.some(c => ruleMatch(c, r)));
  const pieceCost = cards => cards.reduce((a, c) => a + cost(c), 0);
  // the cheapest few cards of a list that can fill different positions
  const diverse = (L, k) => { const out = [], seen = new Set();
    for (const c of L) if (out.length < 4 && rules.some(r => ruleMatch(c, r)) && !rules.every(r => r.on === "club")) { seen.add(c.id); out.push(c); }   // players a nation rule asks for first
    for (const st of ST) { let n = 0; for (const c of L) { if (n >= 2) break; if (c.P.has(st) && !seen.has(c.id)) { seen.add(c.id); out.push(c); n++; } } } for (const c of L) { if (out.length >= k) break; if (!seen.has(c.id)) { seen.add(c.id); out.push(c); } } return out.sort((a, b) => cost(a) - cost(b)); };
  const combos = (L, k) => { const out = []; const rec = (s, cur) => { if (cur.length === k) { out.push(cur.slice()); return; } for (let i = s; i < L.length; i++) { cur.push(L[i]); rec(i + 1, cur); cur.pop(); } }; rec(0, []); return out; };
  // pairs: same club and nation (any leagues)
  const pairsByNat = new Map(), pairsInLeague = new Map();
  for (const L of byCN.values()) {
    if (L.length < 2) continue;
    for (const g of combos(diverse(L, 5), 2)) {
      const pc = { cards: g, cost: pieceCost(g), nat: g[0].nationId };
      if (!pairsByNat.has(pc.nat)) pairsByNat.set(pc.nat, []); pairsByNat.get(pc.nat).push(pc);
      if (g[0].leagueId === g[1].leagueId) { const l = g[0].leagueId; if (!pairsInLeague.has(l)) pairsInLeague.set(l, []); pairsInLeague.get(l).push(pc); }
    }
  }
  for (const m of [pairsByNat, pairsInLeague]) for (const L of m.values()) L.sort((a, b) => a.cost - b.cost);
  // club blocks of 4
  const quads = [];
  // clubs worth a block: those with players a rule asks for, plus the 40 cheapest others
  const cheapClubs = new Set([...byClub.entries()].filter(([k, L]) => L.length >= 4).sort((a, b) => pieceCost(a[1].slice(0, 4)) - pieceCost(b[1].slice(0, 4))).slice(0, 40).map(e => e[0]));
  for (const [club, L] of byClub) {
    if (L.length < 4 || !(cheapClubs.has(club) || L.some(c => rules.some(r => ruleMatch(c, r))))) continue;
    const start = quads.length;
    const byLg = new Map(); L.forEach(c => { if (!byLg.has(c.leagueId)) byLg.set(c.leagueId, []); byLg.get(c.leagueId).push(c); });
    for (const [l1, A] of byLg) {
      const a = diverse(A, 7);
      if (A.length >= 4) for (const g of combos(a, 4)) quads.push(g);
      for (const [l2, B] of byLg) if (l2 !== l1 && A.length >= 3) for (const w of diverse(B, 6)) for (const g of combos(a, 3)) if (g.some(x => x.nationId === w.nationId)) quads.push([...g, w]);
    }
    // each club's own quads cheapest first, ranked so clubs take turns
    const mine = quads.splice(start).filter(g => fits(g)).map(g => ({ cards: g, cost: pieceCost(g), nc: cov(g).filter(Boolean).length, nn: new Set(g.map(c => c.nationId)).size }))
      .sort((a, b) => b.nc - a.nc || ((req.min_nations || 0) >= 4 ? b.nn - a.nn : 0) || a.cost - b.cost).slice(0, 60);
    mine.forEach((q, i) => { q.rank = i; quads.push(q); });
  }
  const Q = quads.sort((a, b) => b.nc - a.nc || a.rank - b.rank || a.cost - b.cost);
  const singlesBy = group(c => c.nationId + "|" + c.leagueId);
  // chain nations: at least two pairs, best when they cover rules
  const chainNats = [...pairsByNat.keys()].filter(n => pairsByNat.get(n).length >= 2)
    .map(n => ({ n, sc: rules.filter(r => P.some(c => c.nationId === n && ruleMatch(c, r))).length * 1000 - pairsByNat.get(n)[0].cost / 100 }))
    .sort((a, b) => b.sc - a.sc).map(e => e.n);
  let best = null, n = 0;
  const done = () => (++n % 64 === 0 && Date.now() - t0 > ms);
  const covered = (cur) => rules.map(r => cur.some(c => ruleMatch(c, r)));
  // can the rules still open be covered by the pieces left? (each piece is one club; only the block pair brings a
  // nation other than N)
  const openOf = cur => rules.filter(r => !cur.some(c => ruleMatch(c, r)));
  const feasible = (cur, pieces, bpLeft) => {
    const o = openOf(cur);
    if (o.filter(r => r.on === "club").length > pieces || o.filter(r => r.on === "league").length > pieces ||
      o.filter(r => r.on === "nation" && r.id !== N0).length > (bpLeft ? 1 : 0)) return false;
    // nations: only the block pair can still bring one besides N; leagues: at most 1 (block) + 2 per pair left
    const nats = new Set(cur.map(c => c.nationId)); nats.add(N0);
    if (nats.size + (bpLeft ? 1 : 0) < (req.min_nations || 0)) return false;
    const pairsLeft = Math.min(2, pieces - (bpLeft ? 2 : pieces >= 3 ? 1 : 0));
    return new Set(cur.map(c => c.leagueId)).size + (bpLeft ? 1 : 0) + 2 * pairsLeft >= (req.min_leagues || 0);
  };
  let N0 = null;
  // pieces covering an open rule first; when every piece left has to cover one (as many open club or league rules
  // as pieces), only those
  const order = (L, cur, k, pieces) => {
    const o = openOf(cur), h = x => o.some(r => (x.cards || [x]).some(c => ruleMatch(c, r)));
    const must = o.filter(r => r.on === "club").length >= pieces || o.filter(r => r.on === "league").length >= pieces;
    const a = L.filter(h).slice(0, 40); return must ? a : a.concat(L.filter(x => !h(x)).slice(0, k));
  };
  for (const N of chainNats) {
    N0 = N;
    const NPall = pairsByNat.get(N);
    for (const q of Q) {
      if (done()) return best;
      if (!feasible(q.cards, 4, true)) continue;
      // league block: a pair in league X + a link player of nation N in X
      for (const [X, BP] of pairsInLeague) {
        const links0 = singlesBy.get(N + "|" + X); if (!links0) continue;
        for (const bp of order(BP, q.cards, 12, 4)) {
          const cur0 = q.cards.concat(bp.cards);
          if (!feasible(cur0, 3, false) || new Set(cur0.map(playerKey)).size !== 6 || !fits(cur0)) continue;
          for (const s of order(links0, cur0, 6, 3)) {
            const cur1 = cur0.concat(s);
            if (!feasible(cur1, 2, false) || new Set(cur1.map(playerKey)).size !== cur1.length || !fits(cur1)) continue;
            const NP = order(NPall, cur1, 30, 2);
            for (let i = 0; i < NP.length; i++) {
              const c2 = cur1.concat(NP[i].cards);
              if (!feasible(c2, 1, false) || new Set(c2.map(playerKey)).size !== c2.length || !fits(c2)) continue;
              if (done()) return best;
              for (let j = i + 1; j < NP.length; j++) {
                const sq = c2.concat(NP[j].cards);
                if (new Set(sq.map(playerKey)).size !== 11) continue;
                const c = pieceCost(sq); if (best && c >= best.cost) continue;
                const m = fits(sq); if (!m) continue;
                const ord = m.map(k => sq[k]);
                if (validSBC(req, ord)) { best = { cost: c, sq: ord }; return best; }
              }
            }
          }
        }
      }
    }
  }
  return best;
}

// Independent check that a squad meets every requirement (used to verify every answer).
function validSBC(req, sq) {
  if (sq.length !== 11 || sq.some(x => !x)) return false;
  if (new Set(sq.map(playerKey)).size !== 11) return false;
  const ex = new Set((req.exclude || []).map(String)); if (sq.some(x => ex.has(x.id))) return false;
  const ch = sbcChem(sq), chem = ch.reduce((a, b) => a + b, 0);
  if (req.min_rating) { const tot = sq.reduce((a, x) => a + x.rating, 0), avg = tot / 11, e = sq.reduce((a, x) => a + Math.max(0, x.rating - avg), 0); if (tot + e < 11 * req.min_rating - 1e-9) return false; }
  if (req.min_chem && chem < req.min_chem) return false;
  if (req.min_player_chem && ch.some(h => h < req.min_player_chem)) return false;
  if (req.min_types && new Set(sq.map(sbcType)).size < req.min_types) return false;
  if (req.max_types && new Set(sq.map(sbcType)).size > req.max_types) return false;
  if (req.min_card_rating && sq.some(x => x.rating < req.min_card_rating)) return false;
  if (req.max_card_rating && sq.some(x => x.rating > req.max_card_rating)) return false;
  for (const [kind, key] of [["nation", "nationId"], ["league", "leagueId"], ["club", "clubId"]]) {
    const cnt = new Map(); sq.forEach(x => cnt.set(x[key], (cnt.get(x[key]) || 0) + 1));
    const d = cnt.size, b = Math.max(...cnt.values());
    if (req[`min_${kind}s`] && d < req[`min_${kind}s`]) return false;
    if (req[`max_${kind}s`] && d > req[`max_${kind}s`]) return false;
    if (req[`min_same_${kind}`] && b < req[`min_same_${kind}`]) return false;
    if (req[`max_same_${kind}`] && b > req[`max_same_${kind}`]) return false;
  }
  for (const r of req.rules || []) { const n = sq.filter(x => ruleMatch(x, r)).length; if (r.op === ">=" ? n < r.n : r.op === "<=" ? n > r.n : n !== r.n) return false; }
  for (const id of req.include || []) if (!sq.some(x => x.id === String(id))) return false;
  return true;
}

// ---------- solve ----------
function sbcResult(best, proven, FORMS, ncand) {
  const ch = sbcChem(best.sq);
  return {
    formation: best.form, proven, cost: best.cost,
    rating: teamRatingOf(best.sq.map(x => x.rating)), chem: ch.reduce((a, b) => a + b, 0),
    players: best.sq.map((x, k) => ({ id: x.id, name: x.name, rating: x.rating, color: x.color, position: x.position, slot: FORMS[best.form][k], nationId: x.nationId, leagueId: x.leagueId, clubId: x.clubId, chem: ch[k] })),
    candidates: ncand,
  };
}
// highs: the loaded HiGHS module. FORMS: {formation: [11 positions]}. progress(text) for status updates.
// "Card types: Min 4+" needs gold, silver and bronze plus specials. Saying so as rules steers the fast search to them
// (the final check and the exact solver still use the real requirement).
function typeGuide(req) {
  const k = req.min_types || 0;
  if (k < 4 || req.max_types && req.max_types < k) return req;
  const rr = ["gold", "silver", "bronze"].map(id => ({ on: "rarity", id, op: ">=", n: 1 })).concat([{ on: "rarity", id: "special", op: ">=", n: k - 3 }]);
  return Object.assign({}, req, { rules: (req.rules || []).concat(rr) });
}

function solveSBC(highs, req, cards, FORMS, progress = () => {}, timeLimit = 40, extraOpts = {}, onPartial = () => {}) {
  const forms = !req.formation || req.formation === "any" ? COMMON_FORMS.filter(f => FORMS[f]) : [req.formation];
  const pool = sbcPool(req, cards);
  // a longer search also looks at a bigger shortlist of cards
  const cands = sbcCandidates(req, pool, forms, FORMS, req._K || (timeLimit >= 60 ? { per: 90, rule: 40, tr: 50, groups: 10, depth: 14, types: 6 } : {}));
  const tr = req.min_rating || 0;
  let best = null, proven = true, timedOut = false;
  forms.forEach((form, fi) => {
    const slots = FORMS[form], tag = forms.length > 1 ? ` (${fi + 1}/${forms.length})` : "", ft0 = Date.now();
    let formBest = null;
    const offer = (f) => { if (f && (!formBest || f.cost < formBest.cost)) { formBest = f; if (!best || f.cost < best.cost) { best = { cost: f.cost, form, sq: f.sq }; onPartial(sbcResult(best, false, FORMS, cands.length)); } } };
    if ((req.min_chem || 0) >= 25 || req.min_player_chem) {            // chem-heavy (the usual hybrid SBC): Icon + perfect-link groups first
      progress(`Building linked groups ${form}${tag}…`);
      offer(hybridSBC(req, pool, slots, forms.length > 1 ? 800 : 2500));
      offer(recipeSBC(req, pool, slots, forms.length > 1 ? 600 : 2000));       // usually ~0.1 s; returns nothing when no recipe fits
      if (!formBest && !req.min_types && !req.max_types && !(req.include || []).length) {   // the hard ones (obscure nations / clubs, 4-5 leagues and nations, no Icons)
        progress(`Building high-chem squads ${form}${tag}…`);
        // with a squad rating: only cards at the rating or above (always enough); the steps after this make it cheaper
        const hp = req.min_rating ? pool.filter(c => c.rating >= req.min_rating) : pool;
        offer(linkSBC(req, hp, slots, forms.length > 1 ? 800 : Math.min(5000, timeLimit * 200)));
        if (!formBest) offer(hardSearch(req, hp, slots, forms.length > 1 ? 2500 : timeLimit * (req.min_rating ? 350 : 300)));
        // still nothing: the exact cell model on just the cards the rules name (e.g. only players from the 5 clubs)
        if (!formBest && forms.length === 1 && cellModelOK(req)) {
          const rp = pool.filter(c => (req.rules || []).some(r => r.op !== "<=" && r.n > 0 && ruleMatch(c, r)));
          if (rp.length >= 11 && rp.length <= 4000) { progress(`Checking every squad from the named ${req.rules.some(r => r.on === "club") ? "clubs" : "nations"}…`); offer(cellSBC(highs, req, rp, slots, timeLimit * 0.55)); }
        }
      }
    }
    progress(`Searching ${form}${tag}…`);
    let ac = cands, init = null;
    if (formBest) {                       // improve the linked-group squad: its cards and their club / league mates join the search
      const ids = new Set(cands.map(c => c.id)), extra = [];
      const add = c => { if (!ids.has(c.id)) { ids.add(c.id); extra.push(c); } };
      formBest.sq.forEach(add);
      const pr = req.priority || "gold_first";
      for (const key of ["clubId", "leagueId"]) for (const g of new Set(formBest.sq.map(c => c[key])))
        pool.filter(c => c[key] === g).sort((a, b) => sbcCost(a, pr) - sbcCost(b, pr)).slice(0, 12).forEach(add);
      ac = cands.concat(extra);
      const at = new Map(ac.map((c, i) => [c.id, i]));
      init = formBest.sq.map(c => at.get(c.id));
    }
    const h = annealSBC(typeGuide(req), ac, slots, { iters: forms.length > 1 ? 40000 : 600000, restarts: forms.length > 1 ? 4 : 2, ms: forms.length > 1 ? 0 : Math.max(1500, (timeLimit * 1000 - (Date.now() - ft0)) * 0.6), init });
    const hs = h ? { cost: h.cost, sq: h.sq.map(i => ac[i]) } : null;
    if (hs && validSBC(req, hs.sq)) offer(hs);
    // exact solver: look for anything cheaper than the best squad known so far
    const cutoff = best ? best.cost - 0.5 : null;
    progress(best ? `Found a squad (${form}). Checking for a cheaper one${tag}…` : `Solving ${form}${tag}…`);
    const m = buildLP(req, cands, slots, 0);
    if (!m) return;
    let res;
    // "Any" formation: share the time out (about twice the one-formation time in total) instead of the full limit each
    // one formation and nothing found yet: the exact solver gets all the time that's left
    const left = timeLimit - (Date.now() - ft0) / 1000;
    const o = { time_limit: forms.length > 1 ? Math.max(3, timeLimit * 2 / forms.length) : Math.max(3, left), mip_rel_gap: 0, presolve: "on", output_flag: false };
    if (cutoff != null) o.objective_bound = cutoff;
    try { res = highs.solve(m.lp, Object.assign(o, extraOpts)); }
    catch (e) { throw new Error("Solver error: " + e.message); }
    const sq = new Array(11).fill(null);
    if (res.Columns) for (const v of m.X) { const col = res.Columns[v.name]; if (col && col.Primal > 0.5) sq[v.k] = m.cands[v.i]; }
    const got = !sq.includes(null) && (res.Status === "Optimal" || res.Status === "Time limit reached") && validSBC(req, sq);
    if (got) {
      const c = sq.reduce((a, x) => a + sbcCost(x, req.priority), 0);
      if (!best || c < best.cost) best = { cost: c, form, sq };
    }
    if (res.Status === "Optimal" || res.Status === "Infeasible") return;   // this formation is settled
    proven = false; if (!got && !formBest) timedOut = true;
  });
  if (!best) return { none: true, timedOut, candidates: cands.length };
  const rt = teamRatingOf(best.sq.map(x => x.rating));
  if (tr && rt < tr) throw new Error("Internal check failed: squad rating " + rt + " below " + tr);
  return sbcResult(best, proven, FORMS, cands.length);
}

if (typeof module !== "undefined") module.exports = { sbcCost, recipeSBC, chemSearch, planSearch, hardSearch, cellSBC, linkSBC, ruleMatch, solveSBC, sbcChem, teamRatingOf, buildLP, sbcPool, sbcCandidates, annealSBC, validSBC, hybridSBC };
