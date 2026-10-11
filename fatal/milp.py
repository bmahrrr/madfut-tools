"""General squad-building mixed-integer program (used by the Sim builder, SBC solver and My Club seeds).

The model picks one card per formation slot, tracks league / nation / club counts and gives
each card a chem value h in [0, 3] that can only be as high as the chem thresholds reached.
"""
import collections
import pulp
from .core import AUTO, ICON, card_type, pid

THRESH = {"n": (2, 5, 8), "l": (3, 5, 8), "k": (2, 4, 7)}


def build(cards, slots, value, chem_weight=None, force_full=None, minimize=False,
          min_nations=0, min_types=0, distinct_clubs=False, group_rules=(), min_total_chem=None,
          min_player_chem=None, min_rating_sum=None, time_limit=120, exclude_pids=(),
          distinct=None, max_same=None):
    """cards: candidate cards; slots: list of 11 positions.
    value(card, slot) -> objective coefficient (or None if not allowed).
    chem_weight(card, slot) -> objective coefficient per chem point.
    force_full(card, slot) -> True if this card must be on full chem in this slot.
    group_rules: list of (kind, key, value, op, n) e.g. ("nation", "nationId", 54, ">=", 2)
                 kind "any" with key=None counts all cards matching a predicate function in value.
    Returns list of 11 cards (slot order) or None."""
    cand = {}
    for k, s in enumerate(slots):
        L = []
        for c in cards:
            if s in c["P"] and c.get("_i") is not None:
                v = value(c, s)
                if v is not None:
                    L.append((c["_i"], v))
        cand[k] = L
    byi = {c["_i"]: c for c in cards if c.get("_i") is not None}
    used = {i for L in cand.values() for i, _ in L}
    prob = pulp.LpProblem("squad", pulp.LpMinimize if minimize else pulp.LpMaximize)
    X = {}
    for k, L in cand.items():
        for i, v in L:
            X[(i, k)] = pulp.LpVariable(f"x_{i}_{k}", cat="Binary")
    for k in cand:
        if not cand[k]:
            return None
        prob += pulp.lpSum(X[(i, k)] for i, _ in cand[k]) == 1
    Y = {i: pulp.lpSum(X[(i, k)] for k in cand if (i, k) in X) for i in used}
    bp = collections.defaultdict(list)
    for i in used:
        bp[pid(byi[i])].append(i)
    for p, ids in bp.items():
        if p in exclude_pids:
            for i in ids: prob += Y[i] == 0
        else:
            prob += pulp.lpSum(Y[i] for i in ids) <= 1   # each player at most once
    cnt = {"n": collections.defaultdict(list), "l": collections.defaultdict(list), "k": collections.defaultdict(list)}
    icons = [i for i in used if byi[i]["color"] in ICON]
    for i in used:
        x = byi[i]
        cnt["n"][x["nationId"]].append((i, 1))
        if x["color"] not in ICON:
            cnt["l"][x["leagueId"]].append((i, 2 if x.get("specialChem") == "league2" else 1))
        if x["color"] not in AUTO:
            cnt["k"][x["clubId"]].append((i, 1))
    Z = {}
    need_chem = chem_weight is not None or force_full is not None or min_total_chem or min_player_chem
    if need_chem:
        for tag, groups in cnt.items():
            for g, mem in groups.items():
                tot = pulp.lpSum(w * Y[i] for i, w in mem)
                if tag == "l":
                    tot = tot + pulp.lpSum(Y[i] for i in icons)
                for t in THRESH[tag]:
                    z = pulp.LpVariable(f"z_{tag}_{len(Z)}_{t}", cat="Binary")
                    Z[(tag, g, t)] = z
                    prob += t * z <= tot
    obj = []
    H = {}
    if need_chem:
        for i in used:
            x = byi[i]
            h = pulp.LpVariable(f"h_{i}", 0, 3)
            H[i] = h
            if x["color"] in AUTO:
                prob += h <= 3 * Y[i]
            else:
                pts = pulp.lpSum(Z[("n", x["nationId"], t)] for t in THRESH["n"])
                pts += pulp.lpSum(Z[("l", x["leagueId"], t)] for t in THRESH["l"]) if x["color"] not in ICON else 0
                pts += pulp.lpSum(Z[("k", x["clubId"], t)] for t in THRESH["k"])
                prob += h <= pts
                prob += h <= 3 * Y[i]
            for k, s in enumerate(slots):
                if (i, k) not in X: continue
                if force_full and force_full(x, s):
                    prob += h >= 3 * X[(i, k)]
                if min_player_chem:
                    prob += h >= min_player_chem * X[(i, k)]
                if chem_weight:
                    w = chem_weight(x, s)
                    if w:
                        hs = pulp.LpVariable(f"hs_{i}_{k}", 0, 3)
                        prob += hs <= h; prob += hs <= 3 * X[(i, k)]
                        obj.append(w * hs)
        if min_total_chem:
            prob += pulp.lpSum(H.values()) >= min_total_chem
    for (i, k), var in X.items():
        v = dict(cand[k])[i]
        obj.append(v * var)
    if min_nations:
        U = []
        for g, mem in cnt["n"].items():
            u = pulp.LpVariable(f"u_{len(U)}", cat="Binary"); prob += u <= pulp.lpSum(Y[i] for i, _ in mem); U.append(u)
        prob += pulp.lpSum(U) >= min_nations
    if min_types:
        T = collections.defaultdict(list)
        for i in used: T[card_type(byi[i])].append(i)
        V = []
        for g, mem in T.items():
            v = pulp.LpVariable(f"v_{len(V)}", cat="Binary"); prob += v <= pulp.lpSum(Y[i] for i in mem); V.append(v)
        prob += pulp.lpSum(V) >= min_types
    if distinct_clubs:
        C = collections.defaultdict(list)
        for i in used: C[byi[i]["clubId"]].append(i)
        for g, mem in C.items(): prob += pulp.lpSum(Y[i] for i in mem) <= 1
    for (pred, op, n) in group_rules:
        expr = pulp.lpSum(Y[i] for i in used if pred(byi[i]))
        if op == ">=": prob += expr >= n
        elif op == "<=": prob += expr <= n
        else: prob += expr == n
    keymap = {"nation": "nationId", "league": "leagueId", "club": "clubId"}
    for kind, (lo, hi) in (distinct or {}).items():
        G = collections.defaultdict(list)
        for i in used: G[byi[i][keymap[kind]]].append(i)
        U2 = []
        for g, mem in G.items():
            u = pulp.LpVariable(f"d_{kind}_{len(U2)}", cat="Binary")
            prob += u <= pulp.lpSum(Y[i] for i in mem)
            for i in mem: prob += u >= Y[i]
            U2.append(u)
        if lo: prob += pulp.lpSum(U2) >= lo
        if hi: prob += pulp.lpSum(U2) <= hi
    for kind, n in (max_same or {}).items():
        G = collections.defaultdict(list)
        for i in used: G[byi[i][keymap[kind]]].append(i)
        for g, mem in G.items(): prob += pulp.lpSum(Y[i] for i in mem) <= n
    if min_rating_sum:
        prob += pulp.lpSum(byi[i]["rating"] * Y[i] for i in used) >= min_rating_sum
    prob += pulp.lpSum(obj)
    prob.solve(pulp.HiGHS(msg=False, timeLimit=time_limit, gapRel=0, gapAbs=0.5))
    if pulp.LpStatus[prob.status] not in ("Optimal",) and not any((v.value() or 0) > 0.5 for v in X.values()):
        return None
    sq = [None] * 11
    for (i, k), v in X.items():
        if v.value() is not None and v.value() > 0.5:
            sq[k] = byi[i]
    return None if None in sq else sq
