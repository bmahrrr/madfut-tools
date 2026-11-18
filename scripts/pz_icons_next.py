# The Icons check (.github/workflows/puzzle-icons.yml): which puzzles to prove next, with every card allowed.
#   python scripts/pz_icons_next.py              prints ids=[...], minutes= and timeout= for the next block
#   python scripts/pz_icons_next.py tried <ids>  counts a try for each of those puzzles not proven with Icons yet
import json, sys, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs") + "/"
PASSES = [(150, 170), (330, 350)]   # minutes a puzzle, job timeout: a puzzle gets one go at each
BLOCK = 34
F = D + "puzzles_max.json"; M = json.load(open(F)); m = M["puzzles"]
P = json.load(open(D + "puzzles.json"))
ids = [p["id"] for s in P["sets"] for p in s["puzzles"]]
done = lambda i: m.get(i, {}).get("proven") and m.get(i, {}).get("icons")
if len(sys.argv) > 2 and sys.argv[1] == "tried":
    for i in json.loads(sys.argv[2]):
        if i in m and not done(i): m[i]["tries2"] = m[i].get("tries2", 0) + 1
    json.dump(M, open(F, "w"), separators=(",", ":"))
else:
    for k, (mins, tmo) in enumerate(PASSES):
        L = [i for i in ids if not done(i) and m.get(i, {}).get("tries2", 0) == k]
        if L: break
    else: L, mins, tmo = [], 0, 1
    print("ids=" + json.dumps(L[:BLOCK])); print(f"minutes={mins}"); print(f"timeout={tmo}")
