"use strict";
const REPO = "bmahrrr/madfut-tools";
let NATIONS = {1:"Albania",4:"Austria",12:"Czechia",23:"Hungary",35:"Northern Ireland",43:"Slovakia",44:"Slovenia",58:"Paraguay",59:"Peru",61:"Venezuela",70:"Canada",117:"Ghana",133:"Nigeria",163:"Japan",167:"Korea Republic",7:"Belgium",10:"Croatia",13:"Denmark",14:"England",18:"France",20:"Georgia",21:"Germany",22:"Greece",25:"Rep. of Ireland",27:"Italy",34:"Netherlands",36:"Norway",37:"Poland",38:"Portugal",39:"Romania",42:"Scotland",45:"Spain",46:"Sweden",47:"Switzerland",48:"Türkiye",49:"Ukraine",50:"Wales",51:"Serbia",52:"Argentina",54:"Brazil",55:"Chile",56:"Colombia",57:"Ecuador",60:"Uruguay",83:"Mexico",95:"USA",97:"Algeria",103:"Cameroon",108:"Ivory Coast",129:"Morocco",136:"Senegal",195:"Australia"};
let LEAGUES = {1:"Superliga (Denmark)",7:"Brasileirão",41:"Eliteserien",50:"Scottish Premiership",56:"Allsvenskan",60:"League One",61:"League Two",66:"Ekstraklasa",68:"Süper Lig",80:"Austrian Bundesliga",189:"Swiss Super League",4:"Belgian Pro League",10:"Eredivisie",13:"Premier League",14:"Championship",16:"Ligue 1",17:"Ligue 2",19:"Bundesliga",20:"2. Bundesliga",31:"Serie A",32:"Serie B",39:"MLS",53:"LaLiga",54:"LaLiga 2",308:"Liga Portugal",350:"Saudi Pro League",2118:"Icons",2215:"Frauen-Bundesliga",2216:"WSL",2218:"D1 Arkema",2221:"NWSL",2222:"Liga F",2236:"Serie A Femminile"};
let CLUBS = {};
const cName = id => CLUBS[id] || `club ${id}`;
const nName = id => NATIONS[id] || (typeof groupSample === "function" && CARDS.length ? `${groupSample("nation", id)[0] || "?"}'s nation` : `Nation ${id}`);
const lName = id => LEAGUES[id] || (typeof groupSample === "function" && CARDS.length ? `${groupSample("league", id)[0] || "?"}'s league` : `League ${id}`);
const $ = id => document.getElementById(id);
const fmtDay = d => { const x = new Date(String(d).slice(0, 10) + "T12:00:00Z"); return isNaN(x) ? String(d) : x.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); };
const fmtStamp = d => { const x = new Date(String(d).replace(" UTC", "Z").replace(" ", "T")); return isNaN(x) ? String(d) : x.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
const SEASON1 = "2026-09-26";       // Fatal season 1 (FC 27) started Saturday Sep 26; a new season every Saturday
const seasonOf = d => 1 + Math.floor((Date.parse(String(d).slice(0, 10)) - Date.parse(SEASON1)) / 6048e5);
const seasonName = d => d ? "Season " + seasonOf(d) : "Season";
const cap = t => { t = String(t ?? ""); return t.charAt(0).toUpperCase() + t.slice(1); };   // first letter always a capital
const MINOR = new Set(["a", "an", "the", "and", "but", "or", "nor", "of", "to", "in", "on", "at", "by", "for", "vs", "as", "per"]);
const titleWord = (w, first) => w.split("-").map((p, j) => {            // leaves LaLiga, TOTW, 4-3-3 as they are
  if (!/^[a-z]/.test(p)) return p;
  if (j === 0 && !first && MINOR.has(p.replace(/[^a-z]/g, ""))) return p;
  return p.charAt(0).toUpperCase() + p.slice(1);
}).join("-");
const tc = t => String(t ?? "").split(/(\s+)/).map((w, i) => /\s/.test(w) ? w : titleWord(w, i === 0)).join("");   // Title Case
const HEADS = "h1,h2,h3,nav button,summary:not(.ok):not(.bad),.chipbtn>b,.tc";
function titleAll(root) {
  const h = root.closest && root.closest(HEADS), els = h ? [h] : [];
  if (root.querySelectorAll) els.push(...root.querySelectorAll(HEADS));
  for (const el of els) {
    if (el.closest(".notc")) continue;
    let first = true;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement.closest(".pill,.notc,input,select,textarea")) { if (n.nodeValue.trim()) first = false; continue; }
      const v = n.nodeValue.split(/(\s+)/).map((x, i) => { if (/^\s*$/.test(x)) return x; const r = titleWord(x, first); first = false; return r; }).join("");
      if (v !== n.nodeValue) n.nodeValue = v;
    }
  }
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) titleAll(n); else if (n.nodeType === 3 && n.parentElement) titleAll(n.parentElement); })
  .observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => titleAll(document.body));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
const TYPE = c => cap({rare_gold:"Gold",gold:"Gold",rare_silver:"Silver",silver:"Silver",rare_bronze:"Bronze",bronze:"Bronze",totw_gold:"TOTW",icon:"Icon",debut_icon:"Debut Icon",hero:"Hero",hall_of_fut:"Hall of FUT",future_stars:"Future Stars",destined_for_glory:"Destined for Glory",squad_foundations:"Squad Foundations",evo:"Evo",ltm:"LTM",otw:"Ones to Watch",partners:"Partners",seriea_potm:"Serie A POTM",epl_potm:"EPL POTM",laliga_potm:"LaLiga POTM",bundesliga_potm:"Bundesliga POTM",ligue1_potm:"Ligue 1 POTM",ligue_1_potm:"Ligue 1 POTM",liga_f_potm:"Liga F POTM",sbc_premium:"SBC Premium",elite_evo:"Elite Evo"}[c] || String(c).replace(/_/g, " "));

let CARDS = [], BYID = new Map(), WEEK = null, INDEX = null;
const state = { A: [], B: [], T: [], simB: [], simA: null };

// ---------- tabs ----------
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("main section").forEach(s => s.classList.toggle("on", s.id === b.dataset.t));
  scrollTo(0, 0);
});

// ---------- data ----------
async function getJSON(p) { const r = await fetch(p + (p.includes("?") ? "&" : "?") + "t=" + Date.now()); if (!r.ok) throw new Error(p); return r.json(); }
const APP_V = "20261016b";
async function selfUpdate() {         // a saved old copy of the site reloads itself when a newer version is live
  // the page itself (index.html) can be an old cached copy even when this script is new: reload it fresh
  const htmlV = (document.querySelector('meta[name="app-version"]') || {}).content;
  if (htmlV !== APP_V) {
    let tried = null; try { tried = sessionStorage.getItem("triedHtml"); } catch (e) {}
    if (tried !== APP_V) { try { sessionStorage.setItem("triedHtml", APP_V); } catch (e) {} location.replace(location.pathname + "?v=" + APP_V + "&t=" + Date.now()); return true; }
  }
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); const v = (await r.json()).v;
    if (v && v !== APP_V) {
      let tried = null; try { tried = sessionStorage.getItem("triedV"); } catch (e) {}
      if (tried !== v) { try { sessionStorage.setItem("triedV", v); } catch (e) {} location.replace(location.pathname + "?v=" + v); return true; }
    }
  } catch (e) {}
  return false;
}
let DATA_UPDATED = "";
async function init() {
  if (await selfUpdate()) return;
  $("appV").textContent = "Version " + APP_V;
  try {
    const d = await getJSON("cards.json");
    CARDS = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
    DATA_UPDATED = fmtStamp(d.updated); $("dataInfo").textContent = `${d.count.toLocaleString()} cards · Updated ${DATA_UPDATED}`;
  } catch (e) { $("dataInfo").textContent = "Card data missing"; }
  try { const nm = await getJSON("names.json"); Object.assign(NATIONS, nm.nations); Object.assign(LEAGUES, nm.leagues); CLUBS = nm.clubs || {}; } catch (e) {}
  for (const M of [NATIONS, LEAGUES, CLUBS]) for (const k in M) M[k] = cap(M[k]);
  try { const ex = await getJSON("results/extras.json"); ex.cards.forEach(c => CARDS.push(Object.assign({specialChem: "", _extra: true}, c))); } catch (e) {}
  if (DATA_UPDATED) $("dataInfo").textContent = `${siteTotal().toLocaleString()} cards · Updated ${DATA_UPDATED}`;   // same total as the Cards tab
  CARDS.forEach(c => { c.name = cap(c.name); c._n = norm(c.name); c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)]); BYID.set(c.id, c); });
  try { INDEX = await getJSON("results/index.json"); WEEK = await getJSON("results/week.json"); } catch (e) {}
  try { FORMS_CACHE = await getJSON("formations.json"); } catch (e) {}
  renderTeams(); setupMC(); setupSim(); setupSBC(); setupCards(); renderSetup();
}

// ---------- shared card UI ----------
const norm = t => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/ł/g, "l").replace(/ı/g, "i").replace(/đ/g, "d");
function search(q, limit = 12, cap = 0) {
  q = norm(q.trim()); if (q.length < 2) return [];
  const out = [];
  for (const c of CARDS) { if ((c._n || (c._n = norm(c.name))).includes(q)) { out.push(c); if (out.length > 300) break; } }
  // exact name matches first, then cards within the cap, then highest rated
  const score = c => (c._n === q ? 0 : c._n.startsWith(q) ? 1 : 2) * 2 + (cap && c.rating > cap ? 1 : 0);
  return out.sort((a, b) => score(a) - score(b) || b.rating - a.rating).slice(0, limit);
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
function pill(r) { return `<span class="pill ${r}">${cap(String(r).toLowerCase())}</span>`; }

// ---------- custom builds (run on GitHub) ----------
const resultLabel = k => k.replace(/^reference (\d+)$/, "Reddit Reference Team $1").replace(/^counter (\d+)$/, "Counter Team $1")
  .replace(/^mirror$/, "Copy of This Team").replace(/^target (\d+)$/, "Team to Beat").replace(/^fresh test (\d+)$/, "Fresh Stress Test $1").replace(/^final check (\d+)$/, "Final Check Team $1");
// The site can start builds itself with a GitHub key saved on this phone only (Weekly setup → Connect GitHub).
const ghToken = () => { try { return localStorage.getItem("ghToken") || ""; } catch (e) { return ""; } };
async function ghGetFile(path) {          // { text, sha } of a file on main, or null
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=main&t=${Date.now()}`, { headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub said ${r.status}`);
  const j = await r.json();
  return { sha: j.sha, text: decodeURIComponent(escape(atob(j.content.replace(/\n/g, "")))) };
}
async function ghDeleteFile(path, message) {
  const f = await ghGetFile(path); if (!f) return;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { method: "DELETE",
    headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github+json" }, body: JSON.stringify({ message, branch: "main", sha: f.sha }) });
  if (!r.ok) throw new Error(`GitHub said ${r.status}`);
}
async function ghPutFile(path, content, message, sha) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT", headers: { Authorization: `Bearer ${ghToken()}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(Object.assign({ message, branch: "main", content: btoa(unescape(encodeURIComponent(content))) }, sha ? { sha } : {})) });
  if (!r.ok) throw new Error(`GitHub said ${r.status}${r.status === 401 || r.status === 403 ? " (the GitHub key is wrong or expired)" : ""}`);
  return r.json();
}
async function startBuild(req) {
  const t = new Date(), pad = n => String(n).padStart(2, "0");
  const stem = `${req.mode}-${req.series}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}`;
  req.created = t.toISOString();
  const mins = Math.round((req.minutes || 30) * 1.1 + 8);
  if (!ghToken()) {
    alert(`To start builds from the site, connect GitHub once:\n\nSeason Setup tab → "Connect GitHub".\n\nIt takes about 2 minutes and then every build is one tap.`);
    document.querySelector('#tabs button[data-t="setup"]').click();
    const box = $("ghBox"); if (box) box.scrollIntoView({ behavior: "smooth" });
    return;
  }
  if (!confirm(`Start this build?\n\nIt runs on GitHub (you can close the site). The team appears in the Beat a team tab in about ${mins} minutes.`)) return;
  try {
    await ghPutFile(`config/requests/${stem}.json`, JSON.stringify(req, null, 1), `Build request: ${req.name}`);
    alert(`Started ✓\n\nCheck back in about ${mins} minutes. Progress: GitHub → Actions → "Custom build".`);
  } catch (e) { alert("Couldn't start the build: " + e.message); }
}
function oppTeamRows(t, k, series) {    // the opponent's team: saved by the builder, or (Reddit teams) from the weekly setup
  const sv = t.opponent_teams && t.opponent_teams[k];
  if (sv) return { meta: `${sv.formation || ""} · ${sv.chem} chem`, players: sv.players };
  const m = /^reference (\d+)$/.exec(k), ids = m && series && (series.opponents || [])[+m[1] - 1];
  if (!ids) return null;
  const team = ids.map(id => BYID.get(id)).filter(Boolean); if (team.length !== 11) return null;
  const E = effective(team, series);
  return { meta: `${E.reduce((a, e) => a + e.chem, 0)} chem`, players: team.map((c, i) => ({ slot: c.position, id: c.id, name: c.name, rating: c.rating, color: c.color,
    nationId: c.nationId, leagueId: c.leagueId, card: [c.attack, c.control, c.defense], eff: [E[i].a, E[i].c, E[i].d], chem: E[i].chem, tiebreak: E[i].t })) };
}
let OPPS = [];
function oppList(t, series) {          // every opponent tested: tap a name to see their team
  return `<div class="opps">${Object.entries(t.results || {}).map(([k, v]) => {
    const o = oppTeamRows(t, k, series); let body;
    if (o) { OPPS.push({ mine: t.players.map(p => p.id), theirs: o.players.map(p => p.id), key: series && series.key });
      body = `<p class="meta" style="margin:6px 0 4px">${esc(o.meta)}</p>${playersTable(o.players, true)}<div class="row" style="margin:8px 0 4px"><button class="ghost" data-opp="${OPPS.length - 1}" style="font-size:12.5px">Open in My Club Compare</button></div>`; }
    else body = `<p class="small muted" style="margin:6px 0">This team wasn't saved by this build. Teams are saved from the next build onwards.</p>`;
    return `<details class="opp"><summary><span class="on">${esc(resultLabel(k))}</span><span class="res">${pill(v.you_lead_first)} ${pill(v.they_lead_first)}</span></summary>${body}</details>`;
  }).join("")}</div>`;
}
function wireOpps() {
  document.querySelectorAll("[data-opp]").forEach(b => b.onclick = () => {
    const o = OPPS[+b.dataset.opp];
    state.A = o.mine.map(id => BYID.get(id)).filter(Boolean); state.B = o.theirs.map(id => BYID.get(id)).filter(Boolean);
    if (o.key) $("mcSeries").value = o.key; drawMC(); $("solveOut").innerHTML = "";
    document.querySelector('#tabs button[data-t="mc"]').click(); window.scrollTo(0, 0);
  });
}
function resultsTable(res) {
  return `<table><tr><th>Opponent</th><th>You lead first</th><th>They lead first</th></tr>${Object.entries(res).map(([k, v]) => `<tr><td>${esc(resultLabel(k))}</td><td>${pill(v.you_lead_first)}</td><td>${pill(v.they_lead_first)}</td></tr>`).join("")}</table>`;
}

// ---------- Don't have: a personal version of a team, rebuilt without cards you don't own ----------
// Best Teams always assume everyone owns every card. A "Don't have" rebuild makes YOUR version
// (docs/results/mine/...), shown only on this phone; everyone else keeps seeing the full team.
const wkKey = p => p + ":" + ((INDEX && INDEX.week) || "");
const lsGet = k => { try { return JSON.parse(localStorage.getItem(wkKey(k)) || "{}"); } catch (e) { return {}; } };
const lsSet = (k, v) => { try { localStorage.setItem(wkKey(k), JSON.stringify(v)); } catch (e) {} };
const noHave = k => lsGet("nohave")[k] || [];                       // picked, not rebuilt yet
function nhSet(k, ids) { const a = lsGet("nohave"); if (ids.length) a[k] = ids; else delete a[k]; lsSet("nohave", a); }
const mineOf = k => lsGet("mine")[k] || null;                      // { ids, at } = your version was requested
function mineSet(k, v) { const a = lsGet("mine"); if (v) a[k] = v; else delete a[k]; lsSet("mine", a); }
const viewOf = k => lsGet("mineview")[k] || "mine";
function viewSet(k, v) { const a = lsGet("mineview"); a[k] = v; lsSet("mineview", a); }
const cardNames = ids => ids.map(id => { const c = BYID.get(id); return c ? cap(c.name) + " " + c.rating : id; });
const sameSet = (a, b) => (a || []).length === (b || []).length && (a || []).every(x => (b || []).includes(x));
async function versionOf(k, f, d) {          // -> { d: the version to show, bar: html above the players }
  if (!ghToken()) return { d, bar: "", nh: noHaveBar(k), which: null };     // personal versions belong to the phone with the GitHub key
  let dm = null; try { dm = await getJSON("results/mine/" + f); } catch (e) {}
  if (dm && (dm.week !== INDEX.week || !(dm.not_owned_ids || []).length)) dm = null;
  let m = mineOf(k);
  if (m && !m.ids.length) return { d, bar: "", nh: noHaveBar(k), which: null };     // you got every card back: everyone's team
  if (!m && dm) m = { ids: dm.not_owned_ids };                   // built earlier (or on another visit)
  if (!m) return { d, bar: "", nh: noHaveBar(k), which: null };
  const ready = dm && sameSet(dm.not_owned_ids, m.ids); let which = "everyone";
  const names = esc(cardNames(m.ids).join(", ")), got = m.ids.map(id => `<button class="ghost small" data-got="${esc(k)}|${esc(id)}" data-all="${esc(m.ids.join(","))}" style="padding:3px 9px">Got ${esc(cardNames([id])[0])}</button>`).join("");
  let bar = `<div class="minebar">`;
  if (!ready) bar += `<p class="small" style="margin:0 0 6px"><b>Your version</b> without ${names} is building (about ${k.startsWith("sim") ? 5 : 50} min). Showing everyone's team for now.</p>`;
  else if (viewOf(k) === "mine") { bar += `<p class="small" style="margin:0 0 6px"><b>Your version</b>, built without ${names}. Everyone else sees the full team.</p><div class="row" style="margin:0 0 6px"><button class="ghost" data-view="${esc(k)}|everyone" style="padding:4px 10px;font-size:12.5px">Show Everyone's Team</button></div>`; d = dm; which = "mine"; }
  else bar += `<p class="small" style="margin:0 0 6px">Showing <b>everyone's team</b>.</p><div class="row" style="margin:0 0 6px"><button class="ghost" data-view="${esc(k)}|mine" style="padding:4px 10px;font-size:12.5px">Show Your Version (without ${names})</button></div>`;
  bar += `<div class="row" style="margin:0 0 4px">${got}</div><div class="row" data-gotgo-row="${esc(k)}" hidden style="margin:4px 0"><button class="btn" data-gotgo="${esc(k)}" data-all="${esc(m.ids.join(","))}">Update Your Version</button></div><p class="small muted" style="margin:0 0 8px">Got cards since? Tap each one, then Update Your Version (one rebuild).</p></div>`;
  return { d, bar, nh: noHaveBar(k), which };
}
function noHaveBar(k) {
  const ids = noHave(k);
  let h = `<div class="nhbar" data-nhbar="${esc(k)}">`;
  if (ids.length) h += `<p class="small" style="margin:2px 0 6px"><b>Don't have:</b> ${esc(cardNames(ids).join(", "))}</p><div class="row" style="margin:0 0 10px"><button class="btn" data-nhgo="${esc(k)}">Rebuild Without Them</button><button class="ghost" data-nhclear="${esc(k)}">Undo</button></div>`;
  return h + `</div>`;
}
function wireNoHave() {
  const redraw = k => { const bar = document.querySelector(`[data-nhbar="${k}"]`); if (bar) bar.outerHTML = noHaveBar(k); wireNoHave(); };
  document.querySelectorAll("[data-nh]").forEach(b => b.onclick = () => {
    const k = b.dataset.nh, ids = noHave(k), i = ids.indexOf(b.dataset.id);
    if (i >= 0) ids.splice(i, 1); else ids.push(b.dataset.id);
    nhSet(k, ids); b.classList.toggle("on", i < 0); redraw(k);
  });
  document.querySelectorAll("[data-nhclear]").forEach(b => b.onclick = () => {
    const k = b.dataset.nhclear; nhSet(k, []);
    document.querySelectorAll(`[data-nh="${k}"]`).forEach(x => x.classList.remove("on")); redraw(k);
  });
  document.querySelectorAll("[data-nhgo]").forEach(b => b.onclick = () => rebuildWithout(b.dataset.nhgo, [...new Set([...((mineOf(b.dataset.nhgo) || {}).ids || []), ...noHave(b.dataset.nhgo)])]));
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { const [k, v] = b.dataset.view.split("|"); viewSet(k, v); renderTeams(); });
  document.querySelectorAll("[data-got]").forEach(b => b.onclick = () => {     // mark; one rebuild for all of them
    b.classList.toggle("on"); b.style.borderColor = b.classList.contains("on") ? "var(--win)" : "";
    const k = b.dataset.got.split("|")[0], any = document.querySelectorAll(`[data-got^="${CSS.escape(k)}|"].on`).length;
    const row = document.querySelector(`[data-gotgo-row="${CSS.escape(k)}"]`); if (row) row.hidden = !any;
  });
  document.querySelectorAll("[data-gotgo]").forEach(b => b.onclick = () => {
    const k = b.dataset.gotgo, cur = mineOf(k) || { ids: (b.dataset.all || "").split(",").filter(Boolean) };
    const got = [...document.querySelectorAll(`[data-got^="${CSS.escape(k)}|"].on`)].map(x => x.dataset.got.split("|")[1]);
    const rest = cur.ids.filter(x => !got.includes(x));
    if (!rest.length) {                                   // nothing missing any more: back to everyone's team
      const [kind, key] = k.split(":");
      mineSet(k, { ids: [], at: new Date().toISOString() }); viewSet(k, "everyone");
      ghDeleteFile(`docs/results/mine/${kind}_${key}.json`, `Got every card for ${k}: back to everyone's team`).catch(() => {});
      renderTeams(); return;
    }
    rebuildWithout(k, rest, true);
  });
}
async function rebuildWithout(k, ids, afterGot) {
  const [kind, key] = k.split(":");
  if (!ghToken()) {
    alert(`Rebuilding needs the site's GitHub connection (Season Setup tab → "Connect GitHub"), which only the site owner has.`);
    return;
  }
  const mins = kind === "sim" ? 5 : 50;
  if (!confirm(`${afterGot ? "Rebuild your version" : "Build your own version of"} the ${key} series without ${cardNames(ids).join(", ")}?\n\nIt runs on GitHub and takes about ${mins} minutes. Only you see it; everyone else keeps the full team. It lasts until the season ends.`)) return;
  try {
    const t = new Date(), pad = n => String(n).padStart(2, "0");
    await ghPutFile(`config/requests/rebuild-${kind}-${key}-${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}.json`,
      JSON.stringify({ mode: "rebuild", kind, series: key, not_owned: ids, name: `Rebuild ${k}`, created: t.toISOString() }, null, 1), `Personal rebuild ${k} without ${ids.length} card(s)`);
    mineSet(k, { ids, at: t.toISOString() }); viewSet(k, "mine"); nhSet(k, []);
    alert(`Started ✓\n\nYour version of ${key} appears here in about ${mins} minutes (refresh the site).`);
    renderTeams();
  } catch (e) { alert("Couldn't start the rebuild: " + e.message); }
}

const vtag = (which, d) => !which ? "" : which === "mine"
  ? `<p class="vtag mine">Your version <span>· without ${esc(cardNames(d.not_owned_ids || []).join(", "))}</span></p>`
  : `<p class="vtag">Everyone's team <span>· assumes every card</span></p>`;

// ---------- Game plan (computed after each build by scripts/plan.js) ----------
function planHtml(p) {
  const chips = L => L.map(x => `<span class="chip">${esc(cap(x.name))} · ${esc(cap(x.stat))}</span>`).join(" ");
  const keep = { WIN: "to keep the guaranteed win:", DRAW: "to keep the guaranteed draw:", LOSS: "— they do best, but a perfect opponent can still win:" };
  const verb = { WIN: "you win", DRAW: "you draw", LOSS: "you lose" };
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => x.name === b[i].name && x.stat === b[i].stat);
  const lead = L => L.length >= p.total_openers ? `<p class="small muted" style="margin:2px 0">Any card: every opening lead gives the same result against perfect play.</p>` : `<div class="chips" style="margin:4px 0">${chips(L)}</div>`;
  let h = `<details class="plan" open><summary>Game Plan</summary>`;
  h += `<p class="small" style="margin:6px 0 0"><b>When you lead first</b>, open with one of these ${keep[p.guaranteed] || ":"}</p>${lead(p.safe)}`;
  if (p.reddit && !same(p.reddit.safe, p.safe)) h += `<p class="small" style="margin:8px 0 0"><b>Against the Reddit Team</b> (${verb[p.reddit.guaranteed]} with perfect play), open with:</p>${lead(p.reddit.safe)}`;
  h += `<p class="small" style="margin:8px 0 0"><b>When they lead first</b>, use Match Helper for the best answer each round.</p>`;
  if (p.watch.length) h += `<p class="small" style="margin:8px 0 2px"><b>Cards to watch</b></p><ul class="small" style="margin:0;padding-left:18px">${p.watch.map(w => `<li><b>${esc(cap(w.name))}</b>: ${esc(w.text)}</li>`).join("")}</ul>`;
  h += `<p class="small" style="margin:8px 0 4px"><b>Tiebreak</b>: your 11th (unplayed) card plays it. Play <b>${esc(cap(p.low_tb.name))}</b> (total ${p.low_tb.tb}) before the end. Highest total: <b>${esc(cap(p.high_tb.name))}</b> (${p.high_tb.tb}).</p></details>`;
  return h;
}

// ---------- Teams tab ----------
// Each series is a folded strip (like the game): number, formation and results; tap to open the full team.
const OPEN = new Set();                   // series left open, kept when the page redraws (e.g. switching versions)
const strip = (k, title, sub, res) => `<summary class="strip"><span class="k">${esc(k)}</span><span class="mid"><b>${esc(title)}</b><small>${sub}</small></span><span class="res">${res}</span></summary>`;
const serOpen = id => OPEN.has(id) ? " open" : "";
let VAULT = null;     // { week, files } when looking at a past week
async function renderTeams() {
  const box = $("teamsBody"), V = VAULT, base = V ? `vault/${V.week}/` : "results/";
  if (!INDEX && !V) { box.innerHTML = `<div class="card">No results yet. Fill in <b>Season Setup</b> and they'll appear here once the build finishes.</div>`; return; }
  let weeks = []; if (!V) { try { weeks = (await getJSON("vault/index.json")).weeks || []; } catch (e) {} }
  const vaultBox = V ? "" : `<details class="card"><summary>Vault</summary><p class="small muted" style="margin:6px 0">Past seasons' teams, saved automatically when a new season starts.</p>${weeks.length
      ? `<div class="chips">${weeks.map((w, i) => { return w.files.length ? `<button class="chipbtn" data-vault="${i}"><b>${esc(seasonName(w.week))}</b><span>Week of ${esc(fmtDay(w.week))} · ${w.files.length} team${w.files.length === 1 ? "" : "s"}</span></button>`
            : `<div class="chipbtn off"><b>${esc(seasonName(w.week))} <span class="tag">Not built</span></b><span>Week of ${esc(fmtDay(w.week))} · ${esc(w.missing || "Not available")}</span></div>`; }).join("")}</div>`
      : `<p class="small muted">Nothing yet. This season moves here when the next one starts.</p>`}</details>`;
  OPPS = []; let html = `<div class="card"><h2>Best Teams</h2><p class="meta">${esc(seasonName(V ? V.week : INDEX.week))} · Week of ${esc(fmtDay(V ? V.week : INDEX.week || ""))}</p>${V ? `<p class="small" style="margin:4px 0 8px"><b>Vault:</b> a past season, kept for reference.${V.note ? " " + esc(V.note) : ""}</p><p style="margin:0 0 8px"><button class="ghost" id="vaultBack">Back to This Season</button></p>` : ""}<p class="small" style="margin:4px 0 0">For each series: the team with the <b>best worst case</b>. It's judged by its worst result against the Reddit team and against stress-test teams built specifically to beat it, so it's the hardest team to oppose. To counter one particular team, use <b>Beat a team</b>.</p><p class="small muted" style="margin:6px 0 0">Stats are in-game (boosts + chem). TB = tiebreak total.</p></div>` + vaultBox;
  const files = V ? V.files : INDEX.files || [];
  const mc = files.filter(f => f.startsWith("myclub_")), sim = files.filter(f => f.startsWith("sim_"));
  const rank = { WIN: 2, DRAW: 1, LOSS: 0 };
  html += `<h3>Fatal My Club</h3>`;
  for (const f of mc) {
    try {
      let d = await getJSON(base + f), bar = "", nh = "", which = null;
      if (!V) ({ d, bar, nh, which } = await versionOf("myclub:" + d.series.key, f, d));
      const t = d.team;
      let worst = null;
      for (const [k, v] of Object.entries(t.results || {})) for (const [who, r] of [["you lead first", v.you_lead_first], ["they lead first", v.they_lead_first]])
        if (!worst || rank[r] < rank[worst.r]) worst = { r, who, k };
      const refs = Object.entries(t.results || {}).filter(([k]) => k.startsWith("reference"));
      const sid = "myclub:" + d.series.key, mineTag = which === "mine" ? " · <b class=\"gold\">Your version</b>" : "";
      const sres = `${refs.length ? `<span class="rp">${refs.slice(0, 1).map(([k, v]) => pill(v.you_lead_first) + pill(v.they_lead_first)).join("")}</span><small>VS Reddit</small>` : ""}${worst ? `<span class="rp">${pill(worst.r)}</span><small>Worst case</small>` : ""}`;
      html += `<details class="card sercard" data-ser="${esc(sid)}"${serOpen(sid)}>${strip(d.series.key, t.formation || "", `${t.chem} chem${mineTag}`, sres)}<div class="body"><p class="meta">${esc(d.series.key)} Series · ${esc(t.formation || "")} · ${t.chem} chem</p>${bar}${vtag(which, d)}`;
      if (t.source && t.source.startsWith("Reddit")) html += `<p class="verdict">✓ Copy the Reddit Team <span>· nothing the builder found has a better worst case</span></p>`;
      else if (t.source === "Previous Best") html += `<p class="verdict">✓ Still the best <span>· the latest search found nothing with a better worst case</span></p>`;
      else if (t.source && t.source.startsWith("Hand")) html += `<p class="verdict">✓ Hand-Built Team <span>· it beat the builder's own team on worst case</span></p>`;
      else if (t.source === "Polished") html += `<p class="verdict">✓ Improved <span>· a card-by-card swap check found a better team, then passed new stress tests</span></p>`;
      const box = (label, inner, note) => `<div class="sc"><span>${label}</span>${inner}${note ? `<small>${note}</small>` : ""}</div>`;
      if (refs.length || worst) html += `<div class="score">${refs.length ? box("VS Reddit Team", refs.map(([k, v]) => `${pill(v.you_lead_first)}${pill(v.they_lead_first)}`).join(" "), "You lead · they lead") : box("VS Reddit Team", `<span class="muted small">Not added</span>`)}${worst ? box("Worst Case", pill(worst.r), `${esc(resultLabel(worst.k))}, ${worst.who}${t.mode !== "robust" ? ". Built before worst-case mode" : ""}`) : ""}</div>`;
      if (t.plan) html += planHtml(t.plan);
      html += nh + playersTable(t.players, true, V ? null : "myclub:" + d.series.key);
      const wser = V ? d.series : ((WEEK && WEEK.myclub) || []).find(x => x.key === d.series.key) || d.series;
      if (t.results) html += `<details style="margin-top:6px"><summary class="small">All Results and What They Mean</summary><p class="small muted" style="margin:6px 0 2px">Tap any opponent to see their team. Results: you lead first, they lead first.</p>${oppList(t, wser)}<p class="small" style="margin:10px 0 6px">
        <b>Reddit Reference Team</b>: the team posted on Reddit for this series (when added in Season Setup).<br>
        <b>Copy of This Team</b>: when the strongest stress test found is simply your own team (someone copying you).<br>
        <b>Counter Teams</b>: stress tests. The builder searched every card under the cap for the team that does best against this one, improved this team, and repeated.<br>
        <b>Fresh Stress Tests</b>: new counter teams searched after the team was finished and never used to build it — the honest check of how hard it is to beat.<br>
        <b>Final Check Teams</b>: stress tests built against the Reddit Team and the Hand-Built Team, so every option faces teams built to beat it. The team shown is whichever has the best worst case against all of these.<br>
        A counter team is built knowing exactly what you're using, so losing to one is a worst case, not what a normal opponent does.</p></details>`;
      html += `<p class="built">Built ${esc(fmtStamp(d.built))}</p></div></details>`;
    } catch (e) {}
  }
  html += `<h3>Fatal Sim</h3>`;
  for (const f of sim) {
    try {
      let d = await getJSON(base + f), bar = "", nh = "", which = null;
      if (!V) ({ d, bar, nh, which } = await versionOf("sim:" + d.series.key, f, d));
      const t = d.teams && d.teams[0]; if (!t) continue;
      const m = t.metrics;
      const avg = (l, v) => `<div class="sc"><span>${l}</span><b class="big" style="font-size:28px">${v}</b></div>`;
      const sid = "sim:" + d.series.key, mineTag = which === "mine" ? " · <b class=\"gold\">Your version</b>" : "";
      const sres = `<span class="cad"><i>C</i>${m.control}<i>A</i>${m.attack}<i>D</i>${m.defence}</span><small>Averages</small>`;
      html += `<details class="card sercard" data-ser="${esc(sid)}"${serOpen(sid)}>${strip(d.series.key, t.formation, `${m.chem} chem${mineTag}`, sres)}<div class="body"><p class="meta">${esc(d.series.key)} Series · ${esc(t.formation)} · ${m.chem} chem · averages below</p>${bar}${vtag(which, d)}<div class="score" style="grid-template-columns:1fr 1fr 1fr">${avg("Control", m.control)}${avg("Attack", m.attack)}${avg("Defence", m.defence)}</div>${nh}${playersTable(t.players, false, V ? null : "sim:" + d.series.key)}<p class="built">Built ${esc(fmtStamp(d.built))}</p></div></details>`;
    } catch (e) {}
  }
  if (!V) {
    box.innerHTML = html;
    document.querySelectorAll("[data-vault]").forEach(b => b.onclick = () => { VAULT = weeks[+b.dataset.vault]; renderTeams(); window.scrollTo(0, 0); });
  } else {
    box.innerHTML = html;
    $("vaultBack").onclick = () => { VAULT = null; renderTeams(); window.scrollTo(0, 0); };
  }
  document.querySelectorAll("details.sercard").forEach(x => x.ontoggle = () => { x.open ? OPEN.add(x.dataset.ser) : OPEN.delete(x.dataset.ser); });
  wireOpps(); if (!V) wireNoHave();
}
function playersTable(ps, showTB, nh) {     // nh = "myclub:73" adds a Don't have button to each player
  return `<div class="squad"><div class="stkey"><span>Att</span><span>Ctl</span><span>Def</span></div>${ps.map(p =>
    `<div class="prow"><span class="pos">${esc(p.slot)}</span><span class="nm"><b>${esc(cap(p.name))}</b><span class="r">${p.rating}</span>${showTB && p.tiebreak != null ? `<span class="tb">TB ${p.tiebreak}</span>` : ""}<small>${esc(TYPE(p.color))} · ${esc(nName(p.nationId))} · ${esc(lName(p.leagueId))}</small><small>Card ${p.card.join("/")} · Chem ${p.chem}</small></span><span class="sc2"><span class="st"><span class="a">${p.eff[0]}</span><span class="c">${p.eff[1]}</span><span class="d">${p.eff[2]}</span></span>${nh ? `<button class="nohave${noHave(nh).includes(p.id) ? " on" : ""}" data-nh="${esc(nh)}" data-id="${esc(p.id)}">Don't have</button>` : ""}</span></div>`).join("")}</div>`;
}

// ---------- My Club compare ----------
let MYTEAMS = {}, CUSTOM = [];
let MCW = { week: "", base: "results/", myclub: [], files: [] };   // the week My Club Compare uses: this week or a Vault week
function mcSeries() { const k = $("mcSeries").value; return MCW.myclub.find(s => s.key === k) || { boosts: [], key: "" }; }
function beatSeries() { const k = $("beatSeries").value; return (WEEK && WEEK.myclub || []).find(s => s.key === k) || { boosts: [], key: "" }; }
const serOf = side => side === "T" ? beatSeries() : mcSeries();
const SIDE = { A: "Your team", B: "Their team", T: "Team to beat" };
const short = ids => ids.map(id => BYID.get(id)).filter(Boolean).slice(0, 3).map(c => c.name).join(", ") + "…";
function savedTeams() { try { return JSON.parse(localStorage.getItem("mcSaved") || "[]"); } catch (e) { return []; } }
function setSaved(list) { try { localStorage.setItem("mcSaved", JSON.stringify(list)); } catch (e) {} }
async function setupMC() {
  for (const f of ((INDEX && INDEX.files) || []).filter(f => f.startsWith("custom_"))) { try { CUSTOM.push(await getJSON("results/" + f)); } catch (e) {} }
  try { const mt = await getJSON("myteams.json"); if (WEEK && mt.week === WEEK.week) MYTEAMS = mt.teams || {}; } catch (e) {}
  const ser = (WEEK && WEEK.myclub) || [];
  MCW = { week: "", base: "results/", myclub: ser, files: (INDEX && INDEX.files) || [] };
  let weeks = []; try { weeks = (await getJSON("vault/index.json")).weeks || []; } catch (e) {}
  weeks = weeks.filter(w => w.files.some(f => f.startsWith("myclub_")));
  if ($("mcWeek")) $("mcWeek").innerHTML = `<option value="">${esc(seasonName(WEEK && WEEK.week))} (This Season)</option>` + weeks.map(w => `<option value="${esc(w.week)}">${esc(seasonName(w.week))}</option>`).join("");
  const fillSeries = () => { $("mcSeries").innerHTML = MCW.myclub.map(s => `<option value="${esc(s.key)}">${esc(s.key)} Series</option>`).join("") + `<option value="">No Series (No Boosts)</option>`; };
  if ($("mcWeek")) $("mcWeek").onchange = async () => {
    const wk = $("mcWeek").value;
    if (!wk) MCW = { week: "", base: "results/", myclub: ser, files: (INDEX && INDEX.files) || [] };
    else { let w = {}; try { w = await getJSON(`vault/${wk}/week.json`); } catch (e) {}
      MCW = { week: wk, base: `vault/${wk}/`, myclub: w.myclub || [], files: (weeks.find(x => x.week === wk) || { files: [] }).files }; }
    fillSeries(); drawMC(); $("solveOut").innerHTML = "";
  };
  fillSeries();
  $("mcSeries").onchange = () => { drawMC(); $("solveOut").innerHTML = ""; };
  $("solveBtn").onclick = solveMC;
  $("swapBtn").onclick = () => { [state.A, state.B] = [state.B, state.A]; drawMC(); $("solveOut").innerHTML = ""; };
  $("beatSeries").innerHTML = ser.map(s => `<option value="${esc(s.key)}">${esc(s.key)} Series</option>`).join("");
  $("beatSeries").onchange = () => { drawMC(); drawBeatResults(); };
  $("beatGo").onclick = () => {
    const s = beatSeries();
    if (state.T.length !== 11) { alert("Add all 11 players of the team you want to beat first."); return; }
    startBuild({ name: `Beat ${state.T.slice(0, 3).map(c => c.name).join(", ")}`, series: s.key, mode: "beat", minutes: +$("beatMin").value, opponents: [state.T.map(c => c.id)] });
  };
  drawMC(); drawBeatResults();
}
function drawBeatResults() {
  const key = beatSeries().key, L = CUSTOM.filter(c => c.request && c.request.mode === "beat" && c.series.key === key)
    .sort((a, b) => String(b.built).localeCompare(String(a.built)));
  $("beatResults").innerHTML = `<h3>Finished ${esc(key)} builds</h3>` + (L.length ? L.map(d => {
    const t = d.team, r = Object.values(t.results || {})[0] || {};
    return `<div class="card"><h2>Against ${esc((d.opponents[0] || []).map(cap).slice(0, 4).join(", "))}…</h2>
      <p>You lead first ${pill(r.you_lead_first || "?")} &nbsp; They lead first ${pill(r.they_lead_first || "?")}</p>
      <p class="small muted">${esc(t.formation || "")} · ${t.chem} chem · ${esc(d.request.minutes)} min search · built ${esc(d.built)}</p>${playersTable(t.players, true)}
      <div class="row" style="margin-top:8px"><button class="ghost" data-usebeat="${CUSTOM.indexOf(d)}" style="font-size:12.5px">Open both teams in My Club compare</button></div></div>`;
  }).join("") : `<p class="small muted">None yet for this series. Builds you start appear here when they finish (refresh the site).</p>`);
  document.querySelectorAll("[data-usebeat]").forEach(b => b.onclick = () => {
    const d = CUSTOM[+b.dataset.usebeat];
    state.A = d.team.players.map(p => BYID.get(p.id)).filter(Boolean);
    state.B = (d.request.opponents[0] || []).map(id => BYID.get(id)).filter(Boolean);
    $("mcSeries").value = d.series.key; drawMC(); $("solveOut").innerHTML = "";
    document.querySelector('#tabs button[data-t="mc"]').click();
  });
}
function loadButtons(side) {
  const s = serOf(side), out = [];
  const vault = side !== "T" && MCW.week;      // a past week: only that week's own teams (plus your saved ones)
  if (side === "A" && !vault && MYTEAMS[s.key]) out.push({ k: "mine", t: `Hand-Built ${s.key} Team`, d: (MYTEAMS[s.key].note ? MYTEAMS[s.key].note + " · " : "") + short(MYTEAMS[s.key].ids) });
  if (side === "A" && (side === "T" ? (INDEX && INDEX.files) || [] : MCW.files).includes(`myclub_${s.key}.json`)) out.push({ k: "built", t: `Site-Built ${s.key} Team`, d: vault ? "From that season's build" : "From this season's build" });
  if (side === "A" && !vault) CUSTOM.filter(c => c.series.key === s.key && c.request.mode === "beat").forEach(c => out.push({ k: "custom" + CUSTOM.indexOf(c), t: "Built to Beat", d: "Against " + (c.opponents[0] || []).slice(0, 3).map(cap).join(", ") + "…" }));
  (s.opponents || []).forEach((ids, i) => out.push({ k: "ref" + i, t: `Reddit Reference Team ${(s.opponents.length > 1 ? i + 1 : "")}`.trim(), d: short(ids) }));
  savedTeams().forEach((t, i) => out.push({ k: "saved" + i, t: "★ " + t.name, d: short(t.ids), del: i }));
  return out;
}
function panelHtml(side) {
  const team = state[side], s = serOf(side), E = team.length ? effective(team, s) : [];
  const btns = loadButtons(side);
  let h = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${SIDE[side]} <span class="muted small">${team.length}/11${team.length ? " · chem " + E.reduce((a, e) => a + e.chem, 0) : ""}</span></h2>
    ${team.length ? `<button class="ghost" data-clear="${side}" style="padding:4px 9px;font-size:12px">Clear</button>` : ""}</div>`;
  if (btns.length) h += `<div class="small muted" style="margin-top:8px">Load a team:</div><div class="chips">${btns.map(b => `<button class="chipbtn" data-load="${side}:${b.k}"><b>${esc(b.t)}</b><span>${esc(cap(b.d))}</span></button>${b.del != null ? `<button class="x" data-unsave="${b.del}" title="Delete saved team">✕</button>` : ""}`).join("")}</div>`;
  h += `<div>${Array.from({ length: 11 }, (_, i) => {
    const c = team[i];
    if (!c) return `<div class="slot"><span class="num">${i + 1}</span><span class="who muted">—</span></div>`;
    const e = E[i];
    const alts = versions(c, side).length > 1;
    return `<div class="slot"><span class="num">${i + 1}</span><span class="who"><b>${esc(c.name)}</b> ${c.rating}${alts ? ` <button class="x" data-alt="${side}:${i}" title="Other versions of this player" style="font-size:13px;color:var(--accent)">⇄</button>` : ""}<br><span class="muted small">${esc(c.position)} · ${esc(TYPE(c.color))} · ${esc(cName(c.clubId))}</span></span>
      <span class="st">A ${e.a} · C ${e.c} · D ${e.d}<br>Chem ${e.chem} · TB ${e.t}</span><button class="x" data-del="${side}:${i}">✕</button></div>`;
  }).join("")}</div>`;
  if (team.length < 11) h += `<input type="text" id="q${side}" placeholder="Add a player — type a name" style="margin-top:10px"><ul class="sr" id="r${side}" hidden></ul>
    <details style="margin-top:8px"><summary class="small">Paste several names at once</summary>
      <p class="small muted" style="margin:6px 0">Separate with commas or new lines. If a name has several versions, add the rating or club, e.g. <code>Costa 67</code> or <code>Sarr Neom</code>. You can also tap ⇄ on a player to switch version.</p>
      <textarea id="p${side}" placeholder="Radelet, Pupe, Coulibaly, …"></textarea>
      <div class="row" style="margin-top:6px"><button class="ghost" data-paste="${side}">Add these</button><span id="pm${side}" class="small"></span></div></details>`;
  else h += `<div class="row" style="margin-top:10px"><button class="ghost" data-save="${side}" style="font-size:12.5px">★ Save this team</button>${side === "B" && mcSeries().key ? `<button class="ghost" data-beat="1" style="font-size:12.5px">Beat this team</button>` : ""}</div>`;
  return h;
}
const seriesInfo = s => s.key ? `Cap ${s.cap || "?"}${(s.boosts || []).length ? ` · ${s.boosts.length} boost${s.boosts.length > 1 ? "s" : ""} applied` : " · no boosts"}. Stats shown are in-game (boosts + chem). TB = tiebreak total.` : "No boosts applied.";
function drawMC() {
  $("mcInfo").innerHTML = seriesInfo(mcSeries());
  if ($("beatInfo")) $("beatInfo").innerHTML = seriesInfo(beatSeries());
  for (const side of ["A", "B", "T"]) if ($("panel" + side)) $("panel" + side).innerHTML = panelHtml(side);
  document.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => { state[b.dataset.clear] = []; drawMC(); });
  document.querySelectorAll("[data-alt]").forEach(b => b.onclick = () => {
    const [sd, i] = b.dataset.alt.split(":"), c = state[sd][+i], L = versions(c, sd).filter(x => x.id === c.id || !state[sd].some(y => y.id === x.id));
    state[sd][+i] = L[(L.findIndex(x => x.id === c.id) + 1) % L.length]; $("solveOut").innerHTML = ""; drawMC();
  });
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const [sd, i] = b.dataset.del.split(":"); state[sd].splice(+i, 1); drawMC(); });
  document.querySelectorAll("[data-load]").forEach(b => b.onclick = () => loadTeam(...b.dataset.load.split(":")));
  document.querySelectorAll("[data-unsave]").forEach(b => b.onclick = () => { const l = savedTeams(); if (confirm(`Delete saved team "${l[+b.dataset.unsave].name}"?`)) { l.splice(+b.dataset.unsave, 1); setSaved(l); drawMC(); } });
  document.querySelectorAll("[data-save]").forEach(b => b.onclick = () => {
    const n = prompt("Name for this team (e.g. Jake's 79):"); if (!n) return;
    const l = savedTeams(); l.push({ name: n.trim(), ids: state[b.dataset.save].map(c => c.id), key: serOf(b.dataset.save).key }); setSaved(l); drawMC();
  });
  document.querySelectorAll("[data-paste]").forEach(b => b.onclick = () => pasteNames(b.dataset.paste));
  document.querySelectorAll("[data-beat]").forEach(b => b.onclick = () => {   // send "their team" to the Beat a team tab
    state.T = state.B.slice(); $("beatSeries").value = mcSeries().key; drawMC(); drawBeatResults();
    document.querySelector('#tabs button[data-t="beat"]').click();
  });
  for (const side of ["A", "B", "T"]) {
    const inp = $("q" + side), ul = $("r" + side); if (!inp) continue;
    inp.oninput = () => {
      const cap = serOf(side).cap || 0, res = search(inp.value, 10, cap);
      ul.hidden = !res.length;
      ul.innerHTML = res.map(c => `<li data-id="${esc(c.id)}" class="${cap && c.rating > cap ? "over" : ""}">${cardLine(c)}${cap && c.rating > cap ? ` <span class="small bad">over cap</span>` : ""}</li>`).join("");
    };
    ul.onclick = e => { const li = e.target.closest("li"); if (!li) return; addToTeam(side, BYID.get(li.dataset.id)); const q = $("q" + side); if (q) q.focus(); };
  }
}
function versions(c, side = "A") {   // every card of the same player name, within the cap first, highest rated first
  const cap = serOf(side).cap || 0;
  return CARDS.filter(x => x._n === c._n).sort((a, b) => ((cap && a.rating > cap) - (cap && b.rating > cap)) || b.rating - a.rating);
}
function addToTeam(side, c) {
  if (!c || state[side].length >= 11) return;
  if (state[side].some(x => x.id === c.id)) { alert(`${c.name} is already in this team.`); return; }
  state[side].push(c); if (side !== "T") $("solveOut").innerHTML = ""; drawMC();
}
async function loadTeam(side, k) {
  const s = serOf(side); let ids = null;
  if (k === "mine") ids = MYTEAMS[s.key].ids;
  else if (k === "built") { try { ids = (await getJSON(`${side === "T" ? "results/" : MCW.base}myclub_${s.key}.json`)).team.players.map(p => p.id); } catch (e) { alert("Couldn't load the built team."); return; } }
  else if (k.startsWith("ref")) ids = s.opponents[+k.slice(3)];
  else if (k.startsWith("saved")) ids = savedTeams()[+k.slice(5)].ids;
  else if (k.startsWith("custom")) ids = CUSTOM[+k.slice(6)].team.players.map(p => p.id);
  state[side] = (ids || []).map(id => BYID.get(id)).filter(Boolean).slice(0, 11);
  if (side !== "T") $("solveOut").innerHTML = ""; drawMC();
}
// Turn "Radelet, Pupe, Costa 67, Sarr Neom" into cards. Returns { cards, miss }.
function resolveNames(text, cap, taken = []) {
  const out = [], miss = [];
  for (let tok of String(text).split(/[,;\n]+/)) {
    tok = tok.trim(); if (!tok) continue;
    const m = tok.match(/^(.*?)[\s@]+(\d{2})$/), full = norm(m ? m[1] : tok), r = m ? +m[2] : 0;
    // "Sarr Neom" = player name + a hint (club, nation or league)
    let L = [], hint = "";
    const words = full.split(/\s+/);
    for (let k = words.length; k >= 1 && !L.length; k--) {
      const nm = words.slice(0, k).join(" "); L = CARDS.filter(c => c._n === nm); hint = words.slice(k).join(" ");
    }
    if (!L.length) { L = CARDS.filter(c => c._n.includes(full)); hint = ""; }
    if (hint) { const H = L.filter(c => [cName(c.clubId), nName(c.nationId), lName(c.leagueId)].some(t => norm(t).includes(hint))); if (H.length) L = H; }
    if (r) L = L.filter(c => c.rating === r);
    L.sort((a, b) => ((cap && a.rating > cap) - (cap && b.rating > cap)) || b.rating - a.rating);
    const pick = L.find(c => !taken.some(x => x.id === c.id) && !out.some(x => x.id === c.id));
    if (pick) out.push(pick); else miss.push(tok);
  }
  return { cards: out, miss };
}
function pasteNames(side) {
  const { cards: out, miss } = resolveNames($("p" + side).value, serOf(side).cap || 0, state[side]);
  const room = 11 - state[side].length;
  state[side].push(...out.slice(0, room));
  drawMC();
  const msg = $("pm" + side) || $("solveOut");
  if (msg) msg.innerHTML = (miss.length ? `<span class="bad">Not found: ${esc(miss.join(", "))}</span>` : "") + (out.length > room ? ` <span class="bad">Only ${room} fitted.</span>` : "");
}
const LEVEL_TEXT = l => ["Lose by 2+", "Lose by 1", "Draw", "Win by 1", "Win by 2+"][l];
async function solveMC() {
  if (state.A.length !== 11 || state.B.length !== 11) { $("solveOut").innerHTML = `<span class="bad">Both teams need 11 players (you have ${state.A.length} and ${state.B.length}).</span>`; return; }
  $("solveOut").innerHTML = `<span class="muted">Working it out with perfect play from both sides… a few seconds</span>`;
  const s = mcSeries(); const A = effective(state.A, s), B = effective(state.B, s);
  const r = await ask({ type: "solve", A, B });
  $("solveOut").innerHTML = `<table><tr><th>Who leads first</th><th>Result for you</th></tr>
    <tr><td>You</td><td>${pill(LEVEL_NAME(r[0]))} <span class="small muted">${LEVEL_TEXT(r[0])}</span></td></tr>
    <tr><td>Them</td><td>${pill(LEVEL_NAME(r[1]))} <span class="small muted">${LEVEL_TEXT(r[1])}</span></td></tr></table>
    <p class="small muted">Both sides playing perfectly. <a href="#" id="toMatch">Play it move by move in Match helper →</a></p>
    <div class="row" style="margin-top:10px"><button class="ghost" id="pvA">Perfect game: you lead</button><button class="ghost" id="pvB">Perfect game: they lead</button><button class="ghost" id="keyBtn">Key cards</button></div>
    <div id="mcExtra" style="margin-top:8px"></div>`;
  $("toMatch").onclick = e => { e.preventDefault(); document.querySelector('#tabs button[data-t="match"]').click(); };
  const TA = state.A.slice(), TB = state.B.slice();
  $("pvA").onclick = () => showPV(A, B, TA, TB, 0); $("pvB").onclick = () => showPV(A, B, TA, TB, 1);
  $("keyBtn").onclick = () => keyCards(A, B, TA, TB, r);
}
// ---- the perfect game, move by move ----
async function showPV(A, B, TA, TB, first) {
  const box = $("mcExtra"); box.innerHTML = `<p class="muted small">Playing the perfect game… a few seconds</p>`;
  const g = await ask({ type: "pv", A, B, first }), st = ["Attack", "Control", "Defence"], ctr = [2, 1, 0], v = (e, k) => [e.a, e.c, e.d][k];
  let me = 0, them = 0;
  const rows = g.steps.map((x, n) => {
    if (x.r > 0) me++; if (x.r < 0) them++;
    const res = x.r > 0 ? `<span class="ok">✓</span>` : x.r < 0 ? `<span class="bad">✗</span>` : `<span class="muted">=</span>`;
    const txt = x.lead === "A"
      ? `You lead <b>${esc(TA[x.i].name)}</b> ${st[x.s]} ${v(A[x.i], x.s)} · they answer <b>${esc(TB[x.j].name)}</b> ${st[ctr[x.s]]} ${v(B[x.j], ctr[x.s])}`
      : `They lead <b>${esc(TB[x.j].name)}</b> ${st[x.s]} ${v(B[x.j], x.s)} · you answer <b>${esc(TA[x.i].name)}</b> ${st[ctr[x.s]]} ${v(A[x.i], ctr[x.s])}`;
    return `<div class="opt"><span class="small"><b>${n + 1}.</b> ${txt}</span><span class="small" style="white-space:nowrap">${res} ${me}–${them}</span></div>`;
  }).join("");
  const fin = me + Math.max(g.tb, 0), fth = them + Math.max(-g.tb, 0);
  const tbTxt = g.d < -1 || g.d > 1 ? "No tiebreak: the score is 2 or more apart." :
    `Tiebreak: your <b>${esc(TA[g.ai].name)}</b> (${A[g.ai].t}) vs their <b>${esc(TB[g.bi].name)}</b> (${B[g.bi].t}) — ${g.tb > 0 ? "you win it" : g.tb < 0 ? "they win it" : "5 or less apart, no point"}.`;
  box.innerHTML = `<h3>Perfect game · ${first === 0 ? "you lead first" : "they lead first"}</h3>${rows}
    <p class="small" style="margin:8px 0 2px">${tbTxt}</p><p><b class="big" style="font-size:26px">${fin} – ${fth}</b></p>
    <p class="small muted">Both sides play perfectly; where several moves are equally good it shows the one that wins its round, keeping high-tiebreak cards for later.</p>`;
}
// ---- key cards: which single cards decide the result ----
let pool = [];
function poolAsk(k, msg) {
  if (!pool.length) for (let n = 0; n < Math.min(4, navigator.hardwareConcurrency || 2); n++) { const w = new Worker("worker.js?v=20261016b"), P = new Map(); w.onmessage = e => { const p = P.get(e.data.id); if (p) { P.delete(e.data.id); e.data.ok ? p.res(e.data.result) : p.rej(e.data.error); } }; pool.push({ w, P }); }
  const W = pool[k % pool.length]; return new Promise((res, rej) => { const id = ++reqId; W.P.set(id, { res, rej }); W.w.postMessage(Object.assign({ id }, msg)); });
}
async function keyCards(A, B, TA, TB, lv) {
  const box = $("mcExtra"), base = lv.map(l => (l >= 3 ? 3 : l === 2 ? 2 : 0)), D = 1;
  const tweak = (T, i, d) => T.map((e, k) => k === i ? Object.assign({}, e, { a: e.a + d, c: e.c + d, d: e.d + d, t: e.t + 3 * d }) : e);
  const jobs = [...TB.map((_, j) => ({ side: "B", k: j })), ...TA.map((_, i) => ({ side: "A", k: i }))];
  let done = 0; box.innerHTML = `<p class="muted small">Testing all 22 cards… <span id="kcProg">0</span>/22</p>`;
  const res = await Promise.all(jobs.map((J, n) => poolAsk(n, { type: "o2", A: J.side === "A" ? tweak(A, J.k, D) : A, B: J.side === "B" ? tweak(B, J.k, -D) : B })
    .then(o => { done++; const p = $("kcProg"); if (p) p.textContent = done; return Object.assign(J, { o }); })));
  const word = { 3: "win", 2: "draw", 0: "lose" }, order = ["you lead", "they lead"];
  const gain = J => [0, 1].filter(f => J.o[f] > base[f]).map(f => `${order[f]}: ${word[base[f]]} → <b>${word[J.o[f]]}</b>`).join(", ");
  const n2 = J => [0, 1].filter(f => J.o[f] > base[f]).length;
  const theirs = res.filter(J => J.side === "B" && gain(J)).sort((x, y) => n2(y) - n2(x)), mine = res.filter(J => J.side === "A" && gain(J)).sort((x, y) => n2(y) - n2(x));
  const li = (J, T) => `<li><b>${esc(T[J.k].name)}</b> <span class="muted">(${esc(J.side === "A" ? "+" : "−")}${D} on every stat)</span> — ${gain(J)}</li>`;
  box.innerHTML = `<h3>Key cards</h3>
    <p class="small" style="margin:4px 0"><b>Their cards that decide it</b> — if this one card were ${D} weaker in every stat:</p>
    ${theirs.length ? `<ul class="small" style="margin:0;padding-left:18px">${theirs.map(J => li(J, TB)).join("")}</ul>` : `<p class="small muted" style="margin:0">None — no single card of theirs is holding the result.</p>`}
    <p class="small" style="margin:10px 0 4px"><b>Your weak links</b> — if this one card of yours were ${D} stronger in every stat:</p>
    ${mine.length ? `<ul class="small" style="margin:0;padding-left:18px">${mine.map(J => li(J, TA)).join("")}</ul><p class="small muted" style="margin:6px 0 0">Upgrade these first: a better version (chem, boost or a stronger card) changes the result.</p>` : `<p class="small muted" style="margin:0">None — a small upgrade to any one card doesn't change the result.</p>`}
    <p class="small muted" style="margin:8px 0 0">1 point is the smallest possible change: these cards are what the result hangs on.</p>`;
}
let worker = null, reqId = 0; const pending = new Map();
function ask(msg) {
  if (!worker) { worker = new Worker("worker.js?v=20261016b"); worker.onmessage = e => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); e.data.ok ? p.res(e.data.result) : p.rej(e.data.error); } }; }
  return new Promise((res, rej) => { const id = ++reqId; pending.set(id, { res, rej }); worker.postMessage(Object.assign({ id }, msg)); });
}

// ---------- Match helper ----------
const STAT = ["attack", "control", "defence"], COUNTER = [2, 1, 0];
let M = null;
$("iFirst").onclick = () => startMatch(0); $("theyFirst").onclick = () => startMatch(1);
async function startMatch(first) {
  if (state.A.length !== 11 || state.B.length !== 11) { alert("Set up both teams in My Club compare first."); return; }
  const s = mcSeries();
  M = { first, A: effective(state.A, s), B: effective(state.B, s), TB: state.B.slice(), swapped: new Set(), cap: s.cap || 99, ser: s,
    ma: 2047, mb: 2047, d: 0, n: 0, me: 0, them: 0, log: [] };
  $("matchBox").hidden = false; $("matchBox").innerHTML = `<p class="muted">Working out the match… a few seconds</p>`;
  await ask({ type: "start", A: M.A, B: M.B, first });
  matchStep();
}
const myTurn = () => (M.n % 2 === 0) === (M.first === 0);
const vName = v => ["Losing", "Losing by 1", "Drawing", "Winning", "Winning"][v];
async function matchStep() {
  const box = $("matchBox");
  if (M.n === 10) {
    const i = 31 - Math.clz32(M.ma), j = 31 - Math.clz32(M.mb);
    box.innerHTML = `<div class="big">${M.me} – ${M.them}</div><p>Tiebreak: your <b>${esc(state.A[i].name)}</b> (${M.A[i].t}) vs their <b>${esc(M.TB[j].name)}</b> (${M.B[j].t}).</p>${logHtml()}<button class="ghost" onclick="startMatch(M.first)">Restart</button>`;
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
  html += `<p class="small" style="margin-top:12px"><a href="#" onclick="swapPick();return false">Their card isn't the Reddit one? Swap it</a></p>`;
  box.innerHTML = html + logHtml();
}
// ---- a different card in their team: swap it, re-solve from the current state ----
window.swapPick = () => {
  $("matchBox").innerHTML = `<h3>Which of their cards is different?</h3><div class="row">${teamButtons("B", M.mb, j => `swapFind(${j})`)}</div>
    <p class="small muted">Only cards they haven't played yet.</p><button class="ghost" onclick="matchStep()">Back</button>`;
};
function swapEff(j, card) {                 // their new card on full chem with this series' boosts
  const team = M.TB.slice(); team[j] = card;
  const sb = squadBonus(team, M.ser.bonuses), [a, k, d] = boosted(card, M.ser.boosts), b = CHEM_BONUS[3];
  return { a: a + b + sb[0], c: k + b + sb[1], d: d + b + sb[2], t: card.attack + card.control + card.defense + 3 * b, chem: 3 };
}
window.swapFind = j => {
  const old = M.TB[j];
  $("matchBox").innerHTML = `<h3>Replace ${esc(old.name)}</h3>
    <input type="text" id="swQ" placeholder="Name, or a hint: nation, league or club (e.g. Czech, Ligue 1, PSG)" autocomplete="off">
    <label class="chk small"><input type="checkbox" id="swAny"> Any position (otherwise ${esc(old.position)} only, like the card it replaces)</label>
    <div id="swRes" style="margin-top:8px"></div><button class="ghost" onclick="swapPick()" style="margin-top:8px">Back</button>`;
  const used = new Set(M.TB.filter((_, k) => k !== j).map(c => c.name + "|" + c.nationId));
  const draw = () => {
    const q = norm($("swQ").value.trim());
    if (q.length < 2) { $("swRes").innerHTML = `<p class="small muted">Type at least 2 letters. Cards up to ${M.cap} only, strongest first.</p>`; return; }
    const anyPos = $("swAny").checked;
    const L = CARDS.filter(c => c.rating <= M.cap && !used.has(c.name + "|" + c.nationId) && (anyPos || c.P.has(old.position)) &&
        (c._n.includes(q) || norm(nName(c.nationId)).includes(q) || norm(lName(c.leagueId)).includes(q) || norm(cName(c.clubId)).includes(q)))
      .map(c => ({ c, e: swapEff(j, c) })).sort((x, y) => (y.e.a + y.e.c + y.e.d) - (x.e.a + x.e.c + x.e.d)).slice(0, 25);
    $("swRes").innerHTML = L.length ? L.map(({ c, e }, k) => `<button class="chipbtn" style="display:block;width:100%;margin:4px 0" onclick="swapDo(${j},'${esc(c.id)}')">
        <b>${esc(c.name)} ${c.rating}${k === 0 ? ` <span class="tag">Strongest</span>` : ""}</b>
        <span>${esc(c.position)} · ${esc(TYPE(c.color))} · ${esc(nName(c.nationId))} · ${esc(cName(c.clubId))} — in game ${e.a}/${e.c}/${e.d}, TB ${e.t}</span></button>`).join("")
      : `<p class="small muted">No card up to ${M.cap} matches.</p>`;
  };
  $("swQ").oninput = draw; $("swAny").onchange = draw; draw(); $("swQ").focus();
};
window.swapDo = async (j, id) => {
  const card = BYID.get(id); if (!card) return;
  const old = M.TB[j]; M.TB[j] = card; M.B[j] = swapEff(j, card); M.swapped.add(j);
  M.log.push(`Swapped their ${esc(old.name)} for ${esc(card.name)} ${card.rating}`);
  $("matchBox").innerHTML = `<p class="muted">Re-working the match with ${esc(card.name)}…</p>`;
  await ask({ type: "start", A: M.A, B: M.B, first: M.first, ma: M.ma, mb: M.mb, d: M.d });
  matchStep();
};
window.matchStep = matchStep;
function teamButtons(side, mask, fn) {
  const team = side === "A" ? state.A : M.TB;
  return team.map((c, i) => (mask >> i & 1) ? `<button class="ghost" onclick="${fn(i)}">${esc(c.name)}${side === "B" && M.swapped.has(i) ? ` <span class="tag">swapped</span>` : ""}</button>` : "").join("");
}
function logHtml() { return M.log.length ? `<h3>Moves</h3><ol class="small">${M.log.map(l => `<li>${l}</li>`).join("")}</ol>` : ""; }
function apply(i, j, r, text) { M.ma &= ~(1 << i); M.mb &= ~(1 << j); M.d += r; M.n++; if (r > 0) M.me++; if (r < 0) M.them++; M.log.push(text + (r > 0 ? " ✅" : r < 0 ? " ❌" : " ➖")); matchStep(); }
window.ansTheirs = (i, s, j) => apply(i, j, duelR(i, j, s, true), `You led ${esc(state.A[i].name)} (${STAT[s]}) · they answered ${esc(M.TB[j].name)}`);
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
  $("matchBox").innerHTML = `<h3>${esc(M.TB[j].name)} — which stat?</h3><div class="row">${[0, 1, 2].map(s => `<button class="ghost" onclick="theirStat(${j},${s})">${STAT[s]} ${[M.B[j].a, M.B[j].c, M.B[j].d][s]}</button>`).join("")}</div>`;
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
window.ansMine = (j, s, i) => apply(i, j, duelR(i, j, s, false), `They led ${esc(M.TB[j].name)} (${STAT[s]}) · you answered ${esc(state.A[i].name)}`);
function duelR(i, j, s, aLeads) {
  const A = M.A[i], B = M.B[j], v = e => [e.a, e.c, e.d];
  let va, vb;
  if (aLeads) { va = v(A)[s]; vb = v(B)[COUNTER[s]]; } else { vb = v(B)[s]; va = v(A)[COUNTER[s]]; }
  if (va !== vb) return va > vb ? 1 : -1;
  return A.t > B.t ? 1 : A.t < B.t ? -1 : 0;
}

// ---------- Sim compare ----------
const SIM_FORMS = {"3-1-4-2":["GK","CB","CB","CB","CDM","LM","CM","CM","RM","ST","ST"],"3-4-1-2":["GK","CB","CB","CB","LM","CM","CM","RM","CAM","ST","ST"],"3-5-2":["GK","CB","CB","CB","CDM","CDM","LM","CAM","RM","ST","ST"],"5-2-1-2":["GK","LB","CB","CB","CB","RB","CM","CM","CAM","ST","ST"],"5-3-2":["GK","LB","CB","CB","CB","RB","CM","CM","CM","ST","ST"],"5-4-1":["GK","LB","CB","CB","CB","RB","LM","CM","CM","RM","ST"],"4-4-2":["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"],"4-3-3":["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],"4-2-3-1":["GK","LB","CB","CB","RB","CDM","CDM","CAM","CAM","CAM","ST"]};
let SIMW = { base: "results/", sim: [] };    // the week being compared: this week or one from the Vault
function simSeries() { const k = $("simSeries").value; return SIMW.sim.find(s => s.key === k) || { boosts: [] }; }
async function setupSim() {
  let weeks = []; try { weeks = (await getJSON("vault/index.json")).weeks || []; } catch (e) {}
  weeks = weeks.filter(w => w.files.some(f => f.startsWith("sim_")));
  if ($("simWeek")) $("simWeek").innerHTML = `<option value="">${esc(seasonName(WEEK && WEEK.week))} (This Season)</option>` + weeks.map(w => `<option value="${esc(w.week)}">${esc(seasonName(w.week))}</option>`).join("");
  if ($("simWeek")) $("simWeek").onchange = async () => {
    const wk = $("simWeek").value;
    if (!wk) SIMW = { base: "results/", sim: (WEEK && WEEK.sim) || [] };
    else { let w = {}; try { w = await getJSON(`vault/${wk}/week.json`); } catch (e) {} SIMW = { base: `vault/${wk}/`, sim: w.sim || [] }; }
    fillSimSeries(); state.simB = []; loadSimA();
  };
  SIMW = { base: "results/", sim: (WEEK && WEEK.sim) || [] };
  fillSimSeries();
  $("simFormB").innerHTML = Object.keys(SIM_FORMS).map(f => `<option>${f}</option>`).join("");
  $("simSeries").onchange = () => { state.simB = []; loadSimA(); }; $("simFormB").onchange = drawSim;
  hookSearch("searchS", "srS", c => { if (state.simB.length < 11) state.simB.push(c); drawSim(); });
  $("simBtn").onclick = runSim;
  loadSimA();
}
function fillSimSeries() {
  $("simSeries").innerHTML = SIMW.sim.map(s => `<option value="${esc(s.key)}">${esc(s.key)} Series</option>`).join("") || `<option value="">No Sim series</option>`;
}
async function loadSimA() {
  state.simA = null;
  try { const d = await getJSON(`${SIMW.base}sim_${simSeries().key}.json`); state.simA = d.teams[0]; } catch (e) {}
  drawSim();
}
function drawSim() {
  const A = state.simA;
  $("simA").innerHTML = A ? `<p class="small">${esc(A.formation)}</p>` + `<table>${A.players.map(p => `<tr><td>${p.slot}</td><td>${esc(p.name)}</td><td class="n">${p.eff.join("/")}</td></tr>`).join("")}</table>` : `<p class="muted small">No built team for this series yet.</p>`;
  const slots = SIM_FORMS[$("simFormB").value], E = effective(state.simB, simSeries());
  const ref = (simSeries().opponents || [])[0];
  $("simB").innerHTML = (ref && !state.simB.length ? `<button class="ghost" id="simRef" style="font-size:12.5px;margin-bottom:8px">Load the Reddit Team</button>` : "") + `<table>${slots.map((s, i) => { const c = state.simB[i]; return `<tr><td>${s}</td><td>${c ? esc(c.name) : '<span class="muted">—</span>'}</td><td class="n">${c ? `${E[i].a}/${E[i].c}/${E[i].d}` : ""}</td><td>${c ? `<button class="x" data-i="${i}">✕</button>` : ""}</td></tr>`; }).join("")}</table>`;
  document.querySelectorAll("#simB .x").forEach(b => b.onclick = () => { state.simB.splice(+b.dataset.i, 1); drawSim(); });
  if ($("simRef")) $("simRef").onclick = () => {
    const f = simSeries().opponent_formation; if (f && SIM_FORMS[f]) $("simFormB").value = f;
    state.simB = ref.map(id => BYID.get(id)).filter(Boolean); drawSim();
  };
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
// Requirement lines, worded like the game. Each line maps onto the solver's requirement object.
const NUM_KEYS = {   // key -> label
  min_rating: "Squad rating", min_chem: "Team chemistry", min_player_chem: "Chemistry per player", min_types: "Card types",
  min_card_rating: "Every player rated", max_card_rating: "Every player rated",
  min_nations: "Nations", max_nations: "Nations", min_leagues: "Leagues", max_leagues: "Leagues", min_clubs: "Clubs", max_clubs: "Clubs",
  min_same_nation: "Same nation", max_same_nation: "Same nation", min_same_league: "Same league", max_same_league: "Same league",
  min_same_club: "Same club", max_same_club: "Same club" };
const SB = { items: [], exclude: [], last: null, lastReq: null, busy: false };
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
  if (kind === "club" && CLUBS[id]) return CLUBS[id];
  if (kind === "color") return TYPE(id);
  if (kind === "rarity") return id[0].toUpperCase() + id.slice(1);
  return groupSample(kind, id).join(", ") || `${kind} ${id}`;
}
function ruleText(r) {
  const head = `${OPS[r.op]} ${r.n}`;
  if (r.on === "color" || r.on === "rarity") return `${head} <b>${esc(groupLabel(r.on, r.id))}</b>`;
  const known = (r.on === "nation" && NATIONS[r.id]) || (r.on === "league" && LEAGUES[r.id]) || (r.on === "club" && CLUBS[r.id]);
  if (known) return `${head} from <b>${esc(known)}</b>`;
  return `${head} from <b>${esc(r.via || groupSample(r.on, r.id)[0] || r.id)}'s ${r.on}</b> <span class="muted">(${esc(groupSample(r.on, r.id).join(", "))})</span>`;
}
function itemText(it) {
  if (it.t === "rule") return ruleText(it.rule);
  if (it.t === "inc") { const c = BYID.get(it.id); return `Must include <b>${esc(c ? c.name + " " + c.rating : it.id)}</b>`; }
  const mm = it.key.startsWith("max_") ? "Max" : "Min";
  return `${NUM_KEYS[it.key]}: <b>${mm} ${it.v}</b>`;
}
let FORMS_CACHE = null;
const ADD_TYPES = [
  ["min_rating", "Squad rating"], ["min_chem", "Team chemistry"], ["from", "Players from a club / nation / league"],
  ["ctype", "Players of a card type (gold, rare, TOTW…)"], ["count", "Number of nations / leagues / clubs"],
  ["same", "Same nation / league / club count"], ["min_player_chem", "Chemistry per player"], ["min_types", "Number of card types"],
  ["prating", "Every player's rating"], ["inc", "Must include a player"]];
function setupSBC() {
  $("sbcForm").innerHTML = Object.keys(FORMS_CACHE || {}).map(f => `<option>${f}</option>`).join("") + `<option value="any">Any (slower)</option>`;
  $("sbcForm").value = "4-3-3";
  $("aType").innerHTML = `<option value="">Choose…</option>` + ADD_TYPES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  $("aType").onchange = drawAddBody;
  $("sbcAddBtn").onclick = () => { $("sbcAdd").hidden = false; $("sbcAddBtn").hidden = true; $("aType").value = ""; drawAddBody(); };
  $("sbcGo").onclick = () => { SB.exclude = []; runSBC(15); };
  $("sbcClear").onclick = () => { SB.items = []; SB.exclude = []; $("sbcOut").hidden = true; drawSBCForm(); saveSBC(); };
  ["sbcForm", "sbcPr", "sbcSp", "sbcIc"].forEach(id => $(id).addEventListener("change", saveSBC));
  loadSBC(); drawSBCForm();
}
function closeAdd() { $("sbcAdd").hidden = true; $("sbcAddBtn").hidden = false; }
function addItem(it) {
  if (it.t === "num") SB.items = SB.items.filter(x => !(x.t === "num" && x.key === it.key));
  SB.items.push(it); closeAdd(); drawSBCForm(); saveSBC();
}
const numBox = (id, val = "") => `<input type="number" inputmode="numeric" id="${id}" min="0" value="${val}" style="width:80px">`;
const minMax = id => `<select id="${id}"><option value="min">Min</option><option value="max">Max</option></select>`;
function drawAddBody() {
  const t = $("aType").value, box = $("aBody");
  const addBtn = `<button class="btn" id="aOk">Add</button> <button class="ghost" id="aCancel">Cancel</button>`;
  const done = () => { const c = $("aCancel"); if (c) c.onclick = closeAdd; };
  if (!t) { box.innerHTML = `<button class="ghost" id="aCancel">Cancel</button>`; done(); return; }
  if (["min_rating", "min_chem", "min_player_chem", "min_types"].includes(t)) {
    box.innerHTML = `<div class="row">Min ${numBox("aN")} ${addBtn}</div>`; done();
    $("aN").focus();
    $("aOk").onclick = () => { const v = +$("aN").value; if (v > 0) addItem({ t: "num", key: t, v }); };
  } else if (t === "prating") {
    box.innerHTML = `<div class="row">${minMax("aM")} ${numBox("aN")} ${addBtn}</div>`; done();
    $("aOk").onclick = () => { const v = +$("aN").value; if (v > 0) addItem({ t: "num", key: $("aM").value + "_card_rating", v }); };
  } else if (t === "count" || t === "same") {
    box.innerHTML = `<div class="row">${minMax("aM")} ${numBox("aN")} <select id="aK"><option value="nation">Nations</option><option value="league">Leagues</option><option value="club">Clubs</option></select> ${addBtn}</div>`; done();
    $("aOk").onclick = () => {
      const v = +$("aN").value, k = $("aK").value, m = $("aM").value; if (!(v > 0)) return;
      addItem({ t: "num", key: t === "count" ? `${m}_${k}s` : `${m}_same_${k}`, v });
    };
  } else if (t === "ctype") {
    const types = [...new Set(CARDS.filter(c => !c._extra && !NO_SBC.has(c.color)).map(sbcType))].filter(x => !["gold", "silver", "bronze"].includes(x)).sort((a, b) => TYPE(a).localeCompare(TYPE(b)));
    box.innerHTML = `<div class="row"><select id="aOp"><option value=">=">Min</option><option value="<=">Max</option><option value="=">Exactly</option></select> ${numBox("aN", 1)}
      <select id="aC"><option value="rarity:gold">Gold</option><option value="rarity:silver">Silver</option><option value="rarity:bronze">Bronze</option>${types.map(x => `<option value="color:${esc(x)}">${esc(TYPE(x))}</option>`).join("")}</select> ${addBtn}</div>`; done();
    $("aOk").onclick = () => { const [on, id] = $("aC").value.split(":"); addItem({ t: "rule", rule: { on, id, op: $("aOp").value, n: +$("aN").value || 0 } }); };
  } else if (t === "inc") {
    box.innerHTML = `<input type="text" id="aQ" placeholder="Search the player…"><ul class="sr" id="aSr" hidden></ul><div style="margin-top:8px"><button class="ghost" id="aCancel">Cancel</button></div>`; done();
    hookSearch("aQ", "aSr", c => { if (c._extra || NO_SBC.has(c.color)) { alert(`${TYPE(c.color)} cards can't be used in SBCs.`); return; } addItem({ t: "inc", id: c.id }); });
    $("aQ").focus();
  } else if (t === "from") {
    box.innerHTML = `<div class="row"><select id="aOp"><option value=">=">Min</option><option value="<=">Max</option><option value="=">Exactly</option></select> ${numBox("aN", 1)}
      <select id="aK"><option value="club">Club</option><option value="nation">Nation</option><option value="league">League</option></select></div>
      <input type="text" id="aQ" placeholder="Type the club / nation / league name, or a player from it" style="margin-top:8px"><ul class="sr" id="aSr" hidden></ul>
      <div style="margin-top:8px"><button class="ghost" id="aCancel">Cancel</button></div>`; done();
    const inp = $("aQ"), ul = $("aSr");
    const refresh = () => {
      const kind = $("aK").value, q = inp.value.trim().toLowerCase(); if (q.length < 2) { ul.hidden = true; return; }
      const opts = new Map(), names = kind === "nation" ? NATIONS : kind === "league" ? LEAGUES : CLUBS;
      for (const [id, n] of Object.entries(names)) if (n.toLowerCase().includes(q)) opts.set(+id, null);
      for (const c of search(q, 8)) if (!opts.has(c[KEYOF[kind]])) opts.set(c[KEYOF[kind]], c.name);
      const list = [...opts.entries()].slice(0, 10);
      ul.hidden = !list.length;
      ul.innerHTML = list.map(([id, via]) => {
        const known = (kind === "nation" && NATIONS[id]) || (kind === "league" && LEAGUES[id]) || (kind === "club" && CLUBS[id]);
        const label = known ? `<b>${esc(known)}</b>` : `<b>${esc(via)}'s ${kind}</b>`;
        return `<li data-id="${id}" data-via="${esc(via || "")}">${label} <span class="muted small">${esc(groupSample(kind, id).join(", "))}</span></li>`;
      }).join("");
    };
    inp.oninput = refresh; $("aK").onchange = refresh; inp.focus();
    ul.onclick = e => {
      const li = e.target.closest("li"); if (!li) return;
      const rule = { on: $("aK").value, id: +li.dataset.id, op: $("aOp").value, n: +$("aN").value || 0 };
      if (li.dataset.via) rule.via = li.dataset.via;
      addItem({ t: "rule", rule });
    };
  }
}
function drawSBCForm() {
  $("sbcList").innerHTML = SB.items.length ? SB.items.map((it, i) => `<div class="req"><span>${itemText(it)}</span><button class="x" data-del="${i}">✕</button></div>`).join("")
    : `<p class="muted small">No requirements yet. Tap <b>+ Add requirement</b> for each line on the SBC.</p>`;
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { SB.items.splice(+b.dataset.del, 1); drawSBCForm(); saveSBC(); });
}
function readReq() {
  const req = { formation: $("sbcForm").value, priority: $("sbcPr").value, allow_specials: $("sbcSp").checked, allow_icons: $("sbcIc").checked,
    rules: [], include: [], exclude: SB.exclude.slice() };
  for (const it of SB.items) {
    if (it.t === "num") req[it.key] = it.v;
    else if (it.t === "rule") req.rules.push(it.rule);
    else if (it.t === "inc") req.include.push(it.id);
  }
  return req;
}
function saveSBC() { try { localStorage.setItem("sbcV2", JSON.stringify({ items: SB.items, formation: $("sbcForm").value, priority: $("sbcPr").value, sp: $("sbcSp").checked, ic: $("sbcIc").checked })); } catch (e) {} }
function loadSBC() {
  let r = null; try { r = JSON.parse(localStorage.getItem("sbcV2") || "null"); } catch (e) {}
  if (!r) return;
  SB.items = r.items || []; if (r.formation) $("sbcForm").value = r.formation; if (r.priority) $("sbcPr").value = r.priority;
  $("sbcSp").checked = !!r.sp; $("sbcIc").checked = !!r.ic;
}
let sbcWorker = null, sbcReq = 0;
function sbcSolve(req, timeLimit, onProgress, onPartial) {
  if (!sbcWorker) sbcWorker = new Worker("sbcworker.js?v=20261016b");
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
      : r.proven ? `<p class="ok"><b>✓ Cheapest squad</b></p>`
      : `<p><b>Good squad</b> <span class="muted small">— may be a slightly cheaper one.</span> <button class="ghost" id="sbcLonger" style="padding:4px 9px;font-size:12px">Search longer</button></p>`;
    out.innerHTML = `<h2>${esc(r.formation)} · rating ${r.rating} · chem ${r.chem}</h2>${head}
      <table class="sq"><tr><th>Pos</th><th>Player</th><th>Chem</th><th></th></tr>${r.players.map(p =>
        `<tr><td>${esc(p.slot)}</td><td class="wrap"><b>${esc(p.name)}</b> ${p.rating}<br><span class="muted small">${esc(TYPE(p.color))} · ${esc(cName(p.clubId))} · ${esc(nName(p.nationId))} · ${esc(lName(p.leagueId))}</span></td><td class="n">${p.chem}</td><td><button class="nohave" data-nohave="${esc(p.id)}">Don't<br>have</button></td></tr>`).join("")}</table>
      ${skipHtml}
      <details ${allOk ? "" : "open"} style="margin-top:8px"><summary class="small ${allOk ? "ok" : "bad"}">${allOk ? "✓ Meets every requirement" : "✗ A requirement isn't met — please report it"}</summary><ul class="small" style="padding-left:18px;margin:4px 0">${checks.map(c => `<li class="${c.ok ? "ok" : "bad"}">${c.ok ? "✓" : "✗"} ${c.label}</li>`).join("") || "<li class='muted'>No requirements set.</li>"}</ul></details>`;
  }
  if (working) { out.querySelectorAll("[data-nohave],[data-undo]").forEach(b => b.disabled = true); return; }
  out.querySelectorAll("[data-nohave]").forEach(b => b.onclick = () => { SB.exclude.push(b.dataset.nohave); runSBC(15, Object.assign({}, SB.lastReq, { exclude: SB.exclude.slice() })); });
  out.querySelectorAll("[data-undo]").forEach(b => b.onclick = () => { SB.exclude.splice(+b.dataset.undo, 1); runSBC(15, Object.assign({}, SB.lastReq, { exclude: SB.exclude.slice() })); });
  const longer = $("sbcLonger");
  if (longer) longer.onclick = () => runSBC(90, Object.assign({}, SB.lastReq, r && !r.none ? { formation: r.formation } : {}, { exclude: SB.exclude.slice() }));
}

// ---------- Cards (everything in the data, to spot what's missing) ----------
const CF = { shown: 100 };
const typeKey = c => { const t = String(c.color).replace("rare_", ""); return ["gold", "silver", "bronze"].includes(t) ? t : t; };
const typeLabel = t => ({ gold: "Gold", silver: "Silver", bronze: "Bronze" }[t] || TYPE(t));
const SHOW_EXTRA = new Set(["evo", "elite_evo", "ltm"]);
// card-type colours (tiles and the strip beside each card): [light, dark, text]
const TCOL = {   // [light, dark, text], taken from the in-game collection screen
  gold: ["#f0e296", "#c9a24a", "#1d1405"], silver: ["#e2e4ea", "#9a9eaa", "#10151b"], bronze: ["#edc89a", "#c08452", "#1a0d05"],
  totw_gold: ["#4a4030", "#141210", "#ecc96a"], icon: ["#f4f2ee", "#b9a57e", "#1b140a"], debut_icon: ["#ece3d8", "#9a7c5e", "#1b140a"],
  hero: ["#8f7ad8", "#2a1d55", "#ffffff"], hall_of_fut: ["#9a9aa6", "#232126", "#ffffff"], future_stars: ["#9a6fd0", "#1f0e4c", "#ffffff"],
  destined_for_glory: ["#c9a868", "#173a3e", "#ffffff"], otw: ["#4fc4d4", "#1e3c6a", "#ffffff"], squad_foundations: ["#5cc8b8", "#1d4d48", "#ffffff"],
  sbc_premium: ["#a58ad0", "#3a2066", "#ffffff"], partners: ["#a89a88", "#4a3e33", "#ffffff"],
  epl_potm: ["#4fc3f7", "#2a6fd8", "#ffffff"], laliga_potm: ["#e04a3c", "#0a0618", "#ffffff"], seriea_potm: ["#3d63ff", "#1a10b8", "#ffffff"],
  bundesliga_potm: ["#c42a22", "#5e0f0f", "#ffffff"], liga_f_potm: ["#2f63c8", "#0a1f5c", "#ffffff"],
  ligue1_potm: ["#4a5ff0", "#1b1a6e", "#ffffff"], ligue_1_potm: ["#4a5ff0", "#1b1a6e", "#ffffff"],
  evo: ["#2f6a5e", "#071219", "#c9f3e6"], elite_evo: ["#4f7a64", "#0b1620", "#ecd99a"], ltm: ["#2a4dff", "#c4162a", "#ffffff"] };
// LTMs each have their own card design: the strip beside them uses that card's colours
const LTMCOL = { "Xavi Espart": ["#3a6fe0", "#8a1640"], "Karetsas": ["#f5e04a", "#2a2614"] };
const cardStrip = c => { const L = c.color === "ltm" && LTMCOL[c.name]; return L ? `background:linear-gradient(135deg,${L[0]},${L[1]})` : tgrad(typeKey(c)); };
const tcol = t => TCOL[t] || (h => [`hsl(${h} 70% 72%)`, `hsl(${h} 55% 38%)`, "#0d0a0b"])([...String(t)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7));
const tgrad = t => { const [a, b, c] = tcol(t); return `background:linear-gradient(135deg,${a},${b});color:${c}`; };      // hand-added cards listed in the Cards tab
const inCards = c => !c._extra || SHOW_EXTRA.has(c.color);
const cardCount = (t, cs) => t === "ltm" ? new Set(cs.map(c => c.name)).size : cs.length;   // an LTM counts once, whatever its level
function siteTotal() {          // every card on the site, counted as the Cards tab does (hand-added Evo / Elite Evo / LTM included, each LTM once)
  const byT = new Map(); CARDS.filter(inCards).forEach(c => { const k = typeKey(c); if (!byT.has(k)) byT.set(k, []); byT.get(k).push(c); });
  return [...byT].reduce((a, [t, cs]) => a + cardCount(t, cs), 0);
}
function setupCards() {
  const real = CARDS.filter(inCards);
  const byT = new Map(); real.forEach(c => { const k = typeKey(c); if (!byT.has(k)) byT.set(k, []); byT.get(k).push(c); });
  const cnt = new Map([...byT].map(([t, cs]) => [t, cardCount(t, cs)]));
  const special = [...cnt].filter(([t]) => !["gold", "silver", "bronze"].includes(t)).reduce((a, [, n]) => a + n, 0);
  const order = ["gold", "silver", "bronze", ...[...cnt.keys()].filter(t => !["gold", "silver", "bronze"].includes(t)).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))];
  const total = [...cnt.values()].reduce((a, n) => a + n, 0);
  $("cardsInfo").innerHTML = `${total.toLocaleString()} cards · data updated ${esc(DATA_UPDATED)}. Compare these totals with your collection screen in the game. Evo, Elite Evo and LTM cards are added by hand and can't be used in SBCs. Each LTM counts once; its levels are listed inside.`;
  $("cardsTypes").innerHTML = `<button class="ctile wide" data-ct="special" style="background:var(--grad);color:#1a0b05"><b>All special</b><span>${special.toLocaleString()}</span></button>` +
    order.map(t => `<button class="ctile" data-ct="${esc(t)}" style="${tgrad(t)}"><b>${esc(typeLabel(t))}</b><span>${cnt.get(t).toLocaleString()}</span></button>`).join("");
  $("cType").innerHTML = `<option value="">All</option><option value="special">All special</option>` + order.map(t => `<option value="${esc(t)}">${esc(typeLabel(t))} (${cnt.get(t)})</option>`).join("");
  const poss = [...new Set(real.map(c => c.position))].sort();
  $("cPos").innerHTML = `<option value="">All</option>` + poss.map(p => `<option>${esc(p)}</option>`).join("");
  document.querySelectorAll("[data-ct]").forEach(b => b.onclick = () => {
    $("cType").value = b.dataset.ct === "special" ? "special" : ""; drawCards();
    const d = b.dataset.ct === "special" ? null : document.querySelector(`.tgrp[data-t="${b.dataset.ct}"]`);
    if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
  });
  ["cQ", "cType", "cPos", "cMin", "cMax"].forEach(id => $(id).addEventListener("input", () => { CF.shown = 100; drawCards(); }));
  $("cMore").onclick = () => { CF.shown += 200; drawCards(); };
  drawCards();
}
// "Yours" only on regular Evos you made yourself (not Elite Evos or their lower levels); LTMs are open to everyone
const eliteNames = () => new Set(CARDS.filter(c => c.color === "elite_evo").map(c => c.name));
const extraTag = c => !c._extra || c.color === "ltm" ? "" : c.owned === false ? ` <span class="small muted">Opponents only</span>`
  : c.color === "evo" && !eliteNames().has(c.name) ? ` <span class="small ok">Yours</span>` : "";
const cardRow = c => `<div class="prow crow"><span class="rt"><i style="${cardStrip(c)}"></i><b>${c.rating}</b></span><span class="nm"><b>${esc(c.name)}</b><span class="r">${esc(c.position)}${c.altPositions ? ", " + esc(String(c.altPositions).split(",").join(", ")) : ""}</span>${extraTag(c)}<small>${esc(cName(c.clubId))} · ${esc(nName(c.nationId))} · ${esc(lName(c.leagueId))}</small></span><span class="st"><span class="a">${c.attack}</span><span class="c">${c.control}</span><span class="d">${c.defense}</span></span></div>`;
function byRatingHtml(L, nested) {        // cards grouped under rating headings (big groups fold away)
  const G = new Map(); L.forEach(c => { if (!G.has(c.rating)) G.set(c.rating, []); G.get(c.rating).push(c); });
  return [...G.entries()].sort((a, b) => b[0] - a[0]).map(([r, cs]) => nested
    ? `<details class="rgrp" data-r="${r}"><summary class="small"><b>Rated ${r}</b> · ${cs.length} card${cs.length > 1 ? "s" : ""}</summary><div class="rbody"></div></details>`
    : `<div class="small" style="margin:10px 0 2px"><b>Rated ${r}</b> <span class="muted">· ${cs.length} card${cs.length > 1 ? "s" : ""}</span></div>${cs.map(cardRow).join("")}`).join("");
}
function drawCards() {
  const q = norm($("cQ").value.trim()), t = $("cType").value, pos = $("cPos").value, lo = +$("cMin").value || 0, hi = +$("cMax").value || 99;
  const filtering = q || pos || $("cMin").value || $("cMax").value;
  const L = CARDS.filter(c => inCards(c) && (!q || c._n.includes(q)) && (!t || (t === "special" ? !["gold", "silver", "bronze"].includes(typeKey(c)) : typeKey(c) === t))
    && (!pos || c.position === pos || String(c.altPositions || "").split(",").includes(pos)) && c.rating >= lo && c.rating <= hi)
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  const groups = new Map(); L.forEach(c => { const k = typeKey(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
  const order = ["gold", "silver", "bronze"].filter(k => groups.has(k)).concat([...groups.keys()].filter(k => !["gold", "silver", "bronze"].includes(k)).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b))));
  const shown = [...groups].reduce((a, [k, cs]) => a + cardCount(k, cs), 0);
  $("cCount").textContent = `${shown.toLocaleString()} card${shown === 1 ? "" : "s"} in ${groups.size} type${groups.size === 1 ? "" : "s"}${filtering ? " (filtered)" : ""}`;
  const openAll = filtering && L.length <= 300;
  $("cList").innerHTML = order.map(k => {
    const cs = groups.get(k), rs = cs.map(c => c.rating);
    const n = cardCount(k, cs), extra = cs.some(c => c._extra) || (typeof NO_SBC !== "undefined" && NO_SBC.has(k));
    return `<details class="tgrp" data-t="${esc(k)}"${openAll || groups.size === 1 ? " open" : ""}><summary><b>${esc(typeLabel(k))}</b> <span class="muted small">· ${n} card${n > 1 ? "s" : ""}${n !== cs.length ? ` (${cs.length} levels)` : ""}${extra ? " · Not for SBC" : ""} · Rated ${Math.min(...rs) === Math.max(...rs) ? Math.min(...rs) : Math.min(...rs) + "–" + Math.max(...rs)}</span></summary><div class="tbody"></div></details>`;
  }).join("") || `<p class="muted small">No cards match.</p>`;
  const fill = d => {
    const body = d.querySelector(".tbody"); if (body.dataset.done) return; body.dataset.done = 1;
    const cs = groups.get(d.dataset.t), nested = cs.length > 150;
    body.innerHTML = byRatingHtml(cs, nested);
    if (nested) body.querySelectorAll(".rgrp").forEach(rd => rd.addEventListener("toggle", () => {
      const rb = rd.querySelector(".rbody"); if (rb.dataset.done) return; rb.dataset.done = 1;
      rb.innerHTML = cs.filter(c => c.rating === +rd.dataset.r).map(cardRow).join("");
    }));
  };
  $("cList").querySelectorAll(".tgrp").forEach(d => { d.addEventListener("toggle", () => d.open && fill(d)); if (d.open) fill(d); });
  $("cMore").hidden = true;
}

// ---------- Weekly setup ----------
// ---------- Weekly setup form ----------
let WS = null, WSUI = { open: "" };
const BKIND = { nation: "Nation", league: "League", club: "Club", color: "Card type" };
const BNKIND = { nations: "different nations", leagues: "different leagues", clubs: "different clubs", types: "different card types" };
const groupName = (on, id) => on === "nation" ? nName(id) : on === "league" ? lName(id) : on === "club" ? cName(id) : TYPE(id);
const statTxt = o => `A +${o.att || 0} · C +${o.ctl || 0} · D +${o.def || 0}`;
function wsDraftSave() { try { localStorage.setItem("weekDraft", JSON.stringify(WS)); } catch (e) {} }
function wsDraftClear() { try { localStorage.removeItem("weekDraft"); } catch (e) {} }
async function wsLoad(fromLive = false) {
  let d = null;
  if (!fromLive) { try { d = JSON.parse(localStorage.getItem("weekDraft") || "null"); } catch (e) {} }
  if (!d && ghToken()) { try { const f = await ghGetFile("config/week.json"); if (f) d = JSON.parse(f.text); } catch (e) {} }
  if (!d) d = JSON.parse(JSON.stringify(WEEK || { week: "", myclub: [], sim: [] }));
  d.myclub = d.myclub || []; d.sim = d.sim || [];
  WS = d;
}
const WSOPEN = new Set();                 // Season Setup series left open between redraws
function seriesCardHtml(type, i) {
  const s = WS[type][i], id = `${type}-${i}`, isMC = type === "myclub";
  const nb = (s.boosts || []).length, nbn = (s.bonuses || []).length, nr = (s.opponents || []).length;
  const boostNames = (s.boosts || []).map(b => groupName(b.on, b.id)).join(" · ") || "No boosts yet";
  const sub = [`${nb} boost${nb === 1 ? "" : "s"}`, nbn ? `${nbn} bonus${nbn === 1 ? "" : "es"}` : "", isMC ? `${nr} Reddit team${nr === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const isOpen = WSOPEN.has(id) || WSUI.open.startsWith(id + ":");
  const warn = !nb ? `<span class="pill LOSS">Needs boosts</span>` : isMC && !nr ? `<span class="pill DRAW">No Reddit</span>` : `<span class="pill WIN">Ready</span>`;
  let h = `<details class="card sercard" data-wser="${id}"${isOpen ? " open" : ""}><summary class="strip"><span class="k">${esc(s.key || "?")}</span><span class="mid"><b>${esc(boostNames)}</b><small>${esc(sub)}</small></span><span class="res">${warn}</span></summary><div class="body"><div class="row" style="justify-content:space-between">
    <label class="small muted">Series <input type="text" inputmode="numeric" data-f="key" data-s="${id}" value="${esc(s.key || "")}" style="width:80px"></label>
    <button class="x" data-delseries="${id}" title="Remove series">🗑</button></div>`;
  h += `<div class="small" style="margin-top:8px"><b>Boosts</b></div>` + ((s.boosts || []).map((b, j) =>
    `<div class="req"><span>${esc(BKIND[b.on])}: <b>${esc(groupName(b.on, b.id))}</b> <span class="muted">${statTxt(b)}</span></span><button class="x" data-delb="${id}:${j}">✕</button></div>`).join("") || `<p class="small muted" style="margin:2px 0">None</p>`);
  h += `<div class="small" style="margin-top:8px"><b>Squad bonuses</b></div>` + ((s.bonuses || []).map((b, j) =>
    `<div class="req"><span>${b.min}+ ${esc(BNKIND[b.kind] || b.kind)} <span class="muted">${statTxt(b)}</span></span><button class="x" data-delbn="${id}:${j}">✕</button></div>`).join("") || `<p class="small muted" style="margin:2px 0">None</p>`);
  if (isMC) h += `<div class="small" style="margin-top:8px"><b>Reddit reference teams</b></div>` + ((s.opponents || []).map((t, j) =>
    `<div class="req"><span>${esc(short(t))}</span><button class="x" data-delref="${id}:${j}">✕</button></div>`).join("") || `<p class="small muted" style="margin:2px 0">None (optional)</p>`);
  const open = WSUI.open.startsWith(id + ":") ? WSUI.open.split(":")[1] : "";
  h += `<div class="row" style="margin-top:8px"><button class="ghost" data-open="${id}:boost" style="font-size:12.5px">+ Boost</button><button class="ghost" data-open="${id}:bonus" style="font-size:12.5px">+ Squad bonus</button>${isMC ? `<button class="ghost" data-open="${id}:ref" style="font-size:12.5px">+ Reddit team</button>` : ""}</div>`;
  const nums = `<div class="row" style="margin-top:8px"><label class="small">A <input type="number" inputmode="numeric" id="wA" value="0" style="width:62px"></label><label class="small">C <input type="number" inputmode="numeric" id="wC" value="0" style="width:62px"></label><label class="small">D <input type="number" inputmode="numeric" id="wD" value="0" style="width:62px"></label></div>`;
  if (open === "boost") h += `<div class="rulebox"><div class="row"><select id="wKind"><option value="nation">Nation</option><option value="league">League</option><option value="club">Club</option><option value="color">Card type</option></select></div>
    <div id="wPick" style="margin-top:8px"></div>${nums}<div class="row" style="margin-top:8px"><button class="btn" id="wAdd">Add boost</button><button class="ghost" data-close="1">Cancel</button></div><p class="small" id="wMsg"></p></div>`;
  if (open === "bonus") h += `<div class="rulebox"><div class="row"><input type="number" inputmode="numeric" id="wMin" placeholder="e.g. 5" style="width:80px"><span class="small">+</span><select id="wBK"><option value="nations">Different nations</option><option value="leagues">Different leagues</option><option value="clubs">Different clubs</option><option value="types">Different card types</option></select></div>
    ${nums}<div class="row" style="margin-top:8px"><button class="btn" id="wAdd">Add bonus</button><button class="ghost" data-close="1">Cancel</button></div><p class="small" id="wMsg"></p></div>`;
  if (open === "ref") h += `<div class="rulebox"><p class="small muted" style="margin:0 0 6px">Paste the 11 names (commas or new lines). Add a rating or club if a name has several versions, e.g. <code>Costa 67</code>, <code>Sarr Neom</code>.</p>
    <textarea id="wRef"></textarea><div class="row" style="margin-top:8px"><button class="btn" id="wAdd">Add team</button><button class="ghost" data-close="1">Cancel</button></div><p class="small" id="wMsg"></p></div>`;
  return h + `</div></details>`;
}
function renderWeekForm() {
  const box = $("weekForm"); if (!box || !WS) return;
  box.innerHTML = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(seasonName(WS.week))} Series</h2>
      <label class="small muted">Season start <input type="date" id="wWeek" value="${esc(WS.week || "")}"></label></div>
    <p class="small muted" style="margin:6px 0 0">Changes are kept on this phone until you tap <b>Save &amp; rebuild</b>.</p>
    <h3>Fatal My Club</h3>${WS.myclub.map((_, i) => seriesCardHtml("myclub", i)).join("")}<button class="ghost" data-addseries="myclub">+ Add My Club series</button>
    <h3>Fatal Sim</h3>${WS.sim.map((_, i) => seriesCardHtml("sim", i)).join("")}<button class="ghost" data-addseries="sim">+ Add Sim series</button>
    <div class="row" style="margin-top:16px"><button class="btn" id="wSave">Save &amp; rebuild</button><button class="ghost" id="wNew">New Season</button><button class="ghost" id="wDiscard">Discard changes</button></div>
    <p class="small" id="wSaveMsg"></p>`;
  const S = id => { const [t, i] = id.split("-"); return WS[t][+i]; };
  const redraw = () => { wsDraftSave(); renderWeekForm(); };
  box.querySelectorAll("details[data-wser]").forEach(x => x.ontoggle = () => { x.open ? WSOPEN.add(x.dataset.wser) : WSOPEN.delete(x.dataset.wser); });
  $("wWeek").onchange = e => { WS.week = e.target.value; wsDraftSave(); renderWeekForm(); };
  box.querySelectorAll("[data-f]").forEach(inp => inp.onchange = () => {
    const s = S(inp.dataset.s);
    s.key = inp.value.trim(); s.cap = /^\d+$/.test(s.key) ? +s.key : 99;   // the series number is the rating cap
    redraw();
  });
  box.querySelectorAll("[data-delseries]").forEach(b => b.onclick = () => { const [t, i] = b.dataset.delseries.split("-"); if (confirm(`Remove the ${WS[t][+i].key || ""} series?`)) { WS[t].splice(+i, 1); WSUI.open = ""; WSOPEN.clear(); redraw(); } });
  box.querySelectorAll("[data-delb]").forEach(b => b.onclick = () => { const [id, j] = b.dataset.delb.split(":"); S(id).boosts.splice(+j, 1); redraw(); });
  box.querySelectorAll("[data-delbn]").forEach(b => b.onclick = () => { const [id, j] = b.dataset.delbn.split(":"); S(id).bonuses.splice(+j, 1); redraw(); });
  box.querySelectorAll("[data-delref]").forEach(b => b.onclick = () => { const [id, j] = b.dataset.delref.split(":"); S(id).opponents.splice(+j, 1); redraw(); });
  box.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { WSUI.open = b.dataset.open; renderWeekForm(); });
  box.querySelectorAll("[data-close]").forEach(b => b.onclick = () => { WSUI.open = ""; renderWeekForm(); });
  box.querySelectorAll("[data-addseries]").forEach(b => b.onclick = () => {
    const k = prompt("Series (the rating cap, e.g. 81):"); if (!k) return;
    const t = b.dataset.addseries, s = { key: k.trim(), cap: /^\d+$/.test(k.trim()) ? +k.trim() : 99, boosts: [] };
    if (t === "myclub") { s.opponents = []; s.minutes = 30; }
    WS[t].push(s); WSOPEN.add(`${t}-${WS[t].length - 1}`); redraw();
  });
  // the open "add" panel
  if (WSUI.open) {
    const [id, what] = WSUI.open.split(":"), s = S(id), num = k => +($(k) ? $(k).value : 0) || 0;
    if (what === "boost") {
      let picked = null;
      const drawPick = () => {
        const kind = $("wKind").value;
        if (kind === "color") {
          const types = [...new Set(CARDS.filter(c => !c._extra).map(c => String(c.color).replace("rare_", "")))].sort((a, b) => TYPE(a).localeCompare(TYPE(b)));
          $("wPick").innerHTML = `<select id="wType">${types.map(t => `<option value="${esc(t)}">${esc(TYPE(t))}</option>`).join("")}</select>`;
          picked = () => $("wType").value; return;
        }
        $("wPick").innerHTML = `<input type="text" id="wQ" placeholder="Type the ${kind} name or a player from it"><ul class="sr" id="wSr" hidden></ul><p class="small" id="wSel"></p>`;
        picked = () => null; let sel = null;
        const names = kind === "nation" ? NATIONS : kind === "league" ? LEAGUES : CLUBS, key = KEYOF[kind];
        $("wQ").oninput = () => {
          const q = norm($("wQ").value.trim()); if (q.length < 2) { $("wSr").hidden = true; return; }
          const opts = new Map();
          for (const [gid, n] of Object.entries(names)) if (norm(n).includes(q)) opts.set(+gid, null);
          for (const c of search(q, 8)) if (!opts.has(c[key])) opts.set(c[key], c.name);
          const list = [...opts.keys()].slice(0, 10);
          $("wSr").hidden = !list.length;
          $("wSr").innerHTML = list.map(gid => `<li data-g="${gid}"><b>${esc(groupName(kind, gid))}</b> <span class="muted small">${esc(groupSample(kind, gid).join(", "))}</span></li>`).join("");
        };
        $("wSr").onclick = e => { const li = e.target.closest("li"); if (!li) return; sel = +li.dataset.g; $("wSr").hidden = true; $("wQ").value = groupName(kind, sel); $("wSel").innerHTML = `Selected: <b>${esc(groupName(kind, sel))}</b>`; };
        picked = () => sel;
      };
      $("wKind").onchange = drawPick; drawPick();
      $("wAdd").onclick = () => {
        const gid = picked(); if (gid == null || gid === "") { $("wMsg").innerHTML = `<span class="bad">Pick the ${$("wKind").value} first.</span>`; return; }
        (s.boosts = s.boosts || []).push({ on: $("wKind").value, id: gid, att: num("wA"), ctl: num("wC"), def: num("wD") });
        WSUI.open = ""; redraw();
      };
    } else if (what === "bonus") {
      $("wAdd").onclick = () => {
        const mn = num("wMin"); if (!mn) { $("wMsg").innerHTML = `<span class="bad">Enter how many are needed.</span>`; return; }
        (s.bonuses = s.bonuses || []).push({ kind: $("wBK").value, min: mn, att: num("wA"), ctl: num("wC"), def: num("wD") });
        WSUI.open = ""; redraw();
      };
    } else if (what === "ref") {
      $("wAdd").onclick = () => {
        const { cards, miss } = resolveNames($("wRef").value, s.cap || 0);
        if (miss.length || cards.length !== 11) { $("wMsg").innerHTML = `<span class="bad">${miss.length ? "Not found: " + esc(miss.join(", ")) + ". " : ""}Found ${cards.length}/11.</span>`; return; }
        (s.opponents = s.opponents || []).push(cards.map(c => c.id));
        WSUI.open = ""; redraw();
      };
    }
  }
  $("wNew").onclick = () => {
    if (!confirm("Start a new season? This clears every series (each season has different ones), so you add this season's series, boosts and Reddit teams from scratch. Nothing is saved until you tap Save & rebuild.")) return;
    const t = new Date(); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));     // this week's Monday
    WS.week = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    WS.myclub = []; WS.sim = []; WSUI.open = ""; WSOPEN.clear();
    redraw();
  };
  $("wDiscard").onclick = async () => { if (!confirm("Throw away your changes and reload the live setup?")) return; wsDraftClear(); await wsLoad(true); WSUI.open = ""; renderWeekForm(); };
  $("wSave").onclick = async () => {
    const msg = $("wSaveMsg");
    if (!ghToken()) { msg.innerHTML = `<span class="bad">Connect GitHub first (box below).</span>`; $("ghBox").scrollIntoView({ behavior: "smooth" }); return; }
    const bad = [...WS.myclub, ...WS.sim].find(s => !s.key || !s.cap);
    if (bad) { msg.innerHTML = `<span class="bad">Every series needs its number (e.g. 79).</span>`; return; }
    if (!confirm(`Save this season's setup and rebuild every team?\n\nSim teams take about 10 minutes, My Club teams about 2 hours.`)) return;
    msg.textContent = "Saving…";
    try {
      const f = await ghGetFile("config/week.json");
      await ghPutFile("config/week.json", JSON.stringify(WS, null, 1) + "\n", `Weekly setup ${WS.week || ""}`, f && f.sha);
      wsDraftClear();
      msg.innerHTML = `<span class="ok">Saved ✓ Rebuilding now — Sim teams in about 10 minutes, My Club teams in about 2 hours, on the Best teams tab.</span>`;
    } catch (e) { msg.innerHTML = `<span class="bad">Couldn't save: ${esc(e.message)}</span>`; }
  };
}
async function renderSetup() {
  $("setupBody").innerHTML = `
  <div class="card" id="weekForm"><p class="muted">Loading this season's setup…</p></div>
  <div class="card" id="ghBox"><h2>Connect GitHub <span class="small muted" id="ghState"></span></h2>
   <p class="small">Lets the site save the season setup and start "Beat a team" builds. It's a key that can only change files in your madfut-tools repo, saved on this phone only (never on the site).</p>
   <ol class="small" style="padding-left:18px">
    <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">github.com/settings/personal-access-tokens/new</a> (if the GitHub app opens, long-press the link and choose <b>Open in Safari</b>).</li>
    <li><b>Token name</b>: madfut site. <b>Expiration</b>: pick the longest option.</li>
    <li><b>Repository access</b>: Only select repositories → <b>madfut-tools</b>.</li>
    <li><b>Permissions</b> → Repository permissions → <b>Contents</b>: Read and write.</li>
    <li>Tap <b>Generate token</b>, copy it and paste it here:</li>
   </ol>
   <div class="row"><input type="password" id="ghIn" placeholder="github_pat_…" style="flex:1"><button class="btn" id="ghSave">Save</button></div>
   <p class="small" id="ghMsg"></p></div>
  <details class="card"><summary>More</summary>
   <p class="small">Card data updates itself every day from madfutdata. <a href="https://github.com/${REPO}/actions" target="_blank">See running jobs on GitHub</a>.</p>
   <p class="small">Evos and maxed LTMs go in <code>config/extras.json</code>.</p>
   <h3>Card lookup</h3><input type="text" id="idQ" placeholder="Search a card…"><ul class="sr" id="idSr" hidden></ul><p id="idOut" class="small"></p></details>`;
  const ghState = () => { $("ghState").innerHTML = ghToken() ? `<span class="ok">connected ✓</span> <a href="#" id="ghOff">disconnect</a>` : "not connected"; const o = $("ghOff"); if (o) o.onclick = e => { e.preventDefault(); try { localStorage.removeItem("ghToken"); } catch (x) {} ghState(); }; };
  ghState();
  $("ghSave").onclick = async () => {
    const t = $("ghIn").value.trim(); if (!t) return;
    $("ghMsg").textContent = "Checking…";
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || r.status);
      if (!(j.permissions && j.permissions.push)) throw new Error("this key can't change the repo — set Contents to Read and write");
      try { localStorage.setItem("ghToken", t); } catch (x) { throw new Error("couldn't save on this phone"); }
      $("ghIn").value = ""; $("ghMsg").innerHTML = `<span class="ok">Connected ✓</span>`; ghState();
      await wsLoad(); renderWeekForm();
    } catch (e) { $("ghMsg").innerHTML = `<span class="bad">Didn't work: ${esc(e.message)}</span>`; }
  };
  hookSearch("idQ", "idSr", c => { $("idOut").innerHTML = `${cardLine(c)}<br>id <code>${esc(c.id)}</code> · ${esc(cName(c.clubId))}`; });
  await wsLoad(); renderWeekForm();
}
init();
