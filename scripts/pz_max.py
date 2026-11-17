# Top score for each puzzle in a set (for the gold "Perfect" score).
#   python scripts/pz_max.py <set id> <seconds per puzzle> <eligible ids json> <out json>
# Maximises bonus + budget with every chem rule, locked cards in their spots, no Icons or Heroes (the no-Icon bonus is
# always worth more than an Icon's chem here). Two passes: first only the cards that can link to the locked cards or
# score the bonus (fast, finds the best squad nearly always), then every card, started from that squad, which proves
# it's the top score when it finishes in time. The squad found is scored again by the site's own code afterwards.
import json, sys, os, collections, time
from ortools.sat.python import cp_model

D = os.path.join(os.path.dirname(__file__), "..", "docs") + "/"
SET, SECS, ELIG, OUT = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
d = json.load(open(D + "cards.json")); F = d["fields"]; cards = [dict(zip(F, r)) for r in d["cards"]]
P = json.load(open(D + "puzzles.json")); FORMS = json.load(open(D + "formations.json"))
ok = set(json.load(open(ELIG)))           # not Icons / Heroes, allowed in SBCs (from the site's own rules)
byid = {c["id"]: c for c in cards}
pos = lambda c: {c["position"], *[p for p in str(c["altPositions"] or "").split(",") if p]}
sc = lambda c, k: (k + "2") in str(c.get("specialChem") or "").split(",")
key = lambda c: c.get("baseId") or c["name"]
T = {"n": [2, 5, 8], "l": [3, 5, 8], "c": [2, 4, 7]}
fld = {"n": "nationId", "l": "leagueId", "c": "clubId"}


def solve(pz, restrict, hint, secs):
    slots = FORMS[pz["formation"]]
    locked = {l["i"]: byid[l["id"]] for l in pz["locked"]}
    B = pz["bonus"]
    hit = lambda c: (c["leagueId"] if B["on"] == "league" else c["nationId"] if B["on"] == "nation" else c["clubId"]) == B["id"]
    pool = [c for c in cards if c["id"] in ok]
    LN = {c["nationId"] for c in locked.values()}; LL = {c["leagueId"] for c in locked.values()}; LC = {c["clubId"] for c in locked.values()}
    cand = {}
    for i, s in enumerate(slots):
        if i in locked: continue
        g = collections.defaultdict(list)
        for c in pool:
            if s in pos(c): g[(c["nationId"], c["leagueId"], c["clubId"], sc(c, "nation"), sc(c, "league"), sc(c, "club"))].append(c)
        L = [c for v in g.values() for c in sorted(v, key=lambda c: c["rating"])[:2]]   # same links: the lowest 2 are enough
        if restrict: L = [c for c in L if hit(c) or c["nationId"] in LN or c["leagueId"] in LL or c["clubId"] in LC]
        if hint and hint[i] not in {c["id"] for c in L}: L.append(byid[hint[i]])
        cand[i] = L
    m = cp_model.CpModel(); x = {}
    for i, L in cand.items():
        for k in range(len(L)): x[i, k] = m.NewBoolVar("")
        m.AddExactlyOne(x[i, k] for k in range(len(L)))
    bykey = collections.defaultdict(list)
    for (i, k), v in x.items(): bykey[key(cand[i][k])].append(v)
    for c in locked.values(): bykey[key(c)].append(1)
    for vs in bykey.values():
        vv = [v for v in vs if not isinstance(v, int)]; fixed = sum(1 for v in vs if isinstance(v, int))
        if vv: m.Add(sum(vv) <= 1 - fixed)
    w = lambda c, k: 2 if sc(c, {"n": "nation", "l": "league", "c": "club"}[k]) else 1
    ind = {}
    for k in "nlc":
        terms = collections.defaultdict(list); const = collections.Counter()
        for (i, j), v in x.items(): c = cand[i][j]; terms[c[fld[k]]].append((w(c, k), v))
        for c in locked.values(): const[c[fld[k]]] += w(c, k)
        for gid in set(terms) | set(const):
            cnt = sum(a * v for a, v in terms[gid]) + const[gid]
            for lv, th in enumerate(T[k]):
                b = m.NewBoolVar(""); ind[k, gid, lv] = b; m.Add(cnt >= th).OnlyEnforceIf(b)
    lv = lambda c: sum(ind[k, c[fld[k]], q] for k in "nlc" for q in range(3))
    chem = []
    for i in range(len(slots)):
        ci = m.NewIntVar(0, 3, "")
        if i in locked: m.Add(ci <= lv(locked[i]))
        else:
            for j, c in enumerate(cand[i]): m.Add(ci <= lv(c)).OnlyEnforceIf(x[i, j])
        chem.append(ci)
    m.Add(sum(chem) >= pz["target"])
    rat = [sum(c["rating"] * x[i, j] for j, c in enumerate(cand[i])) if i not in locked else locked[i]["rating"] for i in range(len(slots))]
    tot = sum(rat); y = []
    for r in rat:
        v = m.NewIntVar(0, 11 * 99, ""); m.Add(v >= 11 * r - tot); y.append(v)
    R = m.NewIntVar(40, 99, "")
    m.Add(121 * R + 115 >= 11 * tot + sum(y))            # squad rating, a little generous: rescored exactly afterwards
    hits = sum(x[i, j] for (i, j) in x if hit(cand[i][j]))
    each = pz["budget"]["each"] if pz.get("budget") else 0
    m.Maximize(B["each"] * hits + each * (pz["budget"]["par"] - R if each else 0))
    if hint:
        for (i, j), v in x.items(): m.AddHint(v, 1 if cand[i][j]["id"] == hint[i] else 0)
    s = cp_model.CpSolver(); s.parameters.max_time_in_seconds = secs; s.parameters.num_workers = os.cpu_count() or 2
    st = s.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE): return None, s.StatusName(st)
    team = [locked[i]["id"] if i in locked else [cand[i][j] for j in range(len(cand[i])) if s.Value(x[i, j])][0]["id"] for i in range(len(slots))]
    return team, s.StatusName(st)


out = {}
for pz in next(s for s in P["sets"] if s["id"] == SET)["puzzles"]:
    t0 = time.time()
    a, sa = solve(pz, True, None, SECS / 2)
    b, sb = solve(pz, False, a, SECS / 2)
    out[pz["id"]] = {"teams": [t for t in (a, b) if t], "proven": sb == "OPTIMAL"}
    print(pz["id"], sa, sb, f"{time.time() - t0:.0f}s", flush=True)
json.dump(out, open(OUT, "w"))
