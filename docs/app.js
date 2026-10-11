"use strict";
const REPO = "bmahrrr/madfut-tools";
const NATIONS = {1:"Albania",4:"Austria",12:"Czechia",23:"Hungary",35:"Northern Ireland",43:"Slovakia",44:"Slovenia",58:"Paraguay",59:"Peru",61:"Venezuela",70:"Canada",117:"Ghana",133:"Nigeria",163:"Japan",167:"Korea Republic",7:"Belgium",10:"Croatia",13:"Denmark",14:"England",18:"France",20:"Georgia",21:"Germany",22:"Greece",25:"Rep. of Ireland",27:"Italy",34:"Netherlands",36:"Norway",37:"Poland",38:"Portugal",39:"Romania",42:"Scotland",45:"Spain",46:"Sweden",47:"Switzerland",48:"Türkiye",49:"Ukraine",50:"Wales",51:"Serbia",52:"Argentina",54:"Brazil",55:"Chile",56:"Colombia",57:"Ecuador",60:"Uruguay",83:"Mexico",95:"USA",97:"Algeria",103:"Cameroon",108:"Ivory Coast",129:"Morocco",136:"Senegal",195:"Australia"};
const LEAGUES = {1:"Superliga (Denmark)",7:"Brasileirão",41:"Eliteserien",50:"Scottish Premiership",56:"Allsvenskan",60:"League One",61:"League Two",66:"Ekstraklasa",68:"Süper Lig",80:"Austrian Bundesliga",189:"Swiss Super League",4:"Belgian Pro League",10:"Eredivisie",13:"Premier League",14:"Championship",16:"Ligue 1",17:"Ligue 2",19:"Bundesliga",20:"2. Bundesliga",31:"Serie A",32:"Serie B",39:"MLS",53:"LaLiga",54:"LaLiga 2",308:"Liga Portugal",350:"Saudi Pro League",2118:"Icons",2215:"Frauen-Bundesliga",2216:"WSL",2218:"D1 Arkema",2221:"NWSL",2222:"Liga F",2236:"Serie A Femminile"};
const nName = id => NATIONS[id] || (typeof groupSample === "function" && CARDS.length ? `${groupSample("nation", id)[0] || "?"}'s nation` : `Nation ${id}`);
const lName = id => LEAGUES[id] || (typeof groupSample === "function" && CARDS.length ? `${groupSample("league", id)[0] || "?"}'s league` : `League ${id}`);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const TYPE = c => ({rare_gold:"gold",gold:"gold",rare_silver:"silver",silver:"silver",rare_bronze:"bronze",bronze:"bronze",totw_gold:"TOTW",icon:"Icon",debut_icon:"Debut Icon",hero:"Hero",hall_of_fut:"Hall of FUT",future_stars:"Future Stars",destined_for_glory:"Destined for Glory",squad_foundations:"Squad Foundations",evo:"Evo",ltm:"LTM"}[c] || String(c).replace(/_/g, " "));

let CARDS = [], BYID = new Map(), WEEK = null, INDEX = null;
const state = { A: [], B: [], simB: [], simA: null };

// ---------- tabs ----------
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("main section").forEach(s => s.classList.toggle("on", s.id === b.dataset.t));
  scrollTo(0, 0);
});

// ---------- data ----------
async function getJSON(p) { const r = await fetch(p + (p.includes("?") ? "&" : "?") + "t=" + Date.now()); if (!r.ok) throw new Error(p); return r.json(); }
async function init() {
  try {
    const d = await getJSON("cards.json");
    CARDS = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
    $("dataInfo").textContent = `${d.count.toLocaleString()} cards · updated ${d.updated}`;
  } catch (e) { $("dataInfo").textContent = "card data missing"; }
  try { const ex = await getJSON("results/extras.json"); ex.cards.forEach(c => CARDS.push(Object.assign({specialChem: ""}, c))); } catch (e) {}
  CARDS.forEach(c => { c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)]); BYID.set(c.id, c); });
  try { INDEX = await getJSON("results/index.json"); WEEK = await getJSON("results/week.json"); } catch (e) {}
  try { FORMS_CACHE = await getJSON("formations.json"); } catch (e) {}
  renderTeams(); setupMC(); setupSim(); setupSBC(); renderSetup();
}

// ---------- shared card UI ----------
function search(q, limit = 12) {
  q = q.trim().toLowerCase(); if (q.length < 2) return [];
  const out = [];
  for (const c of CARDS) { if (c.name.toLowerCase().includes(q)) { out.push(c); if (out.length > 200) break; } }
  return out.sort((a, b) => b.rating - a.rating).slice(0, limit);
}
function cardLine(c) {
  return `<b>${esc(c.name)}</b> ${c.rating} <span class="muted">${esc(c.position)} · ${esc(TYPE(c.color))} · ${esc(nName(c.nationId))} · ${esc(lName(c.leagueId))}</span> <span class="small">${c.attack}/${c.control}/${c.defense}</span>`;
}
function hookSearch(inputId, listId, onPick) {
  const inp = $(inputId), ul = $(listId);
  inp.oninput = () => {
    const res = search(inp.value);
    ul.hidden = !res.length;
    ul.innerHTML = res.map(c => `<li data-id="${esc(c.id)}">${cardLine(c)}</li>`).join("");
  };
  ul.onclick = e => { const li = e.target.closest("li"); if (!li) return; onPick(BYID.get(li.dataset.id)); inp.value = ""; ul.hidden = true; };
}
function pill(r) { return `<span class="pill ${r}">${r}</span>`; }

// ---------- Teams tab ----------
async function renderTeams() {
  const box = $("teamsBody");
  if (!INDEX) { box.innerHTML = `<div class="card">No results yet. Fill in <b>Weekly setup</b> and they'll appear here once the build finishes.</div>`; return; }
  let html = `<p class="muted small">Week ${esc(INDEX.week || "")}. Stats are in-game (boosts + chem).</p>`;
  const files = INDEX.files || [];
  const mc = files.filter(f => f.startsWith("myclub_")), sim = files.filter(f => f.startsWith("sim_"));
  html += `<h3>Fatal My Club</h3>`;
  for (const f of mc) {
    try {
      const d = await getJSON("results/" + f); const t = d.team;
      html += `<div class="card"><h2>${esc(d.series.key)} series · ${esc(t.formation || "")} · ${t.chem} chem</h2>${playersTable(t.players, true)}`;
      if (t.results) html += `<h3>Results (perfect play)</h3><table><tr><th>Opponent</th><th>You lead first</th><th>They lead first</th></tr>${Object.entries(t.results).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${pill(v.you_lead_first)}</td><td>${pill(v.they_lead_first)}</td></tr>`).join("")}</table>`;
      html += `<p class="small muted">Built ${esc(d.built)}</p></div>`;
    } catch (e) {}
  }
  html += `<h3>Fatal Sim</h3>`;
  for (const f of sim) {
    try {
      const d = await getJSON("results/" + f); const t = d.teams && d.teams[0]; if (!t) continue;
      const m = t.metrics;
      html += `<div class="card"><h2>${esc(d.series.key)} series · ${esc(t.formation)} · ${m.chem} chem</h2><p class="small">Control <b>${m.control}</b> · Attack <b>${m.attack}</b> · Defence <b>${m.defence}</b> <span class="muted">(averages)</span></p>${playersTable(t.players, false)}<p class="small muted">Built ${esc(d.built)}</p></div>`;
    } catch (e) {}
  }
  box.innerHTML = html;
}
function playersTable(ps, showTB) {
  return `<div class="scroll"><table><tr><th>Pos</th><th>Player</th><th>Card</th><th>In game</th><th>Chem</th>${showTB ? "<th>TB</th>" : ""}</tr>${ps.map(p =>
    `<tr><td>${esc(p.slot)}</td><td><b>${esc(p.name)}</b> <span class="muted small">${p.rating} ${esc(TYPE(p.color))} · ${esc(nName(p.nationId))} · ${esc(lName(p.leagueId))}</span></td><td class="n">${p.card.join("/")}</td><td class="n">${p.eff.join("/")}</td><td class="n">${p.chem}</td>${showTB ? `<td class="n">${p.tiebreak ?? ""}</td>` : ""}</tr>`).join("")}</table></div>`;
}

// ---------- My Club compare ----------
function mcSeries() { const k = $("mcSeries").value; return (WEEK && WEEK.myclub || []).find(s => s.key === k) || { boosts: [] }; }
function setupMC() {
  const ser = (WEEK && WEEK.myclub) || [];
  $("mcSeries").innerHTML = ser.map(s => `<option value="${esc(s.key)}">${esc(s.key)}</option>`).join("") + `<option value="">No boosts</option>`;
  const loadOpts = () => {
    const s = mcSeries(); let o = `<option value="">Load a team…</option>`;
    if (INDEX && (INDEX.files || []).includes(`myclub_${s.key}.json`)) o += `<option value="built">My built ${esc(s.key)} team</option>`;
    (s.opponents || []).forEach((t, i) => o += `<option value="ref${i}">Reference team ${i + 1}</option>`);
    o += `<option value="clear">Clear</option>`;
    $("mcLoadA").innerHTML = o; $("mcLoadB").innerHTML = o;
  };
  const loader = side => async () => {
    const v = $("mcLoad" + side).value, s = mcSeries();
    if (v === "clear") state[side] = [];
    else if (v === "built") { const d = await getJSON(`results/myclub_${s.key}.json`); state[side] = d.team.players.map(p => BYID.get(p.id)).filter(Boolean); }
    else if (v.startsWith("ref")) state[side] = s.opponents[+v.slice(3)].map(id => BYID.get(id)).filter(Boolean);
    $("mcLoad" + side).value = ""; drawTeams();
  };
  $("mcLoadA").onchange = loader("A"); $("mcLoadB").onchange = loader("B");
  $("mcSeries").onchange = () => { loadOpts(); drawTeams(); };
  loadOpts();
  hookSearch("searchA", "srA", c => { if (state.A.length < 11) state.A.push(c); drawTeams(); });
  hookSearch("searchB", "srB", c => { if (state.B.length < 11) state.B.push(c); drawTeams(); });
  $("solveBtn").onclick = solveMC;
  drawTeams();
}
function teamTable(side) {
  const team = state[side]; if (!team.length) return `<p class="muted small">No cards yet.</p>`;
  const E = effective(team, mcSeries());
  return `<div class="scroll"><table><tr><th>Player</th><th>In game</th><th>Ch</th><th>TB</th><th></th></tr>${team.map((c, i) =>
    `<tr><td><b>${esc(c.name)}</b> <span class="muted small">${c.rating} ${esc(c.position)}</span></td><td class="n">${E[i].a}/${E[i].c}/${E[i].d}</td><td class="n">${E[i].chem}</td><td class="n">${E[i].t}</td><td><button class="x" data-s="${side}" data-i="${i}">✕</button></td></tr>`).join("")}</table></div>
    <p class="small muted">${team.length}/11 cards · chem ${E.reduce((s, e) => s + e.chem, 0)}</p>`;
}
function drawTeams() {
  $("teamA").innerHTML = teamTable("A"); $("teamB").innerHTML = teamTable("B");
  document.querySelectorAll("#teamA .x, #teamB .x").forEach(b => b.onclick = () => { state[b.dataset.s].splice(+b.dataset.i, 1); drawTeams(); });
}
let worker = null, reqId = 0; const pending = new Map();
function ask(msg) {
  if (!worker) { worker = new Worker("worker.js"); worker.onmessage = e => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.ok ? p.res(e.data.result) : p.rej(e.data.error); } }; }
  return new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage(Object.assign({ id }, msg)); });
}
async function solveMC() {
  if (state.A.length !== 11 || state.B.length !== 11) { $("solveOut").textContent = "Both teams need 11 cards."; return; }
  $("solveOut").textContent = "Solving… (a few seconds)";
  const s = mcSeries(); const A = effective(state.A, s), B = effective(state.B, s);
  const r = await ask({ type: "solve", A, B });
  $("solveOut").innerHTML = `You lead first: ${pill(LEVEL_NAME(r[0]))} &nbsp; They lead first: ${pill(LEVEL_NAME(r[1]))}`;
}

// ---------- Match helper ----------
const STAT = ["attack", "control", "defence"], COUNTER = [2, 1, 0];
let M = null;
$("iFirst").onclick = () => startMatch(0); $("theyFirst").onclick = () => startMatch(1);
async function startMatch(first) {
  if (state.A.length !== 11 || state.B.length !== 11) { alert("Set up both teams in My Club compare first."); return; }
  const s = mcSeries();
  M = { first, A: effective(state.A, s), B: effective(state.B, s), ma: 2047, mb: 2047, d: 0, n: 0, me: 0, them: 0, log: [] };
  $("matchBox").hidden = false; $("matchBox").innerHTML = "Starting…";
  await ask({ type: "start", A: M.A, B: M.B, first });
  matchStep();
}
const myTurn = () => (M.n % 2 === 0) === (M.first === 0);
const vName = v => ["Losing", "Losing by 1", "Drawing", "Winning", "Winning"][v];
async function matchStep() {
  const box = $("matchBox");
  if (M.n === 10) {
    const i = 31 - Math.clz32(M.ma), j = 31 - Math.clz32(M.mb);
    box.innerHTML = `<div class="big">${M.me} – ${M.them}</div><p>Tiebreak: your <b>${esc(state.A[i].name)}</b> (${M.A[i].t}) vs their <b>${esc(state.B[j].name)}</b> (${M.B[j].t}).</p>${logHtml()}<button class="ghost" onclick="startMatch(M.first)">Restart</button>`;
    return;
  }
  const val = await ask({ type: "value", ma: M.ma, mb: M.mb, d: M.d });
  let html = `<div class="row"><span class="big">${M.me} – ${M.them}</span><span class="muted">Round ${M.n + 1}/10 · with perfect play you're ${pill(LEVEL_NAME(val))}</span></div>`;
  if (myTurn()) {
    box.innerHTML = html + `<p class="muted">Working out your best lead…</p>`;
    const opts = await ask({ type: "leads", ma: M.ma, mb: M.mb, d: M.d });
    const best = opts[0];
    html += `<div class="move">Lead <b>${esc(state.A[best.i].name)}</b> — ${STAT[best.s]} ${[M.A[best.i].a, M.A[best.i].c, M.A[best.i].d][best.s]}</div>`;
    const alts = opts.filter(o => o.value === best.value).slice(1, 5);
    if (alts.length) html += `<p class="small muted">Also fine: ${alts.map(o => `${esc(state.A[o.i].name)} ${STAT[o.s]}`).join(", ")}</p>`;
    html += `<h3>What did they answer with?</h3><div class="row">` + teamButtons("B", M.mb, j => `ansTheirs(${best.i},${best.s},${j})`) + `</div>`;
    html += `<p class="small muted">Played something else? <a href="#" onclick="pickMyLead();return false">Choose the lead you played</a></p>`;
  } else {
    html += `<h3>Which card did they lead with?</h3><div class="row">` + teamButtons("B", M.mb, j => `theirLead(${j})`) + `</div>`;
  }
  box.innerHTML = html + logHtml();
}
function teamButtons(side, mask, fn) {
  const team = side === "A" ? state.A : state.B;
  return team.map((c, i) => (mask >> i & 1) ? `<button class="ghost" onclick="${fn(i)}">${esc(c.name)}</button>` : "").join("");
}
function logHtml() { return M.log.length ? `<h3>Moves</h3><ol class="small">${M.log.map(l => `<li>${l}</li>`).join("")}</ol>` : ""; }
function apply(i, j, r, text) { M.ma &= ~(1 << i); M.mb &= ~(1 << j); M.d += r; M.n++; if (r > 0) M.me++; if (r < 0) M.them++; M.log.push(text + (r > 0 ? " ✅" : r < 0 ? " ❌" : " ➖")); matchStep(); }
window.ansTheirs = (i, s, j) => apply(i, j, duelR(i, j, s, true), `You led ${esc(state.A[i].name)} (${STAT[s]}) · they answered ${esc(state.B[j].name)}`);
window.pickMyLead = () => {
  const box = $("matchBox");
  box.innerHTML = `<h3>Which card did you lead with?</h3><div class="row">${teamButtons("A", M.ma, i => `pickMyStat(${i})`)}</div>`;
};
window.pickMyStat = i => {
  $("matchBox").innerHTML = `<h3>Which stat?</h3><div class="row">${[0, 1, 2].map(s => `<button class="ghost" onclick="pickTheirAns(${i},${s})">${STAT[s]}</button>`).join("")}</div>`;
};
window.pickTheirAns = (i, s) => {
  $("matchBox").innerHTML = `<h3>What did they answer with?</h3><div class="row">${teamButtons("B", M.mb, j => `ansTheirs(${i},${s},${j})`)}</div>`;
};
window.theirLead = j => {
  $("matchBox").innerHTML = `<h3>${esc(state.B[j].name)} — which stat?</h3><div class="row">${[0, 1, 2].map(s => `<button class="ghost" onclick="theirStat(${j},${s})">${STAT[s]} ${[M.B[j].a, M.B[j].c, M.B[j].d][s]}</button>`).join("")}</div>`;
};
window.theirStat = async (j, s) => {
  const box = $("matchBox"); box.innerHTML = `<p class="muted">Working out your best answer…</p>`;
  const opts = await ask({ type: "answers", ma: M.ma, mb: M.mb, d: M.d, j, s });
  const best = opts[0];
  let html = `<div class="move">Answer with <b>${esc(state.A[best.i].name)}</b> (${STAT[COUNTER[s]]} ${[M.A[best.i].a, M.A[best.i].c, M.A[best.i].d][COUNTER[s]]}) — ${best.r > 0 ? "wins the round" : best.r < 0 ? "dump, loses the round" : "draws the round"}</div>`;
  html += `<div class="row"><button class="btn" onclick="ansMine(${j},${s},${best.i})">I played it</button></div>`;
  html += `<h3>Or tap the card you actually played</h3><div class="row">${teamButtons("A", M.ma, i => `ansMine(${j},${s},${i})`)}</div>`;
  box.innerHTML = html + logHtml();
};
window.ansMine = (j, s, i) => apply(i, j, duelR(i, j, s, false), `They led ${esc(state.B[j].name)} (${STAT[s]}) · you answered ${esc(state.A[i].name)}`);
function duelR(i, j, s, aLeads) {
  const A = M.A[i], B = M.B[j], v = e => [e.a, e.c, e.d];
  let va, vb;
  if (aLeads) { va = v(A)[s]; vb = v(B)[COUNTER[s]]; } else { vb = v(B)[s]; va = v(A)[COUNTER[s]]; }
  if (va !== vb) return va > vb ? 1 : -1;
  return A.t > B.t ? 1 : A.t < B.t ? -1 : 0;
}

// ---------- Sim compare ----------
const SIM_FORMS = {"3-1-4-2":["GK","CB","CB","CB","CDM","LM","CM","CM","RM","ST","ST"],"3-4-1-2":["GK","CB","CB","CB","LM","CM","CM","RM","CAM","ST","ST"],"3-5-2":["GK","CB","CB","CB","CDM","CDM","LM","CAM","RM","ST","ST"],"5-2-1-2":["GK","LB","CB","CB","CB","RB","CM","CM","CAM","ST","ST"],"5-3-2":["GK","LB","CB","CB","CB","RB","CM","CM","CM","ST","ST"],"5-4-1":["GK","LB","CB","CB","CB","RB","LM","CM","CM","RM","ST"],"4-4-2":["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"],"4-3-3":["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],"4-2-3-1":["GK","LB","CB","CB","RB","CDM","CDM","CAM","CAM","CAM","ST"]};
function simSeries() { const k = $("simSeries").value; return (WEEK && WEEK.sim || []).find(s => s.key === k) || { boosts: [] }; }
function setupSim() {
  const ser = (WEEK && WEEK.sim) || [];
  $("simSeries").innerHTML = ser.map(s => `<option>${esc(s.key)}</option>`).join("");
  $("simFormB").innerHTML = Object.keys(SIM_FORMS).map(f => `<option>${f}</option>`).join("");
  $("simSeries").onchange = loadSimA; $("simFormB").onchange = drawSim;
  hookSearch("searchS", "srS", c => { if (state.simB.length < 11) state.simB.push(c); drawSim(); });
  $("simBtn").onclick = runSim;
  loadSimA();
}
async function loadSimA() {
  state.simA = null;
  try { const d = await getJSON(`results/sim_${simSeries().key}.json`); state.simA = d.teams[0]; } catch (e) {}
  drawSim();
}
function drawSim() {
  const A = state.simA;
  $("simA").innerHTML = A ? `<p class="small">${esc(A.formation)}</p>` + `<table>${A.players.map(p => `<tr><td>${p.slot}</td><td>${esc(p.name)}</td><td class="n">${p.eff.join("/")}</td></tr>`).join("")}</table>` : `<p class="muted small">No built team for this series yet.</p>`;
  const slots = SIM_FORMS[$("simFormB").value], E = effective(state.simB, simSeries());
  $("simB").innerHTML = `<table>${slots.map((s, i) => { const c = state.simB[i]; return `<tr><td>${s}</td><td>${c ? esc(c.name) : '<span class="muted">—</span>'}</td><td class="n">${c ? `${E[i].a}/${E[i].c}/${E[i].d}` : ""}</td><td>${c ? `<button class="x" data-i="${i}">✕</button>` : ""}</td></tr>`; }).join("")}</table>`;
  document.querySelectorAll("#simB .x").forEach(b => b.onclick = () => { state.simB.splice(+b.dataset.i, 1); drawSim(); });
}
function runSim() {
  const A = state.simA; if (!A || state.simB.length !== 11) { $("simOut").textContent = "Need your built team and their 11 cards."; return; }
  const R1 = A.players.map(p => ({ slot: p.slot, a: p.eff[0], c: p.eff[1], d: p.eff[2] }));
  const slots = SIM_FORMS[$("simFormB").value], E = effective(state.simB, simSeries());
  const R2 = slots.map((s, i) => ({ slot: s, a: E[i].a, c: E[i].c, d: E[i].d }));
  const m = simMatch(R1, R2);
  const odds = matchOdds(m.scoreA, m.scoreB, 10);
  $("simOut").innerHTML = `<p>Control duels won: <b>${(m.control * 100).toFixed(0)}%</b><br>You score on <b>${(m.scoreA * 100).toFixed(1)}%</b> of possessions, they score on <b>${(m.scoreB * 100).toFixed(1)}%</b>.</p><p class="small">If a match has ~10 possessions: win <b>${odds[0]}%</b> · draw <b>${odds[1]}%</b> · loss <b>${odds[2]}%</b></p>`;
}
function matchOdds(p, q, n) {
  const C = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
  let W = 0, D = 0, L = 0;
  for (let a = 0; a <= n; a++) for (let b = 0; b <= n - a; b++) { const pr = C(n, a) * C(n - a, b) * p ** a * q ** b * (1 - p - q) ** (n - a - b); if (a > b) W += pr; else if (a === b) D += pr; else L += pr; }
  return [W, D, L].map(x => Math.round(x * 100));
}

// ---------- SBC ----------
const SBC_NUMS = [["min_rating", "Squad rating min"], ["min_chem", "Squad chem min"], ["min_player_chem", "Chem per player min"], ["min_types", "Card types min"],
  ["min_card_rating", "Player rating min"], ["max_card_rating", "Player rating max"], ["min_nations", "Nations min"], ["max_nations", "Nations max"],
  ["min_same_nation", "Same nation min"], ["max_same_nation", "Same nation max"], ["min_leagues", "Leagues min"], ["max_leagues", "Leagues max"],
  ["min_same_league", "Same league min"], ["max_same_league", "Same league max"], ["min_clubs", "Clubs min"], ["max_clubs", "Clubs max"],
  ["min_same_club", "Same club min"], ["max_same_club", "Same club max"]];
const SB = { rules: [], include: [], exclude: [], last: null, lastReq: null, busy: false };
const OPS = { ">=": "Min", "<=": "Max", "=": "Exactly" };
const KIND = { nation: "Nation", league: "League", club: "Club", color: "Card type", rarity: "Rarity" };
const KEYOF = { nation: "nationId", league: "leagueId", club: "clubId" };
const sampleCache = new Map();
function groupSample(kind, id) {             // a few well-known players so you can recognise a club / nation / league
  const k = kind + id; if (sampleCache.has(k)) return sampleCache.get(k);
  const seen = new Set(), out = [];
  for (const c of [...CARDS].filter(c => c[KEYOF[kind]] === id).sort((a, b) => b.rating - a.rating)) { if (seen.has(c.name)) continue; seen.add(c.name); out.push(c.name); if (out.length === 3) break; }
  sampleCache.set(k, out); return out;
}
function groupLabel(kind, id) {
  if (kind === "nation" && NATIONS[id]) return NATIONS[id];
  if (kind === "league" && LEAGUES[id]) return LEAGUES[id];
  if (kind === "color") return TYPE(id);
  if (kind === "rarity") return id;
  return groupSample(kind, id).join(", ") || `${kind} ${id}`;
}
function ruleText(r) {
  const known = (r.on === "nation" && NATIONS[r.id]) || (r.on === "league" && LEAGUES[r.id]);
  const extra = (r.on === "club" || ((r.on === "nation" || r.on === "league") && !known)) ? ` <span class="muted">(e.g. ${esc(groupSample(r.on, r.id).join(", "))})</span>` : "";
  if (r.on === "club" || ((r.on === "nation" || r.on === "league") && !known))
    return `${OPS[r.op]} ${r.n} from the ${r.on} of <b>${esc(r.via || groupSample(r.on, r.id)[0] || r.id)}</b>${extra}`;
  return `${OPS[r.op]} ${r.n} from ${esc(KIND[r.on])}: <b>${esc(groupLabel(r.on, r.id))}</b>`;
}
function setupSBC() {
  const forms = Object.keys(SBC_FORMS_LIST());
  $("sbcForm").innerHTML = forms.map(f => `<option>${f}</option>`).join("") + `<option value="any">Any (slower)</option>`;
  $("sbcForm").value = "4-3-3";
  const field = ([k, l]) => `<label>${l}<input type="number" inputmode="numeric" id="n_${k}" min="0"></label>`;
  $("sbcNums").innerHTML = SBC_NUMS.slice(0, 4).map(field).join("");
  $("sbcMore").innerHTML = SBC_NUMS.slice(4).map(field).join("");
  $("rKind").onchange = drawPicker; drawPicker();
  hookSearch("sbcIncQ", "sbcIncSr", c => { if (!SB.include.includes(c.id)) SB.include.push(c.id); drawSBCForm(); });
  $("sbcGo").onclick = () => { SB.exclude = []; runSBC(15); };
  $("sbcClear").onclick = () => { SB.rules = []; SB.include = []; SB.exclude = []; $("sbcName").value = ""; SBC_NUMS.forEach(([k]) => $("n_" + k).value = ""); $("sbcSp").checked = $("sbcIc").checked = false; $("sbcOut").hidden = true; drawSBCForm(); saveSBC(); };
  ["sbcName", "sbcForm", "sbcPr", "sbcSp", "sbcIc", ...SBC_NUMS.map(([k]) => "n_" + k)].forEach(id => $(id).addEventListener("change", saveSBC));
  loadSBC(); drawSBCForm();
}
let FORMS_CACHE = null;
function SBC_FORMS_LIST() { return FORMS_CACHE || {}; }
function drawPicker() {
  const kind = $("rKind").value, box = $("rPickBox");
  if (kind === "color") {
    const types = [...new Set(CARDS.map(sbcType))].sort();
    box.innerHTML = `<div class="row"><select id="rType">${types.map(t => `<option value="${esc(t)}">${esc(TYPE(t))}</option>`).join("")}</select><button class="ghost" id="rAdd">Add</button></div>`;
    $("rAdd").onclick = () => addRule($("rType").value);
  } else if (kind === "rarity") {
    box.innerHTML = `<div class="row"><select id="rRar"><option>gold</option><option>silver</option><option>bronze</option></select><button class="ghost" id="rAdd">Add</button></div>`;
    $("rAdd").onclick = () => addRule($("rRar").value);
  } else {
    box.innerHTML = `<input type="text" id="rQ" placeholder="${kind === "club" ? "Type a player from that club" : `Type the ${kind} name or a player from it`}"><ul class="sr" id="rSr" hidden></ul>`;
    const inp = $("rQ"), ul = $("rSr");
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase(); if (q.length < 2) { ul.hidden = true; return; }
      const opts = new Map();
      const names = kind === "nation" ? NATIONS : kind === "league" ? LEAGUES : {};
      for (const [id, n] of Object.entries(names)) if (n.toLowerCase().includes(q)) opts.set(+id, null);
      for (const c of search(q, 8)) if (!opts.has(c[KEYOF[kind]])) opts.set(c[KEYOF[kind]], c.name);
      const list = [...opts.entries()].slice(0, 10);
      ul.hidden = !list.length;
      ul.innerHTML = list.map(([id, via]) => `<li data-id="${id}" data-via="${esc(via || "")}"><b>${esc(groupLabel(kind, id))}</b>${kind !== "club" && (NATIONS[id] || LEAGUES[id]) && via ? ` <span class="muted small">(${esc(via)}'s ${kind})</span>` : ""}${kind === "club" ? ` <span class="muted small">— ${esc(via ? via + "'s club" : "")}</span>` : ""}</li>`).join("");
    };
    ul.onclick = e => { const li = e.target.closest("li"); if (!li) return; addRule(+li.dataset.id, li.dataset.via); inp.value = ""; ul.hidden = true; };
  }
}
function addRule(id, via) {
  const n = Math.max(0, Math.min(11, +$("rN").value || 0));
  const r = { on: $("rKind").value, id, op: $("rOp").value, n }; if (via) r.via = via;
  SB.rules.push(r);
  drawSBCForm(); saveSBC();
}
function drawSBCForm() {
  $("sbcRules").innerHTML = SB.rules.length ? SB.rules.map((r, i) => `<span class="chip"><span>${ruleText(r)}</span><button class="x" data-r="${i}">✕</button></span>`).join("") : `<span class="muted">None yet. Add each “Min 1 player from …” line below.</span>`;
  $("sbcInc").innerHTML = SB.include.map((id, i) => { const c = BYID.get(id); return c ? `<span class="chip"><b>${esc(c.name)}</b> ${c.rating}<button class="x" data-inc="${i}">✕</button></span>` : ""; }).join("");
  document.querySelectorAll("[data-r]").forEach(b => b.onclick = () => { SB.rules.splice(+b.dataset.r, 1); drawSBCForm(); saveSBC(); });
  document.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { SB.include.splice(+b.dataset.inc, 1); drawSBCForm(); saveSBC(); });
}
function readReq() {
  const req = { name: $("sbcName").value.trim(), formation: $("sbcForm").value, priority: $("sbcPr").value,
    allow_specials: $("sbcSp").checked, allow_icons: $("sbcIc").checked, rules: SB.rules.slice(), include: SB.include.slice(), exclude: SB.exclude.slice() };
  for (const [k] of SBC_NUMS) { const v = $("n_" + k).value; if (v !== "") req[k] = +v; }
  return req;
}
function saveSBC() { try { localStorage.setItem("sbcForm", JSON.stringify(readReq())); } catch (e) {} }
function loadSBC() {
  let r = null; try { r = JSON.parse(localStorage.getItem("sbcForm") || "null"); } catch (e) {}
  if (!r) return;
  $("sbcName").value = r.name || ""; if (r.formation) $("sbcForm").value = r.formation; if (r.priority) $("sbcPr").value = r.priority;
  $("sbcSp").checked = !!r.allow_specials; $("sbcIc").checked = !!r.allow_icons;
  SB.rules = r.rules || []; SB.include = r.include || [];
  for (const [k] of SBC_NUMS) if (r[k] != null) $("n_" + k).value = r[k];
  if (SBC_NUMS.slice(4).some(([k]) => r[k] != null)) $("sbcMoreBox").open = true;
}
let sbcWorker = null, sbcReq = 0;
function sbcSolve(req, timeLimit, onProgress, onPartial) {
  if (!sbcWorker) sbcWorker = new Worker("sbcworker.js");
  const id = ++sbcReq;
  return new Promise((res, rej) => {
    sbcWorker.onmessage = e => {
      const m = e.data; if (m.id !== id) return;
      if (m.type === "progress") onProgress(m.text);
      else if (m.type === "partial") onPartial(m);
      else if (m.type === "done") res(m); else rej(new Error(m.error));
    };
    sbcWorker.postMessage({ id, req, timeLimit });
  });
}
async function runSBC(timeLimit, reqOverride) {
  if (SB.busy) return;
  const req = reqOverride || readReq();
  if (!req.formation) return;
  SB.busy = true; $("sbcGo").disabled = true;
  const out = $("sbcOut"); out.hidden = false;
  const t0 = Date.now(); let msg = "Loading solver…", hasPartial = false;
  const status = () => `${esc(msg)} ${Math.round((Date.now() - t0) / 1000)}s`;
  const tick = setInterval(() => { if (hasPartial) { const el = $("sbcWorking"); if (el) el.innerHTML = status(); } else out.innerHTML = `<p class="muted">${status()}</p>`; }, 500);
  out.innerHTML = `<p class="muted">${msg}</p>`;
  const per = req.formation === "any" ? Math.max(5, Math.round(timeLimit / 3)) : timeLimit;
  try {
    const m = await sbcSolve(req, per, t => msg = t, p => { hasPartial = true; SB.last = p.result; SB.lastReq = req; SB.lastSeconds = p.seconds; drawSBCResult(true); });
    SB.last = m.result; SB.lastReq = req; SB.lastSeconds = m.seconds;
    drawSBCResult();
  } catch (e) {
    out.innerHTML = `<p class="bad">Something went wrong: ${esc(e.message)}</p>`;
  } finally { clearInterval(tick); SB.busy = false; $("sbcGo").disabled = false; }
}
function sbcChecks(req, sq) {
  const ch = sbcChem(sq), rt = teamRatingOf(sq.map(x => x.rating)), list = [];
  const cnt = (f) => new Set(sq.map(f)).size;
  const most = (f) => Math.max(...[...sq.reduce((m, x) => m.set(f(x), (m.get(f(x)) || 0) + 1), new Map()).values()]);
  const add = (label, ok) => list.push({ label, ok });
  if (req.min_rating) add(`Squad rating ${rt} (min ${req.min_rating})`, rt >= req.min_rating);
  if (req.min_chem) add(`Squad chem ${ch.reduce((a, b) => a + b, 0)} (min ${req.min_chem})`, ch.reduce((a, b) => a + b, 0) >= req.min_chem);
  if (req.min_player_chem) add(`Lowest player chem ${Math.min(...ch)} (min ${req.min_player_chem})`, Math.min(...ch) >= req.min_player_chem);
  if (req.min_types) add(`Card types ${cnt(sbcType)} (min ${req.min_types})`, cnt(sbcType) >= req.min_types);
  if (req.min_card_rating) add(`Lowest player ${Math.min(...sq.map(x => x.rating))} (min ${req.min_card_rating})`, sq.every(x => x.rating >= req.min_card_rating));
  if (req.max_card_rating) add(`Highest player ${Math.max(...sq.map(x => x.rating))} (max ${req.max_card_rating})`, sq.every(x => x.rating <= req.max_card_rating));
  for (const [kind, key] of [["nation", "nationId"], ["league", "leagueId"], ["club", "clubId"]]) {
    const n = cnt(x => x[key]), m = most(x => x[key]);
    if (req[`min_${kind}s`]) add(`${KIND[kind]}s ${n} (min ${req[`min_${kind}s`]})`, n >= req[`min_${kind}s`]);
    if (req[`max_${kind}s`]) add(`${KIND[kind]}s ${n} (max ${req[`max_${kind}s`]})`, n <= req[`max_${kind}s`]);
    if (req[`min_same_${kind}`]) add(`Same ${kind} ${m} (min ${req[`min_same_${kind}`]})`, m >= req[`min_same_${kind}`]);
    if (req[`max_same_${kind}`]) add(`Same ${kind} ${m} (max ${req[`max_same_${kind}`]})`, m <= req[`max_same_${kind}`]);
  }
  for (const r of req.rules || []) {
    const n = sq.filter(x => ruleMatch(x, r)).length;
    add(`${ruleText(r)}: ${n}`, r.op === ">=" ? n >= r.n : r.op === "<=" ? n <= r.n : n === r.n);
  }
  for (const id of req.include || []) { const c = BYID.get(id); add(`Includes ${esc(c ? c.name : id)}`, sq.some(x => x.id === id)); }
  return list;
}
function drawSBCResult(working = false) {
  const out = $("sbcOut"), r = SB.last, req = SB.lastReq;
  const skip = SB.exclude.map(id => BYID.get(id)).filter(Boolean);
  const skipHtml = skip.length ? `<p class="small">Skipping: ${skip.map((c, i) => `<span class="chip">${esc(c.name)} ${c.rating}<button class="x" data-undo="${i}">↺</button></span>`).join("")}</p>` : "";
  if (!r || r.none) {
    out.innerHTML = (r && r.timedOut
      ? `<p><b>No squad found yet.</b> It ran out of time before finding one.</p><button class="btn" id="sbcLonger">Search longer (up to 90 s)</button>`
      : `<p><b>No squad meets all of these requirements</b> with the cards available${skip.length ? " after skipping the cards below" : ""}. Check the numbers, or allow special cards.</p>`) + skipHtml;
  } else {
    const sq = r.players.map(p => BYID.get(p.id));
    const checks = sbcChecks(req, sq), allOk = checks.every(c => c.ok);
    const head = working ? `<p><b>Squad found.</b> <span class="muted small" id="sbcWorking">Checking for a cheaper one…</span></p>`
      : r.proven ? `<p class="ok"><b>✓ Cheapest squad</b> <span class="muted small">(checked against every cheaper combination of the ${r.candidates} best-fitting cards)</span></p>`
      : `<p><b>Best squad found in ${SB.lastSeconds} s.</b> <span class="muted">There may be a slightly cheaper one.</span></p><button class="ghost" id="sbcLonger">Search longer (up to 90 s)</button>`;
    out.innerHTML = `<h2>${esc(req.name || "SBC")} · ${esc(r.formation)}</h2>${head}
      <p class="small">Squad rating <b>${r.rating}</b> · chem <b>${r.chem}</b></p>
      <table class="sq"><tr><th>Pos</th><th>Player</th><th>Chem</th><th></th></tr>${r.players.map(p =>
        `<tr><td>${esc(p.slot)}</td><td class="wrap"><b>${esc(p.name)}</b> ${p.rating}<br><span class="muted small">${esc(TYPE(p.color))} · ${esc(nName(p.nationId))} · ${esc(lName(p.leagueId))}</span></td><td class="n">${p.chem}</td><td><button class="nohave" data-nohave="${esc(p.id)}">Don't<br>have</button></td></tr>`).join("")}</table>
      ${skipHtml}
      <h3>Requirements check</h3><ul class="small" style="padding-left:18px;margin:4px 0">${checks.map(c => `<li class="${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✗"} ${c.label}</li>`).join("") || "<li class='muted'>No requirements set.</li>"}</ul>
      ${allOk ? "" : `<p class="bad small">A requirement isn't met — please tell Claude.</p>`}`;
  }
  if (working) { out.querySelectorAll("[data-nohave],[data-undo]").forEach(b => b.disabled = true); return; }
  out.querySelectorAll("[data-nohave]").forEach(b => b.onclick = () => { SB.exclude.push(b.dataset.nohave); runSBC(15, Object.assign({}, SB.lastReq, { exclude: SB.exclude.slice() })); });
  out.querySelectorAll("[data-undo]").forEach(b => b.onclick = () => { SB.exclude.splice(+b.dataset.undo, 1); runSBC(15, Object.assign({}, SB.lastReq, { exclude: SB.exclude.slice() })); });
  const longer = $("sbcLonger");
  if (longer) longer.onclick = () => runSBC(90, Object.assign({}, SB.lastReq, r && !r.none ? { formation: r.formation } : {}, { exclude: SB.exclude.slice() }));
}

// ---------- Weekly setup ----------
function renderSetup() {
  const ed = f => `https://github.com/${REPO}/edit/main/${f}`;
  $("setupBody").innerHTML = `
  <div class="card"><h2>Each week</h2><ol>
   <li>Open <a href="${ed("config/week.json")}" target="_blank">config/week.json</a> and update each series' <code>cap</code> and <code>boosts</code> (use the helper below to write boost lines). For My Club you can add <code>opponents</code> (reference teams, as card ids) to beat.</li>
   <li>Tap <b>Commit changes</b>. Sim teams appear in ~5 minutes, My Club teams in ~40 minutes on the <b>Teams</b> tab.</li>
   <li>Upgraded an LTM or got an evo? Update <a href="${ed("config/extras.json")}" target="_blank">config/extras.json</a>.</li>
  </ol><p class="small muted">Card data updates itself every day from madfutdata. <a href="https://github.com/${REPO}/actions" target="_blank">See running jobs</a>.</p></div>
  <div class="card"><h2>Boost line helper</h2>
   <div class="row"><select id="bOn"><option value="nation">Nation</option><option value="league">League</option><option value="club">Club</option><option value="color">Card type</option></select>
   <input type="text" id="bCard" placeholder="Search a card from that nation / league / club" style="flex:1"></div><ul class="sr" id="bSr" hidden></ul>
   <div class="row" style="margin-top:8px"><label>Att <input id="bA" type="number" value="0" style="width:64px"></label><label>Ctl <input id="bC" type="number" value="0" style="width:64px"></label><label>Def <input id="bD" type="number" value="0" style="width:64px"></label></div>
   <p>Line to paste: <code id="bOut">pick a card</code></p></div>
  <div class="card"><h2>Card id lookup</h2><p class="small muted">Card ids are used for reference teams. Search a card to see its id, nation, league and club ids.</p><input type="text" id="idQ" placeholder="Search…"><ul class="sr" id="idSr" hidden></ul><p id="idOut" class="small"></p></div>`;
  let picked = null;
  const upd = () => {
    if (!picked) return;
    const on = $("bOn").value, id = on === "nation" ? picked.nationId : on === "league" ? picked.leagueId : on === "club" ? picked.clubId : String(picked.color).replace("rare_", "");
    $("bOut").textContent = JSON.stringify({ on, id, att: +$("bA").value, ctl: +$("bC").value, def: +$("bD").value });
  };
  hookSearch("bCard", "bSr", c => { picked = c; $("bCard").value = c.name; upd(); });
  ["bOn", "bA", "bC", "bD"].forEach(k => $(k).oninput = upd);
  hookSearch("idQ", "idSr", c => { $("idOut").innerHTML = `${cardLine(c)}<br>id <code>${esc(c.id)}</code> · nation ${c.nationId} · league ${c.leagueId} · club ${c.clubId}`; });
}

init();
