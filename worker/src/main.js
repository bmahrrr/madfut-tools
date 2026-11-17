// Puzzles leaderboard server (Cloudflare Worker + D1). Built by adding this after docs/sbc-solver.js and
// docs/puzzle-core.js, so every answer is scored by the same code as the site: nobody can send a made-up score.
// Accounts are a unique name + a 4 to 6 digit PIN, so your scores follow you to any device.
//   POST /register {name, pin}           -> {pid, token, name}     new name (names are unique, any case)
//   POST /login {name, pin}              -> {pid, token, name}     sign in on another device (5 wrong PINs = 15 min wait)
//   GET  /me  (Authorization: Bearer <token>)   -> your name, best per puzzle, best squads, ranks
//   POST /submit {puzzle, team}  (Bearer)       -> checks it, keeps your best
//   POST /name {name}  (Bearer)                 -> change your name
//   GET  /lb?set=<set id or "all">              -> top 50: name, points, puzzles solved (+ your rank if signed in)
//   GET  /lb?puzzle=<puzzle id>                 -> top 50 for one puzzle: name, points, chem, squad rating
// Live at https://madfut-puzzles.bmahrrr1.workers.dev
const SITE_DEFAULT = "https://bmahrrr.github.io/madfut-tools/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ "Content-Type": "application/json" }, CORS) });
const now = () => new Date().toISOString();

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
const okPin = p => typeof p === "string" && /^\d{4,6}$/.test(p);
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
async function pinHash(pin, salt) {             // PBKDF2, light enough for the free plan's CPU limit; the lockout does the real work
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 20000 }, key, 256));
}
async function newToken(env, pid) {
  const t = rand(24);
  await env.DB.prepare("INSERT INTO tokens (token_hash, pid, at) VALUES (?1, ?2, ?3)").bind(await sha(t), pid, now()).run();
  return t;
}
async function who(env, req) {
  const m = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.get("Authorization") || "");
  if (!m) return null;
  const r = await env.DB.prepare("SELECT p.pid, p.name FROM tokens t JOIN players p ON p.pid = t.pid WHERE t.token_hash = ?1").bind(await sha(m[1])).first();
  return r || null;
}
// one board: the whole game ("all"), a set, or (with puzzle) a single puzzle. Ties: first to get there ranks higher
async function board(env, set, puzzle) {
  const q = puzzle
    ? env.DB.prepare("SELECT p.name, s.pts, s.chem, s.rating FROM scores s JOIN players p ON p.pid = s.pid WHERE s.puzzle = ?1 ORDER BY s.pts DESC, s.at ASC LIMIT 50").bind(puzzle)
    : set === "all"
    ? env.DB.prepare("SELECT p.name, SUM(s.pts) AS pts, COUNT(*) AS solved FROM scores s JOIN players p ON p.pid = s.pid GROUP BY s.pid ORDER BY pts DESC, MAX(s.at) ASC LIMIT 50")
    : env.DB.prepare("SELECT p.name, SUM(s.pts) AS pts, COUNT(*) AS solved FROM scores s JOIN players p ON p.pid = s.pid WHERE s.set_id = ?1 GROUP BY s.pid ORDER BY pts DESC, MAX(s.at) ASC LIMIT 50").bind(set);
  return (await q.all()).results;
}
// your place on a board: rank = 1 + players with more points
async function rankIn(env, pid, set, puzzle) {
  const mine = await (puzzle ? env.DB.prepare("SELECT pts AS t FROM scores WHERE pid = ?1 AND puzzle = ?2").bind(pid, puzzle)
    : set === "all" ? env.DB.prepare("SELECT SUM(pts) AS t FROM scores WHERE pid = ?1").bind(pid)
    : env.DB.prepare("SELECT SUM(pts) AS t FROM scores WHERE pid = ?1 AND set_id = ?2").bind(pid, set)).first();
  if (!mine || mine.t == null) return null;
  const above = await (puzzle ? env.DB.prepare("SELECT COUNT(*) AS n FROM scores WHERE puzzle = ?2 AND pts > ?1").bind(mine.t, puzzle)
    : set === "all" ? env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS t FROM scores GROUP BY pid) WHERE t > ?1").bind(mine.t)
    : env.DB.prepare("SELECT COUNT(*) AS n FROM (SELECT SUM(pts) AS t FROM scores WHERE set_id = ?2 GROUP BY pid) WHERE t > ?1").bind(mine.t, set)).first();
  return { rank: above.n + 1, pts: mine.t };
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url), P = url.pathname;
    try {
      if (req.method === "GET" && P === "/lb") {
        const set = url.searchParams.get("set") || "all", puzzle = url.searchParams.get("puzzle") || "", me = await who(env, req);
        return json({ set, puzzle, rows: await board(env, set, puzzle), you: me ? await rankIn(env, me.pid, set, puzzle) : null });
      }
      if (req.method === "POST" && P === "/register") {
        const b = await req.json(), name = cleanName(b.name);
        if (name.length < 2) return json({ error: "Pick a name of 2 to 16 letters or numbers" }, 400);
        if (!okPin(b.pin)) return json({ error: "Your PIN needs 4 to 6 digits" }, 400);
        const taken = await env.DB.prepare("SELECT 1 FROM players WHERE name_lc = ?1").bind(name.toLowerCase()).first();
        if (taken) return json({ error: "That name is taken. If it's yours, sign in instead." }, 409);
        const pid = rand(12), salt = rand(12);
        await env.DB.prepare("INSERT INTO players (pid, name, name_lc, salt, pin_hash, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)").bind(pid, name, name.toLowerCase(), salt, await pinHash(b.pin, salt), now()).run();
        return json({ pid, name, token: await newToken(env, pid) });
      }
      if (req.method === "POST" && P === "/login") {
        const b = await req.json(), name = cleanName(b.name);
        const p = await env.DB.prepare("SELECT pid, name, salt, pin_hash, fails, locked_until FROM players WHERE name_lc = ?1").bind(name.toLowerCase()).first();
        if (!p || !okPin(b.pin)) return json({ error: "Name or PIN is wrong" }, 401);
        if (p.locked_until > Date.now()) return json({ error: `Too many wrong PINs. Try again in ${Math.ceil((p.locked_until - Date.now()) / 60e3)} min.` }, 429);
        if (await pinHash(b.pin, p.salt) !== p.pin_hash) {
          const f = p.fails + 1, lock = f >= 5 ? Date.now() + 15 * 60e3 : 0;
          await env.DB.prepare("UPDATE players SET fails = ?2, locked_until = ?3 WHERE pid = ?1").bind(p.pid, lock ? 0 : f, lock).run();
          return json({ error: lock ? "Too many wrong PINs. Try again in 15 min." : "Name or PIN is wrong" }, 401);
        }
        await env.DB.prepare("UPDATE players SET fails = 0, locked_until = 0 WHERE pid = ?1").bind(p.pid).run();
        return json({ pid: p.pid, name: p.name, token: await newToken(env, p.pid) });
      }
      const me = await who(env, req);
      if (P === "/me" || P === "/submit" || P === "/name") if (!me) return json({ error: "Please sign in again" }, 401);
      if (req.method === "GET" && P === "/me") {
        const { results } = await env.DB.prepare("SELECT puzzle, set_id, pts, team FROM scores WHERE pid = ?1").bind(me.pid).all();
        const sets = [...new Set(results.map(r => r.set_id))], ranks = { all: await rankIn(env, me.pid, "all") };
        for (const s of sets) ranks[s] = await rankIn(env, me.pid, s);
        return json({ name: me.name, best: Object.fromEntries(results.map(r => [r.puzzle, r.pts])), teams: Object.fromEntries(results.map(r => [r.puzzle, JSON.parse(r.team)])), ranks });
      }
      if (req.method === "POST" && P === "/name") {
        const b = await req.json(), name = cleanName(b.name);
        if (name.length < 2) return json({ error: "Pick a name of 2 to 16 letters or numbers" }, 400);
        const taken = await env.DB.prepare("SELECT pid FROM players WHERE name_lc = ?1").bind(name.toLowerCase()).first();
        if (taken && taken.pid !== me.pid) return json({ error: "That name is taken" }, 409);
        await env.DB.prepare("UPDATE players SET name = ?2, name_lc = ?3 WHERE pid = ?1").bind(me.pid, name, name.toLowerCase()).run();
        return json({ ok: true, name });
      }
      if (req.method === "POST" && P === "/submit") {
        const b = await req.json(), D = await data(env), hit = D.PZ.get(b.puzzle);
        if (!hit) return json({ error: "Unknown puzzle" }, 400);
        const slots = D.FORMS[hit.pz.formation];
        if (!Array.isArray(b.team) || b.team.length !== slots.length) return json({ error: "Fill every spot" }, 400);
        const team = b.team.map(id => D.BYID.get(String(id)) || null);
        if (team.some(c => !c)) return json({ error: "Unknown card" }, 400);
        const sc = pzScore(hit.pz, slots, team);
        if (!sc.ok) return json({ error: sc.why, chem: sc.total }, 400);
        const old = await env.DB.prepare("SELECT pts FROM scores WHERE pid = ?1 AND puzzle = ?2").bind(me.pid, b.puzzle).first();
        if (!old || sc.pts > old.pts)
          await env.DB.prepare("INSERT INTO scores (pid, puzzle, set_id, pts, chem, rating, team, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(pid, puzzle) DO UPDATE SET pts = ?4, chem = ?5, rating = ?6, team = ?7, at = ?8")
            .bind(me.pid, b.puzzle, hit.set, sc.pts, sc.total, sc.rating, JSON.stringify(b.team), now()).run();
        return json({ ok: true, pts: sc.pts, best: Math.max(sc.pts, old ? old.pts : 0), chem: sc.total, puzzle: await rankIn(env, me.pid, hit.set, b.puzzle), set: await rankIn(env, me.pid, hit.set), all: await rankIn(env, me.pid, "all") });
      }
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ error: String(e.message || e) }, 500); }
  },
};
