// Runs the exact My Club solver off the main thread so the page stays responsive.
importScripts("engine.js?v=20261016a");
let S = null;
// Match Helper works on win / draw / loss only (level 3 / 2 / 0) and, for leads, only checks which moves keep
// the best result reachable - far quicker than scoring every move exactly (fits the 30-second move timer).
const thrOf = v => (v >= 3 ? 1 : v === 2 ? 0 : -1);
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === "solve") {                 // My Club Compare: full result with margins
      const res = [0, 1].map(f => new Solver(m.A, m.B, f).level());
      postMessage({ id: m.id, ok: true, result: res });
    } else if (m.type === "start") {          // new match, or a card swapped mid-match: solve from the current state
      S = new Solver(m.A, m.B, m.first);
      postMessage({ id: m.id, ok: true, result: S.outcome(m.ma ?? 2047, m.mb ?? 2047, m.d ?? 0) });
    } else if (m.type === "value") {
      postMessage({ id: m.id, ok: true, result: S.outcome(m.ma, m.mb, m.d) });
    } else if (m.type === "leads") {          // leads for side A that keep the best reachable result
      const { ma, mb, d } = m, V = S.outcome(ma, mb, d), thr = thrOf(V), out = [];
      for (let i = 0; i < 11; i++) {
        if (!(ma >> i & 1)) continue;
        for (let s = 0; s < 3; s++) {
          let ok = true;
          for (let k = 0; k < 11 && ok; k++) if (mb >> k & 1) ok = S.win(ma & ~(1 << i), mb & ~(1 << k), d + S.duel(i, k, s, true), thr);
          out.push({ i, s, value: ok ? V : V - 1 });
        }
      }
      out.sort((x, y) => (y.value - x.value) || (S.TA[x.i] - S.TA[y.i]));   // keep high tiebreak cards for later
      postMessage({ id: m.id, ok: true, result: out });
    } else if (m.type === "answers") {        // answers for side A to B's lead (j, s)
      const { ma, mb, d, j, s } = m; const out = [];
      for (let i = 0; i < 11; i++) {
        if (!(ma >> i & 1)) continue;
        const r = S.duel(i, j, s, false);
        out.push({ i, r, value: S.outcome(ma & ~(1 << i), mb & ~(1 << j), d + r) });
      }
      out.sort((x, y) => (y.value - x.value) || (y.r - x.r) || (S.TA[x.i] - S.TA[y.i]));
      postMessage({ id: m.id, ok: true, result: out });
    }
  } catch (err) { postMessage({ id: m.id, ok: false, error: String(err) }); }
};
