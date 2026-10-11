"""SBC solver: cheapest squad that meets a set of requirements.

Requirement keys (all optional):
  formation          e.g. "4-3-3"  (or a list; default: try common formations)
  min_chem           total squad chem
  min_player_chem    chem for every player
  min_rating         squad rating (EA formula)
  rules              list of {"on": "nation"|"league"|"club"|"color"|"rarity", "id": .., "op": ">=", "n": 1}
                     rarity ids: "gold", "silver", "bronze"
  min_nations / max_nations / min_leagues / max_leagues / min_clubs / max_clubs
  max_same_nation / max_same_league / max_same_club
  min_types          number of different card types (gold, silver, bronze, each special counts once)
  allow_specials     false = only bronze/silver/gold (default false)
  allow_icons        false = no icons/heroes (default false)
  exclude / include  lists of player names
  priority           "gold_first" (default) | "lowest_rating"
"""
from .core import FORMATIONS, AUTO, card_type, team_rating, chem, describe
from .milp import build

COMMON_FORMS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-2-1-2", "3-4-3", "4-4-1-1", "5-3-2", "4-3-2-1", "3-4-1-2"]


def rarity(c):
    t = card_type(c)
    return t if t in ("gold", "silver", "bronze") else "special"


def cost(c, priority):
    r = rarity(c)
    if priority == "lowest_rating":
        base = {"bronze": 0, "silver": 0, "gold": 0, "special": 300}[r]
        return base + c["rating"] * 10
    # user's stated order: lowest-rated golds first, cheap specials (TOTW) if needed, then silvers, bronze last
    base = {"gold": 0, "special": 400, "silver": 600, "bronze": 900}[r]
    if c["color"] in AUTO: base = 2000
    return base + c["rating"] * 10


def _match(c, rule):
    on, v = rule["on"], rule["id"]
    if on == "nation": return c["nationId"] == v
    if on == "league": return c["leagueId"] == v
    if on == "club": return c["clubId"] == v
    if on == "color": return card_type(c) == str(v).replace("rare_", "")
    if on == "rarity": return rarity(c) == v
    return False


def solve_sbc(req, cards, log=print, time_limit=90):
    allow_sp = req.get("allow_specials", False)
    allow_icons = req.get("allow_icons", False)
    excl = {n.lower() for n in req.get("exclude", [])}
    incl = {n.lower() for n in req.get("include", [])}
    pr = req.get("priority", "gold_first")
    rules = req.get("rules", [])
    pool = []
    for c in cards:
        if c["name"].lower() in excl: continue
        if c["color"] in AUTO and not allow_icons and c["name"].lower() not in incl: continue
        if rarity(c) == "special" and c["color"] not in AUTO and not allow_sp and c["name"].lower() not in incl:
            if not any(r["on"] == "color" and _match(c, r) for r in rules): continue
        pool.append(c)
    tr = req.get("min_rating")
    lo = (tr - 8) if tr else 0
    forms = req.get("formation") or COMMON_FORMS
    if isinstance(forms, str): forms = [forms]
    # candidate selection: cheapest per position, plus cards that satisfy rules, plus chem clusters
    chosen = {}
    pos = {p for f in forms for p in FORMATIONS[f]}
    for p in pos:
        el = sorted([x for x in pool if p in x["P"] and x["rating"] >= lo], key=lambda x: cost(x, pr))
        for x in el[:60]: chosen[x["id"]] = x
        for r in rules:
            for x in [y for y in el if _match(y, r)][:25]: chosen[x["id"]] = x
        if tr:
            for x in sorted([y for y in el if y["rating"] >= tr], key=lambda x: cost(x, pr))[:30]: chosen[x["id"]] = x
    # chem clusters: for the most common leagues / nations among cheap candidates, add more depth
    from collections import Counter
    cheap = sorted(chosen.values(), key=lambda x: cost(x, pr))[:300]
    for key in ("leagueId", "nationId"):
        for g, _ in Counter(x[key] for x in cheap).most_common(6):
            for p in pos:
                el = sorted([x for x in pool if p in x["P"] and x[key] == g and x["rating"] >= lo], key=lambda x: cost(x, pr))
                for x in el[:8]: chosen[x["id"]] = x
    for x in pool:
        if x["name"].lower() in incl: chosen[x["id"]] = x
    cands = []
    for i, c in enumerate(chosen.values()):
        c = dict(c); c["_i"] = i; cands.append(c)
    log(f"  {len(cands)} candidate cards")
    group_rules = [((lambda c, r=r: _match(c, r)), r.get("op", ">="), r["n"]) for r in rules]
    for n in incl:
        group_rules.append(((lambda c, n=n: c["name"].lower() == n), ">=", 1))
    distinct = {}
    for k in ("nation", "league", "club"):
        a, b = req.get(f"min_{k}s"), req.get(f"max_{k}s")
        if a or b: distinct[k] = (a, b)
    max_same = {k: req[f"max_same_{k}"] for k in ("nation", "league", "club") if req.get(f"max_same_{k}")}
    best = None
    for form in forms:
        rsum = 11 * tr - 10 if tr else None
        for attempt in range(6):
            sq = build(cands, FORMATIONS[form], lambda c, s: cost(c, pr), minimize=True,
                       min_total_chem=req.get("min_chem"), min_player_chem=req.get("min_player_chem"),
                       min_types=req.get("min_types", 0), group_rules=group_rules, min_rating_sum=rsum,
                       distinct=distinct, max_same=max_same, time_limit=time_limit)
            if not sq: break
            if tr and team_rating([x["rating"] for x in sq]) < tr:
                rsum = sum(x["rating"] for x in sq) + 1
                continue
            c = sum(cost(x, pr) for x in sq)
            log(f"  {form}: cost score {c}, rating {team_rating([x['rating'] for x in sq])}, chem {sum(chem(sq))}")
            if best is None or c < best[0]: best = (c, form, sq)
            break
    if not best:
        return None
    _, form, sq = best
    out = describe(sq)
    out["formation"] = form
    out["players"] = [dict(p, slot=s) for p, s in zip(
        [{"name": x["name"], "rating": x["rating"], "color": x["color"], "position": x["position"],
          "nationId": x["nationId"], "leagueId": x["leagueId"], "clubId": x["clubId"], "chem": c}
         for x, c in zip(sq, chem(sq))], FORMATIONS[form])]
    out["rating"] = team_rating([x["rating"] for x in sq])
    return out
