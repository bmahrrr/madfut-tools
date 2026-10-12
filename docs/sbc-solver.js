// SBC solver that runs in the browser (inside sbcworker.js) using the HiGHS solver compiled to WebAssembly.
// Finds the cheapest squad that meets every requirement, in your cost order:
// golds first (lowest rated first), then cheap specials, then silvers, bronze last.
"use strict";

const SBC_AUTO = new Set(["icon", "debut_icon", "hero", "hall_of_fut"]);
const SBC_ICON = new Set(["icon", "debut_icon"]);
const SBC_HERO = new Set(["hero", "hall_of_fut"]);
// Card types the game doesn't allow in SBCs.
const NO_SBC = new Set(["evo", "elite_evo", "sbc_premium", "ltm", "epl_potm", "laliga_potm", "seriea_potm", "bundesliga_potm"]);
const COMMON_FORMS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-2-1-2", "3-4-3", "4-4-1-1", "5-3-2", "4-3-2-1", "3-4-1-2"];
const THRESH = { n: [2, 5, 8], l: [3, 5, 8], k: [2, 4, 7] };

const sbcType = c => String(c.color).replace("rare_", "");
const rarity = c => { const t = sbcType(c); return t === "gold" || t === "silver" || t === "bronze" ? t : "special"; };
const playerKey = c => (Number.isInteger(c.baseId) && c.baseId > 0 ? "b" + c.baseId : c.name + "|" + c.nationId);

function sbcCost(c, pr) {
  // Like coin prices: each rating point costs a little up to 80, then far more (a 90 costs ~5x an 80).
  const r = rarity(c), q = c.rating, steep = q > 80 ? 40 * (q - 80) * (q - 80) : 0;
  if (pr === "lowest_rating") return (r === "special" ? 300 : 0) + q * 10 + steep;
  let base = { gold: 0, special: 400, silver: 600, bronze: 900 }[r];
  if (SBC_AUTO.has(c.color)) base = 2000;
  return base + q * 10 + steep;
}

function ruleMatch(c, r) {
  switch (r.on) {
    case "nation": return c.nationId === r.id;
    case "league": return c.leagueId === r.id;
    case "club": return c.clubId === r.id;
    case "color": return sbcType(c) === String(r.id).replace("rare_", "");
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
  }
  // chem clusters: extra depth in the most common leagues and nations among the cheap cards
  const cheap = [...chosen.values()].sort(byCost).slice(0, 300);
  for (const key of ["leagueId", "nationId"]) {
    const cnt = new Map(); cheap.forEach(x => cnt.set(x[key], (cnt.get(x[key]) || 0) + 1));
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, k4).map(e => e[0]);
    for (const g of top) for (const p of pos) el[p].filter(x => x[key] === g).slice(0, k5).forEach(add);
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
  if (req.min_types) {
    const vs = [];
    for (const ids of groupBy(sbcType).values()) { const v = "u" + uc++; ints.push(v); vs.push(v); row([[1, v], ...ysum(ids).map(([, x]) => [-1, x])], "<=", 0); }
    row(vs.map(v => [1, v]), ">=", req.min_types);
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
    const Lr = req._L != null ? [req._L, req._L] : [T - 6, T + 1];
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
    if (req.min_types) { const d = distinct(TY); if (d < req.min_types) pen += req.min_types - d; }
    for (const id of incl) if (!sq.some(i => cands[i].id === id)) pen += 3;
    return { cost: c0, pen, score: c0 + W * pen };
  }
  const rnd = (k) => Math.floor(Math.random() * k);
  const pickCheap = (L) => L[Math.min(L.length - 1, Math.floor(-Math.log(1 - Math.random()) * Math.min(12, L.length)))];
  let best = null;
  const iters = opts.iters || 60000, restarts = opts.restarts || 4;
  for (let rs = 0; rs < restarts; rs++) {
    let sq = elig.map(L => pickCheap(L));
    // put must-include cards in a slot they fit
    for (const id of incl) { const i = cands.findIndex(c => c.id === id); if (i < 0) continue; const k = slots.findIndex((sl, k) => eligSet[k].has(i)); if (k >= 0) sq[k] = i; }
    let cur = evaluate(sq);
    let T = 300;
    for (let it = 0; it < iters; it++) {
      T = 300 * Math.pow(0.5 / 300, it / iters);
      const nsq = sq.slice(), mv = Math.random();
      if (mv < 0.25) {                                   // swap two slots
        const a = rnd(S), b = rnd(S); if (a === b || !eligSet[a].has(sq[b]) || !eligSet[b].has(sq[a])) continue;
        nsq[a] = sq[b]; nsq[b] = sq[a];
      } else {
        const k = rnd(S); let i;
        if (mv < 0.65) {                                 // a card sharing a nation / league / club with someone in the squad
          const other = sq[rnd(S)], g = rnd(3), L = byG[g].get([NAT, LG, CL][g][other]).filter(x => eligSet[k].has(x));
          if (!L.length) continue; i = L[rnd(L.length)];
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
function solveSBC(highs, req, cards, FORMS, progress = () => {}, timeLimit = 40, extraOpts = {}, onPartial = () => {}) {
  const forms = !req.formation || req.formation === "any" ? COMMON_FORMS.filter(f => FORMS[f]) : [req.formation];
  const pool = sbcPool(req, cards);
  const cands = sbcCandidates(req, pool, forms, FORMS, req._K || {});
  const tr = req.min_rating || 0;
  let best = null, proven = true, timedOut = false;
  forms.forEach((form, fi) => {
    const slots = FORMS[form], tag = forms.length > 1 ? ` (${fi + 1}/${forms.length})` : "";
    progress(`Searching ${form}${tag}…`);
    const h = annealSBC(req, cands, slots, { iters: forms.length > 1 ? 40000 : 120000 });
    let formBest = h ? { cost: h.cost, sq: h.sq.map(i => cands[i]) } : null;
    if (formBest && !validSBC(req, formBest.sq)) formBest = null;
    if (formBest && (!best || formBest.cost < best.cost)) { best = { cost: formBest.cost, form, sq: formBest.sq }; onPartial(sbcResult(best, false, FORMS, cands.length)); }
    // exact solver: look for anything cheaper than the best squad known so far
    const cutoff = best ? best.cost - 0.5 : null;
    progress(best ? `Found a squad (${form}) — checking for a cheaper one${tag}…` : `Solving ${form}${tag}…`);
    const m = buildLP(req, cands, slots, 0);
    if (!m) return;
    let res;
    const o = { time_limit: timeLimit, mip_rel_gap: 0, presolve: "on", output_flag: false };
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

if (typeof module !== "undefined") module.exports = { solveSBC, sbcChem, teamRatingOf, buildLP, sbcPool, sbcCandidates, annealSBC, validSBC };
