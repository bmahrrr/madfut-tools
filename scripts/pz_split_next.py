# Split search for the hardest puzzles (.github/workflows/puzzle-split.yml): one puzzle at a time, cut into slices by
# squad rating, one machine each. A slice that doesn't finish is cut again by number of bonus cards, then by chem. When every slice
# shows nothing beats the top score, the puzzle is proven (Icons and Heroes included).
#   python scripts/pz_split_next.py                       prints pid=, specs=, minutes=, timeout= for the next run
#   python scripts/pz_split_next.py done <pid> <specs json> <result files...>   records a finished run (squads pulled in)
import json, sys, os, glob, subprocess
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs") + "/"
F = D + "puzzles_max.json"; M = json.load(open(F)); m = M["puzzles"]
P = json.load(open(D + "puzzles.json")); PZ = {p["id"]: p for s in P["sets"] for p in s["puzzles"]}
FORMS = json.load(open(D + "formations.json"))
done = lambda x: x.get("proven") and x.get("icons")


def rating(pid):
    r = subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pz_max.js"), "score", pid, *m[pid]["team"]],
                       capture_output=True, text=True, env=dict(os.environ, PZ_RATING="1"))
    return int(r.stdout.strip() or 70)


def first_slices(pid):
    r0 = rating(pid); lo, hi = max(41, r0 - 15), min(98, r0 + 16)
    return [f"R40-{lo - 1}"] + [f"R{r}" for r in range(lo, hi + 1)] + [f"R{hi + 1}-99"]


if len(sys.argv) > 1 and sys.argv[1] == "done":
    pid, specs, files = sys.argv[2], json.loads(sys.argv[3]), sys.argv[4:]
    res = {}
    for f in files:
        try: r = json.load(open(f)); res[r["spec"]] = r["status"]
        except Exception: pass
    e = m[pid]
    if any(v == "better" for v in res.values()):
        e.pop("open", None)                       # a better squad: start again against the new top score
    else:
        left = [s for s in specs if res.get(s) != "proven"]
        if not left:
            e.update(proven=True, icons=True, chem=True); e.pop("open", None)
        else:
            nfree = len(FORMS[PZ[pid]["formation"]]) - len(PZ[pid]["locked"])
            again = []
            for s in left:
                if "C" in s: e["gaveup"] = True    # cut as far as it goes and still too hard: keep the best squad found
                elif "H" in s: again += [f"{s}C{c}" for c in range(PZ[pid]["target"], 34)]
                else: again += [f"{s}H{k}" for k in range(nfree + 1)]
            if e.get("gaveup"): e.pop("open", None)
            else: e["open"] = again
    json.dump(M, open(F, "w"), separators=(",", ":"))
    print(pid, "proven" if done(e) else "gave up" if e.get("gaveup") else f"{len(e.get('open', []))} slices left")
else:
    todo = [p for p in PZ if not done(m.get(p, {})) and not m.get(p, {}).get("gaveup") and m.get(p, {}).get("team")]
    if not todo: print("pid="); print("specs=[]"); print("minutes=0"); print("timeout=1"); sys.exit()
    pid = todo[0]; specs = m[pid].get("open") or first_slices(pid)
    deep = any("H" in s for s in specs)        # second and third cuts get up to 4 hours a slice
    print(f"pid={pid}"); print("specs=" + json.dumps(specs)); print(f"minutes={240 if deep else 120}"); print(f"timeout={260 if deep else 140}")
