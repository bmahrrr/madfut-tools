// Runs the exact My Club solver off the main thread so the page stays responsive.
importScripts("engine.js?v=20261016l");
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
    } else if (m.type === "o2") {             // win/draw/loss (3/2/0) for both lead orders, for the key-card check
      postMessage({ id: m.id, ok: true, result: [0, 1].map(f => new Solver(m.A, m.B, f).outcome()) });
    } else if (m.type === "pv") {             // the perfect game, move by move (both sides play perfectly)
      const P = new Solver(m.A, m.B, m.first), steps = [];
      let ma = 2047, mb = 2047, d = 0;
      for (let n = 0; n < 10; n++) {
        const aLeads = (n % 2 === 0) === (m.first === 0);
        let best = null;
        if (aLeads) {                         // you lead: the lead that keeps your best result, then wins its round most often
          const V = P.outcome(ma, mb, d), thr = thrOf(V);
          for (let i = 0; i < 11; i++) if (ma >> i & 1) for (let s = 0; s < 3; s++) {
            let ok = true, worst = null;
            for (let j = 0; j < 11 && ok; j++) if (mb >> j & 1) {
              const r = P.duel(i, j, s, true); ok = P.win(ma & ~(1 << i), mb & ~(1 << j), d + r, thr);
            }
            if (!ok) continue;
            for (let j = 0; j < 11; j++) if (mb >> j & 1) {          // their best answer to it
              const r = P.duel(i, j, s, true), v = P.outcome(ma & ~(1 << i), mb & ~(1 << j), d + r);
              const k = [v, r, -P.TB[j]];
              if (!worst || k[0] < worst.k[0] || (k[0] === worst.k[0] && (k[1] < worst.k[1] || (k[1] === worst.k[1] && k[2] > worst.k[2])))) worst = { j, r, k };
            }
            const key = [worst.r, -P.TA[i]];
            if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { i, s, j: worst.j, r: worst.r, key };
          }
        } else {                              // they lead: the lead that holds you lowest; you answer with your best reply
          for (let j = 0; j < 11; j++) if (mb >> j & 1) for (let s = 0; s < 3; s++) {
            let rep = null;
            for (let i = 0; i < 11; i++) if (ma >> i & 1) {
              const r = P.duel(i, j, s, false), v = P.outcome(ma & ~(1 << i), mb & ~(1 << j), d + r);
              const k = [v, r, -P.TA[i]];
              if (!rep || k[0] > rep.k[0] || (k[0] === rep.k[0] && (k[1] > rep.k[1] || (k[1] === rep.k[1] && k[2] > rep.k[2])))) rep = { i, r, k };
            }
            const key = [rep.k[0], rep.r, P.TB[j]];
            if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { i: rep.i, s, j, r: rep.r, key };
          }
        }
        steps.push({ lead: aLeads ? "A" : "B", i: best.i, j: best.j, s: best.s, r: best.r });
        ma &= ~(1 << best.i); mb &= ~(1 << best.j); d += best.r;
      }
      const ai = 31 - Math.clz32(ma), bi = 31 - Math.clz32(mb), gap = P.TA[ai] - P.TB[bi];
      const tb = d >= -1 && d <= 1 ? (gap > 5 ? 1 : gap < -5 ? -1 : 0) : 0;
      postMessage({ id: m.id, ok: true, result: { steps, ai, bi, gap, tb, d } });
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
