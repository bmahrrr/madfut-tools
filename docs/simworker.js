// Builds a Fatal Sim team on the phone (no GitHub needed). Loads cards + HiGHS once.
importScripts("vendor/highs.js", "engine.js?v=20261013h", "sim-builder.js?v=20261013h");
let ready = null;
async function load() {
  const get = async p => { const r = await fetch(p + "?t=" + Date.now()); if (!r.ok) throw new Error("Could not load " + p); return r.json(); };
  const [highs, d, FORMS, ex] = await Promise.all([Module({ locateFile: f => "vendor/" + f }), get("cards.json"), get("formations.json"),
    get("results/extras.json").catch(() => ({ cards: [] }))]);
  const cards = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
  for (const c of ex.cards || []) if (c.owned !== false) cards.push(Object.assign({ specialChem: "" }, c));
  cards.forEach(c => { c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)]); });
  return { highs, cards, FORMS };
}
onmessage = async e => {
  const m = e.data;
  try {
    if (!ready) ready = load();
    const { highs, cards, FORMS } = await ready;
    const skip = new Set(m.notOwned || []), t0 = Date.now();
    const team = buildSimTeam(highs, m.series, cards.filter(c => !skip.has(c.id)), FORMS, text => postMessage({ id: m.id, type: "progress", text }), m.timeLimit || 20);
    postMessage({ id: m.id, type: "done", team, seconds: Math.round((Date.now() - t0) / 1000) });
  } catch (err) { postMessage({ id: m.id, type: "error", error: String(err && err.message || err) }); }
};
