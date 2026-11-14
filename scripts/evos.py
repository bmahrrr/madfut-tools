"""Every possible standard Evo card of the game year, the way madfutdata's Evo Chains page builds them.

Rules (from the game data, collection "evosStandard", documents named 27_<n>):
- an Evo has requirements ("nation,21", "rating,70-82", "position,defenders", "color,rare_silver", "PAS,75-99" ...) and
  three upgrade steps "overall,attack,control,defence"; a finished Evo adds all three steps
- an evolved card can do another Evo (a chain) if it still meets that Evo's requirements (while chaining it counts as an
  "evo" card, like on madfutdata); the finished card keeps its own card type and chem rules (an evolved Icon is an Icon)
- some Evos are marked fullChem: the evolved card is always on full chem but adds nothing to anyone else's chem (like Jerdea)
- in a team each Evo can be on one card only (finishing it again on another card deletes the first), so every card
  lists the Evos it used ("evos")
"""
import json

POS_GROUPS = {"DEFENDERS": {"LB", "CB", "RB"}, "MIDFIELDERS": {"CDM", "CM", "CAM", "LM", "RM"}, "ATTACKERS": {"LW", "ST", "RW"}}
for _k in list(POS_GROUPS):
    POS_GROUPS[_k[:-1]] = POS_GROUPS[_k]
NOT_ELIGIBLE = {"best_xi", "best_xi_nominee", "historic_xi_nominee", "historic_xi", "ltm", "madfut_icon", "evo", "evo_elite",
                "elite_evo"}
FACE = ("PAC", "SHO", "PAS", "DRI", "DEF", "PHY")


def read_evos(docs, prefix="27"):
    """The game year's Evos (unique by name, first seen kept, like madfutdata) from a Firestore listing."""
    from update_data import conv
    seen = {}
    for doc in docs or []:
        if not doc.get("name", "").split("/")[-1].startswith(prefix + "_"):
            continue
        for e in conv(doc.get("fields", {}).get("evos")) or []:
            if isinstance(e, dict) and e.get("name") and e["name"] not in seen:
                seen[e["name"]] = {"name": e["name"], "req": list(e.get("standardRequirements") or []),
                                   "up": list(e.get("standardUpgrades") or []), "full": bool(e.get("fullChem"))}
    return list(seen.values())


def meets(req, c):
    t, _, val = req.partition(",")
    lo = hi = 0
    if "-" in val:
        lo, hi = (int(x) for x in val.split("-"))
    rng = lambda v: v is not None and lo <= int(v) <= hi
    pos = str(c.get("position") or "").upper()
    if t == "nation": return str(c.get("nationId")) == val
    if t == "league": return str(c.get("leagueId")) == val
    if t == "club": return str(c.get("clubId")) == val
    if t == "color":
        col, r = str(c.get("color") or "").lower(), val.lower()
        alias = {"all_silver": {"silver", "rare_silver"}, "all_gold": {"gold", "rare_gold"}, "all_bronze": {"bronze", "rare_bronze"}}
        if r == "all_special":
            return col not in {"gold", "rare_gold", "silver", "rare_silver", "bronze", "rare_bronze"}
        return col in alias[r] if r in alias else col == r
    if t == "position":
        w = val.upper()
        return pos in POS_GROUPS[w] if w in POS_GROUPS else pos == w
    if t in ("defenders", "midfielders", "attackers"): return pos in POS_GROUPS[t.upper()]
    if t == "rating": return rng(c.get("rating"))
    if t == "attack": return rng(c.get("attack"))
    if t == "control": return rng(c.get("control"))
    if t == "defense": return rng(c.get("defense"))
    if t in FACE: return pos != "GK" and rng(c.get(t))
    return True


def apply(c, evo):
    c = dict(c)
    for u in evo["up"]:
        p = [int(x or 0) for x in str(u).split(",")] + [0, 0, 0, 0]
        o, a, k, d = p[:4]
        c["rating"] = min(99, int(c.get("rating") or 0) + o)
        for f in FACE:
            if c.get(f) is not None:
                c[f] = min(99, int(c[f]) + o)
        c["attack"] = min(99, int(c.get("attack") or 0) + a)
        c["control"] = min(99, int(c.get("control") or 0) + k)
        c["defense"] = min(99, int(c.get("defense") or 0) + d)
    c["color"] = "evo"
    return c


def chains(card, evos):
    """Every chain of Evos this card can complete (each Evo once), with the finished card."""
    out = []

    def dfs(cur, used):
        if used:
            out.append((cur, used))
        for e in evos:
            if e["name"] in used:
                continue
            if all(meets(r, cur) for r in e["req"]):
                dfs(apply(cur, e), used + [e["name"]])
    dfs(card, [])
    return out


def build(players, evos, fields):
    """Evolved cards for every eligible player, as rows of `fields` plus "evos" (the chain) and "base" (the card id)."""
    full = {e["name"] for e in evos if e["full"]}
    rows, n = [], 0
    for p in players:
        if str(p.get("color") or "").lower() in NOT_ELIGIBLE or p.get("rating") is None or p.get("attack") is None:
            continue
        for fin, used in chains(p, evos):
            c = dict(fin)
            c["color"] = p.get("color")     # an evolved card keeps its card type and chem rules (an evolved Icon is still an Icon)
            c["id"] = "evx_" + str(p["id"]) + "_" + "_".join(str(evos.index(next(e for e in evos if e["name"] == u))) for u in used)
            c["specialChem"] = "solo" if any(u in full for u in used) else (p.get("specialChem") or "")
            c["evos"] = used
            c["base"] = p["id"]
            rows.append(c)
            n += 1
    return rows


def save(rows, fields, path):
    keep = fields + ["evos", "base"]
    data = {"fields": keep, "count": len(rows), "cards": [[r.get(k, "" if k in ("altPositions", "specialChem") else None) for k in keep]
                                                          for r in sorted(rows, key=lambda r: (-r["rating"], r["name"]))]}
    json.dump(data, open(path, "w"), separators=(",", ":"), ensure_ascii=False)
    return data
