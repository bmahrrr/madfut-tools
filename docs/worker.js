// Runs the exact My Club solver off the main thread so the page stays responsive.
importScripts("engine.js?v=20261013c");
let S = null, key = null;
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "solve") {
      const res = [0, 1].map(f => new Solver(m.A, m.B, f).level());
      postMessage({ id: m.id, ok: true, result: res });
    } else if (m.type === "start") {
      S = new Solver(m.A, m.B, m.first); key = m.id;
      postMessage({ id: m.id, ok: true, result: S.level() });
    } else if (m.type === "leads") {        // best leads for side A at state
      const { ma, mb, d } = m; const out = [];
      for (let i = 0; i < 11; i++) {
        if (!(ma >> i & 1)) continue;
        for (let s = 0; s < 3; s++) {
          let w = 9;
          for (let k = 0; k < 11; k++) if (mb >> k & 1) w = Math.min(w, S.level(ma & ~(1 << i), mb & ~(1 << k), d + S.duel(i, k, s, true)));
          out.push({ i, s, value: w });
        }
      }
      out.sort((x, y) => (y.value - x.value) || (S.TA[x.i] - S.TA[y.i]));
      postMessage({ id: m.id, ok: true, result: out });
    } else if (m.type === "answers") {      // best answers for side A to B's lead (j, s)
      const { ma, mb, d, j, s } = m; const out = [];
      for (let i = 0; i < 11; i++) {
        if (!(ma >> i & 1)) continue;
        const r = S.duel(i, j, s, false);
        out.push({ i, r, value: S.level(ma & ~(1 << i), mb & ~(1 << j), d + r) });
      }
      out.sort((x, y) => (y.value - x.value) || (y.r - x.r) || (S.TA[x.i] - S.TA[y.i]));
      postMessage({ id: m.id, ok: true, result: out });
    } else if (m.type === "value") {
      postMessage({ id: m.id, ok: true, result: S.level(m.ma, m.mb, m.d) });
    }
  } catch (err) { postMessage({ id: m.id, ok: false, error: String(err) }); }
};
