"""Objective teams: the series' best team with a SAFE number of cards from the objective's club / nation / league /
position swapped in ("win 7 duels with Lombardia FC cards", "win 3 matches with min. 4 Brazil cards").

Safe = the team loses no more than MAX_DROP of the best team's in-game strength (boosts + chem). These teams are
played against the AI, so the Reddit team isn't the bar: the owner's own Season 2 objective teams lost to the Reddit
team but kept 97-100% of the best team's strength (Lombardia duels 99.5%, Brazil wins 97.3%, Portugal duels 100.2%). Duels: at least 99.5% (just a few
cards when the group is unboosted, a full team when it's boosted). Matches: at least 97%. Objective cards go in one at a time, the strongest valid swap each
time (with a second swap to repair chem when needed), and stop as soon as no swap is safe.
Duels: as many as are safe (can be 0 -> series skipped). Matches: at least `min`, or the series is skipped.
"""
import random, time
from .myclub import Pool, fits, set_icon_limit, stat_strength as secondary
from .game import play

KEY = {"club": "clubId", "nation": "nationId", "league": "leagueId"}
GAP = 2
MAX_DROP = {"duels": 0.005, "matches": 0.03}   # duels: practically no weaker; matches: the cards only need to be in the team


def build_objective(obj, series, owned_cards, base_ids, refs, seconds=60, seed=1, log=print):
    set_icon_limit(series)
    rng = random.Random(seed)
    me = Pool(series, owned_cards)
    by = {c["id"]: c for c in me.cards}
    inGroup = (lambda c: c["position"] == obj["gid"]) if obj["on"] == "position" else (lambda c: c[KEY[obj["on"]]] == obj["gid"])
    G = sorted((c for c in me.cards if inGroup(c)), key=lambda c: -c["T3"])
    base = [by[i] for i in base_ids if i in by]
    while G and 5 <= len(base) < 11:          # a best-team card no longer available: the strongest card that fits
        opts = {c["id"]: c for p in me.pos_top for c in me.pos_top[p]}
        used = {c["pid"] for c in base}
        best = None
        for c in opts.values():
            if c["pid"] in used: continue
            t = base + [c]
            if len(t) == 11 and not fits(t): continue
            v = secondary(me.eff(t)) if len(t) == 11 else c["T3"]
            if best is None or v > best[0]: best = (v, c)
        if best is None: break
        base.append(best[1])
    if len(base) != 11 or not G:
        return {"skip": "no cards" if not G else "no best team", "group_cards": len(G)}
    R = [me.eff(r) for r in refs]
    res = lambda E: [play(E, O, 0)[0] + play(E, O, 1)[0] for O in R]
    E0 = me.eff(base); s0 = secondary(E0); floor = s0 * (1 - MAX_DROP[obj["kind"]])
    # Duels: an objective card only counts if it can win duels at this cap - its best in-game stat within GAP of the
    # best team's typical best stat (outfield: the median; goalkeeper: the best team's goalkeeper). The owner's Season 2
    # teams were within 2 (Lombardia 80s at 82 vs 84, Portugal 69-70s at 73 vs 74); Lombardia 86-87s in the 90 Series
    # (best team ~93) are not.
    best_stat = [max(e[:3]) for e in E0]
    gk = [b for c, b in zip(base, best_stat) if c["position"] == "GK"]
    out = sorted(b for c, b in zip(base, best_stat) if c["position"] != "GK")
    thr_out = out[len(out) // 2] - GAP if out else 0
    thr_gk = (gk[0] if gk else thr_out + GAP) - GAP
    thr = lambda c: thr_gk if c["position"] == "GK" else thr_out
    if obj["kind"] == "duels":
        capable = lambda c: max(c["bA"], c["bC"], c["bD"]) + 2 >= thr(c)     # +2: full chem
        inG = lambda c: inGroup(c) and capable(c)
        G = [c for c in G if capable(c)]
        if not G: return {"skip": "too weak", "group_cards": 0}
    else:
        inG = inGroup
    cnt = lambda t: sum(1 for c in t if inG(c))
    target = 11 if obj["kind"] == "duels" else obj["min"]

    def safe(t):           # -> strength, or None when the team isn't safe
        if not fits(t): return None
        E = me.eff(t); s = secondary(E)
        if s < floor: return None
        return s

    sw = {c["id"]: c for c in G[:40]}
    for p in {q for c in G for q in c["P"]}:
        for c in [c for c in G if p in c["P"]][:3]: sw[c["id"]] = c
    SW = list(sw.values())
    fill = {}
    for x in base + G[:20]:
        for k in ("nationId", "leagueId", "clubId"):
            for c in me.by[k][x[k]][:15]: fill[c["id"]] = c
    for c in me.auto[:30]: fill[c["id"]] = c
    for p in {q for x in base for q in x["P"]}:
        for c in me.pos_top.get(p, []): fill[c["id"]] = c
    FL = list(fill.values())

    cur, cs = base[:], s0
    t0 = time.time()
    while cnt(cur) < target and time.time() - t0 < seconds:
        used = {c["pid"] for c in cur}
        singles = []
        for i in range(11):
            if inG(cur[i]): continue
            for c in SW:
                if c["pid"] in used: continue
                t = cur[:i] + [c] + cur[i + 1:]
                if not fits(t): continue
                singles.append((secondary(me.eff(t)), i, t))
        singles.sort(key=lambda z: -z[0])
        best = None
        for s, i, t in singles:                     # strongest first: the first safe one is the best single swap
            if s < floor: break
            if safe(t) is not None: best = (s, t); break
        if best is None:                            # repair: objective card in + one card that links to it (chem)
            for s, i, t in singles[:6]:
                if time.time() - t0 > seconds: break
                new = t[i]; u2 = {c["pid"] for c in t}
                link = {c["id"]: c for k in ("nationId", "leagueId", "clubId") for c in me.by[k][new[k]][:15]}
                for c in me.auto[:15]: link[c["id"]] = c
                for j in range(11):
                    if j == i or inG(t[j]): continue
                    for c in link.values():
                        if c["pid"] in u2: continue
                        v = safe(t[:j] + [c] + t[j + 1:])
                        if v is not None and (best is None or v > best[0]): best = (v, t[:j] + [c] + t[j + 1:])
                if best: break
        if best is None: break
        cs, cur = best
        log(f"  {cnt(cur)} objective cards, strength {cs:.0f} / {s0:.0f}: {[c['name'] for c in cur]}")
    g = cnt(cur)
    if g == 0 or (obj["kind"] == "matches" and g < obj["min"]):
        return {"skip": "not safe", "group_cards": len(G), "most": g}
    # polish: stronger cards in the other slots, never fewer objective cards, still safe
    end = time.time() + seconds / 3
    while time.time() < end:
        i = rng.randrange(11)
        if inG(cur[i]) and cnt(cur) <= g: continue
        c = rng.choice(FL)
        if any(z["pid"] == c["pid"] for k, z in enumerate(cur) if k != i): continue
        t = cur[:i] + [c] + cur[i + 1:]
        if cnt(t) < g: continue
        v = safe(t)
        if v is not None and v > cs: cs, cur = v, t
    E = me.eff(cur); lab = {1: "WIN", 0: "DRAW", -1: "LOSS"}
    ok = [c["id"] for c, e in zip(cur, E) if inG(c) and (obj["kind"] != "duels" or max(e[:3]) >= thr(c))]   # after real chem
    if not ok: return {"skip": "too weak", "group_cards": len(G)}
    return {"g": len(ok), "team_ids": [c["id"] for c in cur], "obj_ids": ok, "strength": round(cs / s0 * 100, 1), "group_cards": len(G),
            "reddit": [{"you_lead_first": lab[play(E, O, 0)[0]], "they_lead_first": lab[play(E, O, 1)[0]]} for O in R]}
