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
# Icons and Heroes (only in a pool that includes them, for the Icons check): always 3 chem in position, no club links;
# an Icon adds 1 to its nation and 1 to every league, a Hero 1 to its nation and 1 to its league (checked in game)
AUTO = {"icon", "debut_icon", "hero", "hall_of_fut", "hall_of_fut_upgraded"}; ICON = {"icon", "debut_icon"}; HERO = {"hero", "hall_of_fut"}
kind = lambda c: "I" if c["color"] in ICON else "A" if c["color"] in AUTO else ""


def wt(c, k):
    col = c["color"]
    if k == "n": return 2 if sc(c, "nation") else 1
    if k == "l": return 0 if col in ICON else 2 if sc(c, "league") else 1
    return 0 if col in AUTO else 2 if sc(c, "club") else 1


class Data:
    def __init__(self, elig, puzzles=None):
        d = json.load(open(D + "cards.json")); F = d["fields"]
        self.cards = [dict(zip(F, r)) for r in d["cards"]]
        self.byid = {c["id"]: c for c in self.cards}
        self.forms = json.load(open(D + "formations.json"))
        self.P = json.load(open(puzzles or D + "puzzles.json"))
        ok = set(json.load(open(elig)) if isinstance(elig, str) else elig)   # not Icons / Heroes, allowed in SBCs
        self.pool = [c for c in self.cards if c["id"] in ok]


def solve(DA, pz, restrict, hint, secs, workers=None, need_auto=False, beat=None, nochem=False, wild=None):
    # need_auto: only squads with an Icon or Hero; beat: only squads scoring above this (in solver points, see below)
    # nochem: leave out every chem rule and count full chem points (a quick upper bound: nothing scores more than it)
    # wild: Icons and Heroes as one stand-in per spot that's better than any of them (lowest rating of those that fit,
    #   full chem, +1 to EVERY nation and league): a small model whose top is above any real squad with them
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
            if s in pos(c): g[(c["nationId"], c["leagueId"], c["clubId"], sc(c, "nation"), sc(c, "league"), sc(c, "club"), c["color"] if c["color"] in AUTO else "")].append(c)
        L = [c for v in g.values() for c in sorted(v, key=lambda c: c["rating"])[:2]]   # same links: the lowest 2 are enough
        if restrict: L = [c for c in L if hit(c) or c["nationId"] in LN or c["leagueId"] in LL or c["clubId"] in LC]
        if wild:
            W = sorted((c for c in wild if s in pos(c)), key=lambda c: c["rating"])
            for c in [W[0]] * bool(W) + [c for c in W if hit(c)][:1]: L.append(dict(c, _wild=True, baseId=f"wild{i}-{len(L)}"))
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
    icons = sum(x[i, j] for (i, j) in x if j not in oop[i] and kind(cand[i][j]) == "I" and not cand[i][j].get("_wild"))   # Icons in position
    wilds = sum(x[i, j] for (i, j) in x if j not in oop[i] and cand[i][j].get("_wild"))
    ind = {}
    for k in "nlc":
        terms = collections.defaultdict(list); const = collections.Counter()
        for (i, j), v in x.items():
            if j in oop[i]: continue                              # out of position: adds nothing
            c = cand[i][j]
            if c.get("_wild"): continue
            if wt(c, k): terms[c[fld[k]]].append((wt(c, k), v))
        for c in locked.values(): const[c[fld[k]]] += wt(c, k)
        for gid in set(terms) | set(const):
            cnt = sum(a * v for a, v in terms[gid]) + const[gid] + (icons if k == "l" else 0) + (wilds if k != "c" else 0)
            for lv, th in enumerate(T[k]):
                b = m.NewBoolVar(""); ind[k, gid, lv] = b; m.Add(cnt >= th).OnlyEnforceIf(b)
    lv = lambda c: sum(ind[k, c[fld[k]], q] for k in "nlc" for q in range(3) if (k, c[fld[k]], q) in ind)
    chem = []
    for i in range(len(slots)):
        ci = m.NewIntVar(0, 3, "")
        if nochem: m.Add(ci == 3); chem.append(ci); continue
        if i in locked:
            m.Add(ci <= lv(locked[i]))
            if pz.get("lockChem"): m.Add(lv(locked[i]) >= pz["lockChem"])   # locked cards need this much chem
        else:
            for j, c in enumerate(cand[i]): m.Add(ci <= (0 if j in oop[i] else 3 if c["color"] in AUTO or c.get("_wild") else lv(c))).OnlyEnforceIf(x[i, j])
        chem.append(ci)
    if not nochem: m.Add(sum(chem) >= pz["target"])
    rat = [sum(c["rating"] * x[i, j] for j, c in enumerate(cand[i])) if i not in locked else locked[i]["rating"] for i in range(len(slots))]
    tot = sum(rat); y = []
    for r in rat:
        v = m.NewIntVar(0, 11 * 99, ""); m.Add(v >= 11 * r - tot); y.append(v)
    R = m.NewIntVar(40, 99, "")
    m.Add(121 * R + 115 >= 11 * tot + sum(y))            # squad rating, a little generous: rescored exactly afterwards
    hits = sum(x[i, j] for (i, j) in x if hit(cand[i][j]))
    each = pz["budget"]["each"] if pz.get("budget") else 0
    anyA = m.NewBoolVar("")                                   # an Icon or Hero anywhere loses the no-Icons bonus
    autos = [v for (i, j), v in x.items() if cand[i][j]["color"] in AUTO or cand[i][j].get("_wild")]
    for v in autos: m.Add(anyA >= v)
    if need_auto: m.Add(sum(autos) >= 1)
    # solver points: the score minus the base and no-Icons bonus, plus chemEach x target; never below the real score (the rating is generous)
    obj = B["each"] * hits - pz.get("noIcon", 0) * anyA + (each * (pz["budget"]["par"] - R) if each else 0) + pz.get("chemEach", 0) * sum(chem)   # chemEach: points per chem over the target
    if beat is not None: m.Add(obj >= beat)
    m.Maximize(obj)
    if hint:
        for (i, j), v in x.items(): m.AddHint(v, 1 if cand[i][j]["id"] == hint[i] else 0)
    s = cp_model.CpSolver(); s.parameters.max_time_in_seconds = secs; s.parameters.num_workers = workers or os.cpu_count() or 2
    if os.environ.get("PZ_LOG"):   # live search log: each better squad found (#n) and each drop in the ceiling (#Bound)
        s.parameters.log_search_progress = True; s.parameters.log_to_stdout = True
        import threading
        done = threading.Event(); t0 = time.time()
        def beat():
            while not done.wait(60): print(f"... still searching, {(time.time() - t0) / 60:.0f} min", flush=True)
        threading.Thread(target=beat, daemon=True).start()
    st = s.Solve(m)
    if os.environ.get("PZ_LOG"): done.set()
    if need_auto and not autos: return None, "INFEASIBLE"
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE): return None, s.StatusName(st)
    team = [locked[i]["id"] if i in locked else [cand[i][j] for j in range(len(cand[i])) if s.Value(x[i, j])][0]["id"] for i in range(len(slots))]
    return team, s.StatusName(st)


def top(DA, pz, secs):
    a, sa = solve(DA, pz, True, None, secs / 2)
    b, sb = solve(DA, pz, False, a, secs / 2)
    return {"teams": [t for t in (a, b) if t], "proven": sb == "OPTIMAL", "chem": True}, sa, sb   # chem: counted chem points


if __name__ == "__main__" and sys.argv[1] == "prove2":
    # one puzzle, proven in two steps (as airtight as one search with every card, and much faster):
    #   1. the top score with no Icons or Heroes, a full search started from the best known squad (skipped if already proven)
    #   2. no squad with an Icon or Hero scores above it: with one forced in, the search finds nothing that beats it
    #   python scripts/pz_max.py prove2 <puzzle id> <seconds> <eligible ids json, Icons included> <out json>
    import subprocess, copy
    PID, SECS, ELIG, OUT = sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
    DA = Data(ELIG); DAp = copy.copy(DA); DAp.pool = [c for c in DA.pool if c["color"] not in AUTO]
    pz = next(p for s in DA.P["sets"] for p in s["puzzles"] if p["id"] == PID)
    known = json.load(open(D + "puzzles_max.json"))["puzzles"].get(PID, {})
    score = lambda t: int(subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "pz_max.js"), "score", PID, *t],
                                         capture_output=True, text=True).stdout.strip() or 0)   # the site's own scoring
    t0 = time.time(); teams = [known["team"]] if known.get("team") else []
    plain = bool(known.get("proven"))
    print(PID, "best known:", known.get("max"), "proven without Icons:" if known.get("proven") else "", flush=True)
    if not plain:
        print("STEP 1: the top with no Icons or Heroes", flush=True)
        t, st = solve(DAp, pz, False, known.get("team"), SECS * .75)
        if t: teams.append(t)
        plain = st == "OPTIMAL"
        print(PID, "without Icons:", st, f"{time.time() - t0:.0f}s", flush=True)
    best = max(teams, key=score) if teams else None; P = score(best) if best else 0
    icons = beaten = False
    if plain and P:
        beat = P - pz["pts"] - pz.get("noIcon", 0) + pz.get("chemEach", 0) * pz["target"] + 1
        # first quick bounds: no chem rules at all, then stand-ins better than any Icon or Hero. If even those can't beat
        # it, no squad with an Icon or Hero can
        print("STEP 2a: any squad with an Icon or Hero, no chem rules", flush=True)
        t, st = solve(DA, pz, False, None, min(300, SECS / 8), need_auto=True, beat=beat, nochem=True)
        print(PID, "with Icons or Heroes, no chem rules, beating", P, ":", st, f"{time.time() - t0:.0f}s", flush=True)
        if st != "INFEASIBLE":
            print("STEP 2b: stand-ins better than any Icon or Hero", flush=True)
            t, st = solve(DAp, pz, False, None, max(60, (SECS - (time.time() - t0)) / 2), need_auto=True, beat=beat,
                          wild=[c for c in DA.pool if c["color"] in AUTO])
            print(PID, "with stand-ins for Icons and Heroes, beating", P, ":", st, f"{time.time() - t0:.0f}s", flush=True)
        if st != "INFEASIBLE":
            print("STEP 2c: every real Icon and Hero", flush=True)
            left = max(60, SECS - (time.time() - t0))
            t, st = solve(DA, pz, False, None, left, need_auto=True, beat=beat)
            if t: teams.append(t); beaten = score(t) > P        # a squad with an Icon or Hero that beats it
            print(PID, "with Icons or Heroes, beating", P, ":", st, f"{time.time() - t0:.0f}s", flush=True)
        icons = st == "INFEASIBLE"
    json.dump({PID: {"teams": teams, "proven": plain and not beaten, "chem": True, **({"icons": True} if icons else {})}}, open(OUT, "w"))
elif __name__ == "__main__" and sys.argv[1] == "prove":
    # one puzzle, a long full search started from its best known squad: proves it's the top score, or finds a better one
    #   python scripts/pz_max.py prove <puzzle id> <seconds> <eligible ids json> <out json>
    PID, SECS, ELIG, OUT = sys.argv[2], float(sys.argv[3]), sys.argv[4], sys.argv[5]
    DA = Data(ELIG)
    pz = next(p for s in DA.P["sets"] for p in s["puzzles"] if p["id"] == PID)
    known = json.load(open(D + "puzzles_max.json"))["puzzles"].get(PID, {})
    t0 = time.time(); team, st = solve(DA, pz, False, known.get("team"), SECS)
    json.dump({PID: {"teams": [t for t in (team, known.get("team")) if t], "proven": st == "OPTIMAL", "chem": True,
                **({"icons": True} if any(c["color"] in AUTO for c in DA.pool) else {})}}, open(OUT, "w"))
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
