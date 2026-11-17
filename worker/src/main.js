// Puzzles leaderboard server (Cloudflare Worker + D1). Built by adding this after docs/sbc-solver.js and
// docs/puzzle-core.js, so every answer is scored by the same code as the site: nobody can send a made-up score.
//   GET  /lb?set=<set id or "all">   top 50: name, points, puzzles solved
//   GET  /me?pid=…                   your name, your best per puzzle, and your rank in each set
//   POST /submit {pid, name, puzzle, team: [card ids in formation order]}   checks it, keeps your best
//   POST /name {pid, name}           change your display name
const SITE_DEFAULT = "https://bmahrrr.github.io/madfut-tools/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });

let DATA = null, DATA_AT = 0;
async function data(env) {
  const SITE = (env && env.SITE) || SITE_DEFAULT;
  if (DATA && Date.now() - DATA_AT < 10 * 60e3) return DATA;
  const get = f => fetch(SITE + f + "?v=" + Math.floor(Date.now() / 600e3), { cf: { cacheTtl: 300 } }).then(r => { if (!r.ok) throw new Error(f + " " + r.status); return r.json(); });
  const [cj, pj, fj] = await Promise.all([get("cards.json"), get("puzzles.json"), get("formations.json")]);
  const BYID = new Map();
  for (const r of cj.cards) { const c = {}; cj.fields.forEach((f, i) => c[f] = r[i]); BYID.set(c.id, c); }
  const PZ = new Map();
  for (const s of pj.sets) for (const p of s.puzzles) PZ.set(p.id, { pz: p, set: s.id });
  DATA = { BYID, PZ, FORMS: fj }; DATA_AT = Date.now();
  return DATA;
}
const cleanName = n => String(n || "").replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
const okPid = p => typeof p === "string" && /^[a-z0-9-]{8,64}$/.test(p);

async function board(env, set) {
  const q = set === "all"
    ? env.DB.prepare("SELECT p.name, SUM(s.pts) AS pts, COUNT(*) AS solved FROM scores s JOIN players p ON p.pid = s.pid GROUP BY s.pid ORDER BY pts DESC LIMIT 50")
    : env.DB.prepare("SELECT p.name, SUM(s.pts) AS pts, COUNT(*) AS solved FROM scores s JOIN players p ON p.pid = s.pid WHERE s.set_id = ?1 GROUP BY s.pid ORDER BY pts DESC LIMIT 50").bind(set);
  const { results } = await q.all();
  return results;
}
async function rankIn(env, pid, set) {
  const mine = await (set === "all" ? env.DB.prepare("SELECT SUM(pts) AS t FROM scores WHERE pid = ?1").bind(pid)
    : env.DB.prepare("SELECT SUM(pts) AS t FROM scores WHERE pid = ?1 AND set_id = ?2").bind(pid, set)).first();
  if (!mine || mine.t == null) return null;
  const above = await (set === "all" ? env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS t FROM scores GROUP BY pid) WHERE t > ?1").bind(mine.t)
    : env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS t FROM scores WHERE set_id = ?2 GROUP BY pid) WHERE t > ?1").bind(mine.t, set)).first();
  return { rank: above.n + 1, pts: mine.t };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    try {
      if (req.method === "GET" && url.pathname === "/lb") {
        const set = url.searchParams.get("set") || "all";
        return json({ set, rows: await board(env, set) });
      }
      if (req.method === "GET" && url.pathname === "/me") {
        const pid = url.searchParams.get("pid"); if (!okPid(pid)) return json({ error: "bad player" }, 400);
        const p = await env.DB.prepare("SELECT name FROM players WHERE pid = ?1").bind(pid).first();
        const { results } = await env.DB.prepare("SELECT puzzle, set_id, pts FROM scores WHERE pid = ?1").bind(pid).all();
        const sets = [...new Set(results.map(r => r.set_id))], ranks = { all: await rankIn(env, pid, "all") };
        for (const s of sets) ranks[s] = await rankIn(env, pid, s);
        return json({ name: p ? p.name : null, best: Object.fromEntries(results.map(r => [r.puzzle, r.pts])), ranks });
      }
      if (req.method === "POST" && url.pathname === "/name") {
        const b = await req.json(), name = cleanName(b.name);
        if (!okPid(b.pid) || name.length < 2) return json({ error: "Pick a name of 2 to 16 letters" }, 400);
        await env.DB.prepare("INSERT INTO players (pid, name, at) VALUES (?1, ?2, ?3) ON CONFLICT(pid) DO UPDATE SET name = ?2, at = ?3").bind(b.pid, name, new Date().toISOString()).run();
        return json({ ok: true, name });
      }
      if (req.method === "POST" && url.pathname === "/submit") {
        const b = await req.json(), name = cleanName(b.name);
        if (!okPid(b.pid)) return json({ error: "bad player" }, 400);
        if (name.length < 2) return json({ error: "Pick a name of 2 to 16 letters" }, 400);
        const D = await data(env), hit = D.PZ.get(b.puzzle);
        if (!hit) return json({ error: "Unknown puzzle" }, 400);
        const slots = D.FORMS[hit.pz.formation];
        if (!Array.isArray(b.team) || b.team.length !== slots.length) return json({ error: "Fill every spot" }, 400);
        const team = b.team.map(id => D.BYID.get(String(id)) || null);
        if (team.some(c => !c)) return json({ error: "Unknown card" }, 400);
        const sc = pzScore(hit.pz, slots, team);
        if (!sc.ok) return json({ error: sc.why, chem: sc.total }, 400);
        const now = new Date().toISOString();
        await env.DB.prepare("INSERT INTO players (pid, name, at) VALUES (?1, ?2, ?3) ON CONFLICT(pid) DO UPDATE SET name = ?2").bind(b.pid, name, now).run();
        const old = await env.DB.prepare("SELECT pts FROM scores WHERE pid = ?1 AND puzzle = ?2").bind(b.pid, b.puzzle).first();
        if (!old || sc.pts > old.pts)
          await env.DB.prepare("INSERT INTO scores (pid, puzzle, set_id, pts, team, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(pid, puzzle) DO UPDATE SET pts = ?4, team = ?5, at = ?6")
            .bind(b.pid, b.puzzle, hit.set, sc.pts, JSON.stringify(b.team), now).run();
        return json({ ok: true, pts: sc.pts, best: Math.max(sc.pts, old ? old.pts : 0), chem: sc.total, set: await rankIn(env, b.pid, hit.set), all: await rankIn(env, b.pid, "all") });
      }
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
};
