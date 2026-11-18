# Top score for each puzzle in a set (for the gold "Perfect" score).
#   python scripts/pz_max.py <set id> <seconds per puzzle> <eligible ids json> <out json> [puzzles json]
# Maximises bonus + budget with every chem rule, locked cards in their spots, no Icons or Heroes (the no-Icon bonus is
# always worth more than an Icon's chem here). A card can also go out of position, like the game: it gets 0 chem and
# adds nothing to anyone's chem, but still counts for the bonus and the squad rating. Two passes: first only the cards
# that can link to the locked cards or score the bonus (fast, finds the best squad nearly always), then every card,
# started from that squad, which proves it's the top score when it finishes in time. The squad found is scored again
# by the site's own code afterwards (scripts/pz_max.js).
import json, sys, os, collections, time
from ortools.sat.python import cp_model

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs") + "/"
T = {"n": [2, 5, 8], "l": [3, 5, 8], "c": [2, 4, 7]}
fld = {"n": "nationId", "l": "leagueId", "c": "clubId"}
pos = lambda c: {c["position"], *[p for p in str(c["altPositions"] or "").split(",") if p]}
sc = lambda c, k: (k + "2") in str(c.get("specialChem") or "").split(",")
key = lambda c: c.get("baseId") or c["name"]


class Data:
    def __init__(self, elig, puzzles=None):
        d = json.load(open(D + "cards.json")); F = d["fields"]
        self.cards = [dict(zip(F, r)) for r in d["cards"]]
        self.byid = {c["id"]: c for c in self.cards}
        self.forms = json.load(open(D + "formations.json"))
        self.P = json.load(open(puzzles or D + "puzzles.json"))
        ok = set(json.load(open(elig)) if isinstance(elig, str) else elig)   # not Icons / Heroes, allowed in SBCs
        self.pool = [c for c in self.cards if c["id"] in ok]


def solve(DA, pz, restrict, hint, secs, workers=None):
    slots = DA.forms[pz["formation"]]
    locked = {l["i"]: DA.byid[l["id"]] for l in pz["locked"]}
    B = pz["bonus"]
    hit = lambda c: (c["leagueId"] if B["on"] == "league" else c["nationId"] if B["on"] == "nation" else c["clubId"]) == B["id"]
    LN = {c["nationId"] for c in locked.values()}; LL = {c["leagueId"] for c in locked.values()}; LC = {c["clubId"] for c in locked.values()}
    lowest = sorted(DA.pool, key=lambda c: c["rating"])
    cand, oop = {}, {}
    for i, s in enumerate(slots):
        if i in locked: continue
        g = collections.defaultdict(list)
        for c in DA.pool:
            if s in pos(c): g[(c["nationId"], c["leagueId"], c["clubId"], sc(c, "nation"), sc(c, "league"), sc(c, "club"))].append(c)
        L = [c for v in g.values() for c in sorted(v, key=lambda c: c["rating"])[:2]]   # same links: the lowest 2 are enough
        if restrict: L = [c for c in L if hit(c) or c["nationId"] in LN or c["leagueId"] in LL or c["clubId"] in LC]
        n = len(L)
        # out of position: only its rating and the bonus matter, so the lowest few of each are enough
        L += [c for c in lowest if s not in pos(c) and not hit(c)][:4] + [c for c in lowest if s not in pos(c) and hit(c)][:4]
        if hint and hint[i] not in {c["id"] for c in L}:
            c = DA.byid[hint[i]]
            if s in pos(c): L.insert(n, c); n += 1
            else: L.append(c)
        cand[i], oop[i] = L, set(range(n, len(L)))
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
        for (i, j), v in x.items():
            if j in oop[i]: continue                              # out of position: adds nothing
            c = cand[i][j]; terms[c[fld[k]]].append((w(c, k), v))
        for c in locked.values(): const[c[fld[k]]] += w(c, k)
        for gid in set(terms) | set(const):
            cnt = sum(a * v for a, v in terms[gid]) + const[gid]
            for lv, th in enumerate(T[k]):
                b = m.NewBoolVar(""); ind[k, gid, lv] = b; m.Add(cnt >= th).OnlyEnforceIf(b)
    lv = lambda c: sum(ind[k, c[fld[k]], q] for k in "nlc" for q in range(3) if (k, c[fld[k]], q) in ind)
    chem = []
    for i in range(len(slots)):
        ci = m.NewIntVar(0, 3, "")
        if i in locked:
            m.Add(ci <= lv(locked[i]))
            if pz.get("lockChem"): m.Add(lv(locked[i]) >= pz["lockChem"])   # locked cards need this much chem
        else:
            for j, c in enumerate(cand[i]): m.Add(ci <= (0 if j in oop[i] else lv(c))).OnlyEnforceIf(x[i, j])
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
    m.Maximize(B["each"] * hits + (each * (pz["budget"]["par"] - R) if each else 0))
    if hint:
        for (i, j), v in x.items(): m.AddHint(v, 1 if cand[i][j]["id"] == hint[i] else 0)
    s = cp_model.CpSolver(); s.parameters.max_time_in_seconds = secs; s.parameters.num_workers = workers or os.cpu_count() or 2
    st = s.Solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE): return None, s.StatusName(st)
    team = [locked[i]["id"] if i in locked else [cand[i][j] for j in range(len(cand[i])) if s.Value(x[i, j])][0]["id"] for i in range(len(slots))]
    return team, s.StatusName(st)


def top(DA, pz, secs):
    a, sa = solve(DA, pz, True, None, secs / 2)
    b, sb = solve(DA, pz, False, a, secs / 2)
    return {"teams": [t for t in (a, b) if t], "proven": sb == "OPTIMAL"}, sa, sb


if __name__ == "__main__" and sys.argv[1] == "prove":
    # one puzzle, a long full search started from its best known squad: proves it's the top score, or finds a better one
    #   python scripts/pz_max.py prove <puzzle id> <seconds> <eligible ids json> <out json>
    PID, SECS, ELIG, OUT = sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
    DA = Data(ELIG)
    pz = next(p for s in DA.P["sets"] for p in s["puzzles"] if p["id"] == PID)
    known = json.load(open(D + "puzzles_max.json"))["puzzles"].get(PID, {})
    t0 = time.time(); team, st = solve(DA, pz, False, known.get("team"), SECS)
    json.dump({PID: {"teams": [t for t in (team, known.get("team")) if t], "proven": st == "OPTIMAL"}}, open(OUT, "w"))
    print(PID, st, f"{time.time() - t0:.0f}s", flush=True)
elif __name__ == "__main__":
    SET, SECS, ELIG, OUT = sys.argv[1], float(sys.argv[2]), sys.argv[3], sys.argv[4]
    DA = Data(ELIG, sys.argv[5] if len(sys.argv) > 5 else None)
    out = {}
    for pz in next(s for s in DA.P["sets"] if s["id"] == SET)["puzzles"]:
        t0 = time.time()
        out[pz["id"]], sa, sb = top(DA, pz, SECS)
        print(pz["id"], sa, sb, f"{time.time() - t0:.0f}s", flush=True)
    json.dump(out, open(OUT, "w"))
