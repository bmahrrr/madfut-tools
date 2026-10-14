"""Shared MadFut 27 logic: card loading, positions, chemistry, boosts and effective stats.

Chemistry rules (as used in SBCs and both Fatal modes):
  * league 3/5/8 players -> +1/+2/+3, nation 2/5/8 -> +1/+2/+3, club 2/4/7 -> +1/+2/+3, max 3 per card
  * Icons / Debut Icons, Heroes and Hall of FUT are always on full chem
  * Icons count towards their nation and add +1 to EVERY league count
  * Heroes / Hall of FUT count towards their nation and their league
  * Squad Foundations (specialChem "league2") count +2 towards their league
  * Women's and men's teams of the same club share club chem but are different leagues
  * Chem changes every stat: 0 chem -3, 1 chem +0, 2 chem +1, 3 chem +2
"""
import collections, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUTO = {"icon", "debut_icon", "hero", "hall_of_fut"}
ICON = {"icon", "debut_icon"}
CHEM_BONUS = {0: -3, 1: 0, 2: 1, 3: 2}
FORMATIONS = json.load(open(os.path.join(ROOT, "fatal", "formations.json")))
SIM_FORMATIONS = ["3-1-4-2", "3-4-1-2", "3-5-2", "5-2-1-2", "5-3-2", "5-4-1"]
CTRL = {"LM", "LW", "RM", "RW", "CAM", "CM", "CDM", "LB", "RB"}
ATT = {"ST", "CAM", "LW", "LM", "RW", "RM", "CF"}
DEF = {"LB", "RB", "CDM", "CB", "GK"}


def build_week():
    """The week being built (config/week.json, or WEEK_FILE for a vault week)."""
    try:
        return json.load(open(os.path.join(ROOT, os.environ.get("WEEK_FILE") or os.path.join("config", "week.json")))).get("week") or ""
    except Exception:
        return ""


def season_ids(week):
    """Game cards that existed in that season (data/seasons/<week>.json, saved when the season ends), or None
    for the current season (every card)."""
    f = os.path.join(ROOT, "data", "seasons", f"{week}.json")
    return set(json.load(open(f))["ids"]) if week and os.path.exists(f) else None


def load_cards(owned_only=False):
    """Return a list of card dicts (database + config/extras.json), as available in the week being built:
    a past season only gets the game cards that existed then; hand-added cards with "from_week" (regular Evos)
    only from that week on. Every other hand-added card (LTM, Elite Evo, ...) counts in every season."""
    raw = json.load(open(os.path.join(ROOT, "data", "cards.json")))
    F = raw["fields"]
    cards = [dict(zip(F, row)) for row in raw["cards"]]
    wk = build_week()
    keep = season_ids(wk)
    if keep is not None:
        cards = [c for c in cards if c["id"] in keep]
    for c in cards:
        c["owned"] = True
    ex = json.load(open(os.path.join(ROOT, "config", "extras.json")))["cards"]
    for e in ex:
        if e.get("from_week") and wk and e["from_week"] > wk:
            continue
        e = dict(e)
        e.setdefault("specialChem", "")
        e.setdefault("altPositions", "")
        cards.append(e)
    if owned_only:
        cards = [c for c in cards if c.get("owned", True)]
    for c in cards:
        c["P"] = frozenset([c["position"]] + [p for p in str(c.get("altPositions") or "").split(",") if p])
    return cards


_BASE = {}


def pid(c):
    """Same real player -> same id (you can't field two versions of one player)."""
    if not _BASE:
        for x in load_cards():
            if isinstance(x.get("baseId"), int) and x["baseId"] > 0:
                _BASE.setdefault((x["name"], x["nationId"]), x["baseId"])
    b = c.get("baseId")
    if isinstance(b, int) and b > 0:
        return b
    return _BASE.get((c["name"], c["nationId"]), c["name"])


def card_type(c):
    return str(c["color"]).replace("rare_", "")


def solo(x):
    """Always on full chem but adds nothing to anyone else's chem (e.g. Evo Jones)."""
    return x.get("specialChem") == "solo"


def full_chem(x):
    return x["color"] in AUTO or solo(x)


def chem(team):
    """Chemistry (0-3) for each card of an 11-card team."""
    nat = collections.Counter(x["nationId"] for x in team if not solo(x))
    club = collections.Counter(x["clubId"] for x in team if not full_chem(x))
    lg = collections.Counter()
    icons = sum(1 for x in team if x["color"] in ICON)
    for x in team:
        if x["color"] in ICON or solo(x):
            continue
        lg[x["leagueId"]] += 2 if x.get("specialChem") == "league2" else 1
    out = []
    for x in team:
        if full_chem(x):
            out.append(3); continue
        n, l, k = nat[x["nationId"]], lg[x["leagueId"]] + icons, club[x["clubId"]]
        pts = (3 if n >= 8 else 2 if n >= 5 else 1 if n >= 2 else 0) + \
              (3 if l >= 8 else 2 if l >= 5 else 1 if l >= 3 else 0) + \
              (3 if k >= 7 else 2 if k >= 4 else 1 if k >= 2 else 0)
        out.append(min(3, pts))
    return out


KEYMAP = {"nation": "nationId", "league": "leagueId", "club": "clubId", "color": "color", "type": "color"}


def boosted(c, boosts):
    """Card stats after the series boosts (no chem). boosts: list of dicts
    {"on": "nation"|"league"|"club"|"color", "id": <id or colour>, "att": n, "ctl": n, "def": n}"""
    a, k, d = c["attack"], c["control"], c["defense"]
    for b in boosts:
        key = KEYMAP[b["on"]]
        val = c.get(key)
        if key == "color":
            match = str(val).replace("rare_", "") == str(b["id"]).replace("rare_", "")
        else:
            match = val == b["id"]
        if match:
            a += b.get("att", 0); k += b.get("ctl", 0); d += b.get("def", 0)
    return a, k, d


def squad_bonus(team, bonuses):
    """Squad-wide bonuses, e.g. {"kind": "nations", "min": 8, "att": 2} or kind clubs/leagues/types."""
    out = [0, 0, 0]
    for b in bonuses or []:
        if b["kind"] == "nations": n = len({x["nationId"] for x in team})
        elif b["kind"] == "clubs": n = len({x["clubId"] for x in team})
        elif b["kind"] == "leagues": n = len({x["leagueId"] for x in team})
        elif b["kind"] == "types": n = len({card_type(x) for x in team})
        else: continue
        if n >= b["min"]:
            out[0] += b.get("att", 0); out[1] += b.get("ctl", 0); out[2] += b.get("def", 0)
    return out


def effective(team, series, force_full_chem=False):
    """In-game (attack, control, defence, tiebreak_total) for each card.
    Tiebreak total = printed card total + chem bonus on each stat (no boosts)."""
    ch = [3] * len(team) if force_full_chem else chem(team)
    sb = squad_bonus(team, series.get("bonuses"))
    out = []
    for x, c in zip(team, ch):
        a, k, d = boosted(x, series.get("boosts", []))
        b = CHEM_BONUS[c]
        tot = x["attack"] + x["control"] + x["defense"] + 3 * b
        out.append((a + b + sb[0], k + b + sb[1], d + b + sb[2], tot))
    return out, ch


def formation_fit(team, formations=None):
    """Return (formation_name, [(slot, card_index)]) if the 11 cards fit a formation, else None."""
    formations = formations or list(FORMATIONS)
    P = [x["P"] for x in team]
    for name in formations:
        slots = FORMATIONS.get(name)
        if not slots:
            continue
        match = [-1] * 11

        def tr(i, seen):
            for j, s in enumerate(slots):
                if s in P[i] and not seen[j]:
                    seen[j] = True
                    if match[j] < 0 or tr(match[j], seen):
                        match[j] = i
                        return True
            return False
        if all(tr(i, [False] * 11) for i in range(11)):
            return name, [(slots[j], match[j]) for j in range(11)]
    return None


def team_rating(ratings):
    """EA squad rating formula."""
    tot = sum(ratings)
    avg = tot / len(ratings)
    excess = sum(r - avg for r in ratings if r > avg)
    return int((tot + excess) / len(ratings) + 1e-9)


def describe(team, series=None, force_full_chem=False):
    series = series or {"boosts": []}
    E, ch = effective(team, series, force_full_chem)
    fit = formation_fit(team)
    rows = []
    order = fit[1] if fit else [("?", i) for i in range(11)]
    for slot, i in order:
        x = team[i]
        rows.append({"slot": slot, "id": x["id"], "name": x["name"], "rating": x["rating"], "color": x["color"],
                     "position": x["position"], "nationId": x["nationId"], "leagueId": x["leagueId"], "clubId": x["clubId"],
                     "card": [x["attack"], x["control"], x["defense"]], "chem": ch[i],
                     "eff": list(E[i][:3]), "tiebreak": E[i][3]})
    return {"formation": fit[0] if fit else None, "chem": sum(ch), "players": rows}
