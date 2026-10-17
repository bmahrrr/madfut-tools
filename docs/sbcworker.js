// Runs the SBC solver off the main thread. Loads the cards and the HiGHS solver once, then answers solve requests.
importScripts("vendor/highs.js", "sbc-solver.js?v=20261018d");
let ready = null;
async function load() {
  const get = async p => { const r = await fetch(p + "?t=" + Date.now()); if (!r.ok) throw new Error("Could not load " + p); return r.json(); };
  const [highs, d, FORMS] = await Promise.all([Module({ locateFile: f => "vendor/" + f }), get("cards.json"), get("formations.json")]);
  const cards = d.cards.map(r => { const c = {}; d.fields.forEach((f, i) => c[f] = r[i]); return c; });
  cards.forEach(c => { c.P = new Set([c.position, ...String(c.altPositions || "").split(",").filter(Boolean)]); });
  return { highs, cards, FORMS };
}
onmessage = async e => {
  const m = e.data;
  try {
    if (!ready) ready = load();
    const { highs, cards, FORMS } = await ready;
    const t0 = Date.now();
    const res = solveSBC(highs, m.req, cards, FORMS, text => postMessage({ id: m.id, type: "progress", text }), m.timeLimit || 15, {},
      partial => postMessage({ id: m.id, type: "partial", result: partial, seconds: Math.round((Date.now() - t0) / 1000) }));
    postMessage({ id: m.id, type: "done", result: res, seconds: Math.round((Date.now() - t0) / 1000) });
  } catch (err) {
    postMessage({ id: m.id, type: "error", error: String(err && err.message || err) });
  }
};
