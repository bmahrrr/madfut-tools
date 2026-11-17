# New Easy puzzle sets: 2 locked cards that link (same league or same nation, different clubs) and must reach full chem,
# with a bonus that doesn't link to them. Building around the locked cards is easy; the bonus and budget points are what
# set scores apart. Each puzzle is checked solvable (and its top score found) with scripts/pz_max.py.
#   python scripts/make_easy.py <eligible ids json> <puzzles in> <puzzles out> <top scores out> [seconds per puzzle]
import json, sys, os, random, collections, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pz_max import Data, top, pos, D

ELIG, PIN, POUT, MOUT = sys.argv[1:5]
SECS = float(sys.argv[5]) if len(sys.argv) > 5 else 30
DA = Data(ELIG, PIN)
names = json.load(open(D + "names.json"))
NAMES = ["Kick Off", "Sunday League", "Pre-Season"]
FORMATIONS = [f for f in ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-2-1-2", "3-4-3", "4-4-1-1", "5-3-2", "4-3-2-1", "3-4-1-2", "4-5-1", "4-2-2-2", "5-2-1-2", "3-1-4-2"] if f in DA.forms]
TIER = dict(locks=2, t0=24, t1=30, pts=100, step=10, each=20, noIcon=50, budget={"par": 85, "each": 6})
rnd = random.Random(20261118)

# locked cards: gold or special players people know (not Icons / Heroes), rated 70 to 86, in leagues with plenty of cards
lockPool = [c for c in DA.pool if 70 <= c["rating"] <= 86]
cnt = lambda k: collections.Counter(c[k] for c in DA.pool)
LG, NA, CL = cnt("leagueId"), cnt("nationId"), cnt("clubId")
bigL = {l for l, n in LG.items() if n >= 150}
bigN = [n for n, k in NA.items() if k >= 150]
lockPool = [c for c in lockPool if c["leagueId"] in bigL]


def pair(link):
    for _ in range(500):
        a = rnd.choice(lockPool)
        L = [c for c in lockPool if c["clubId"] != a["clubId"] and c["name"] != a["name"]
             and (c["leagueId"] == a["leagueId"] and c["nationId"] != a["nationId"] if link == "league" else c["nationId"] == a["nationId"] and c["leagueId"] != a["leagueId"])]
        if L: return a, rnd.choice(L)
    return None


def bonus(locks):
    kind = rnd.choice(["league", "league", "nation", "club"])
    bad = {k: {c[f] for c in locks} for k, f in (("league", "leagueId"), ("nation", "nationId"), ("club", "clubId"))}
    if kind == "league": opts = [l for l in bigL if l not in bad["league"]]
    elif kind == "nation": opts = [n for n in bigN if n not in bad["nation"]]
    else: opts = [k for k, n in CL.items() if n >= 18 and k not in bad["club"] and next(c for c in DA.pool if c["clubId"] == k)["leagueId"] not in bad["league"]]
    bid = rnd.choice(sorted(opts))
    label = names[{"league": "leagues", "nation": "nations", "club": "clubs"}[kind]].get(str(bid), "?")
    return {"on": kind, "id": bid, "each": TIER["each"] * (2 if kind == "club" else 1), "label": label}


P = json.load(open(PIN)); sets, tops = [], {}
for si in range(1, 4):
    S = {"id": f"easy-{si}", "tier": "easy", "name": NAMES[si - 1], "puzzles": []}
    while len(S["puzzles"]) < 15:
        n = len(S["puzzles"]) + 1; f = rnd.choice(FORMATIONS); slots = DA.forms[f]
        pr = pair("league" if n % 2 else "nation")
        if not pr: continue
        spots = []
        for c in pr:
            free = [i for i, s in enumerate(slots) if s in pos(c) and i not in spots]
            if not free: break
            spots.append(rnd.choice(free))
        if len(spots) < 2: continue
        target = round(TIER["t0"] + (TIER["t1"] - TIER["t0"]) * (n - 1) / 14)
        pz = {"id": f"{S['id']}-{n:02d}", "n": n, "formation": f, "target": target, "lockChem": 3,
              "locked": sorted(({"i": i, "id": c["id"]} for i, c in zip(spots, pr)), key=lambda l: l["i"]),
              "bonus": bonus(pr), "noIcon": TIER["noIcon"], "pts": TIER["pts"] + TIER["step"] * (n - 1), "budget": TIER["budget"]}
        t0 = time.time(); r, sa, sb = top(DA, pz, SECS)
        if not r["teams"]: print(pz["id"], "no squad, trying another", sa, sb, flush=True); continue
        S["puzzles"].append(pz); tops[pz["id"]] = r
        print(pz["id"], f, target, pr[0]["name"], "+", pr[1]["name"], "bonus", pz["bonus"]["label"], sa, sb, f"{time.time() - t0:.0f}s", flush=True)
    sets.append(S)
P["sets"] = sets + [s for s in P["sets"] if s["tier"] != "easy"]
json.dump(P, open(POUT, "w")); json.dump(tops, open(MOUT, "w"))
print("wrote", POUT, MOUT)
