import json, collections, sys
sys.path.insert(0, "scripts")
import update_data as U
src = json.load(open("config/sources.json")); fs = src["firestore_base"]
def P(*a): print(*a, flush=True)
def short(x, n=3000): s = json.dumps(x, ensure_ascii=False); return s[:n] + ("…" if len(s) > n else "")
base = U.players_from(U.fetch(src["realm_urls"][0]), "27")
sil = [p for p in base if p.get("color") == "rare_silver"]
for k in ("tradable", "packable", "inPicks", "inTokens", "man", "totwNumber", "url"):
    vals = collections.Counter(str(p.get(k))[:40] for p in sil)
    P("silver", k, vals.most_common(6), "rare:", [(v, n) for v, n in vals.items() if n <= 5][:10])
    rare = [v for v, n in vals.items() if n <= 5]
    for p in sil:
        if str(p.get(k))[:40] in rare and k != "url":
            P("   ", k, {x: p.get(x) for x in ("id", "name", "rating", "clubId", "leagueId", "date", "tradable", "packable", "inPicks", "inTokens", "man", "baseId", "itemId")})
dates = collections.Counter(p.get("date") for p in sil); P("silver dates top", dates.most_common(5), "max", max(dates))
P("silvers by newest date:", [(p["id"], p["name"], p["rating"], p.get("date")) for p in sorted(sil, key=lambda p: -(p.get("date") or 0))[:12]])
# same for other colors: packable/tradable split
for col in ("rare_gold", "rare_bronze"):
    L = [p for p in base if p.get("color") == col]
    P(col, len(L), {k: collections.Counter(str(p.get(k)) for p in L).most_common(4) for k in ("tradable", "packable", "inPicks", "inTokens")})
d = U.fetch(f"{fs}/evosElite?pageSize=300")
for x in d.get("documents", []):
    P("evosElite", x["name"].split("/")[-1], x.get("createTime"), short({k: U.conv(v) for k, v in x.get("fields", {}).items()}, 1800))
o = U.fetch(f"{fs}/objectives?pageSize=300")
for x in o.get("documents", []):
    f = {k: U.conv(v) for k, v in x.get("fields", {}).items()}
    s = json.dumps(f)
    if "ltm" in s.lower():
        P("objective with ltm", x["name"].split("/")[-1], x.get("createTime"), short(f, 1500))
