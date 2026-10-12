import json, collections, sys, urllib.request
sys.path.insert(0, "scripts")
import update_data as U
src = json.load(open("config/sources.json")); fs = src["firestore_base"]
def P(*a): print(*a, flush=True)
def short(x, n=3000): s = json.dumps(x, ensure_ascii=False); return s[:n] + ("…" if len(s) > n else "")
realm = U.fetch(src["realm_urls"][0])
P("REALM top keys:", list(realm.keys()) if isinstance(realm, dict) else type(realm))
if isinstance(realm, dict):
    for k, v in realm.items():
        if k != "players": P("  realm[%s] =" % k, short(v, 1500))
base = U.players_from(realm, "27")
kc = collections.Counter(k for p in base for k in p); P("PLAYER KEYS:", kc.most_common())
sil = [p for p in base if p.get("color") == "rare_silver"]; P("realm silvers:", len(sil))
for k, n in kc.items():
    if n < len(base):
        vals = collections.Counter(str(p.get(k)) for p in sil if k in p)
        if vals: P(" silver key", k, "present in", sum(vals.values()), "top values", vals.most_common(8))
for key in ("rarity", "rareflag", "type", "hidden", "untradeable", "packable", "version", "source"):
    pass
upd = U.players_from(U.fetch(src["update_urls"][0]), "27")
bid = {p["id"] for p in base}
us = [p for p in upd if p.get("color") == "rare_silver"]
P("update silvers:", len(us), "new (not in realm):", [(p["id"], p.get("name"), p.get("rating")) for p in us if p["id"] not in bid])
P("update silvers overriding realm:", [(p["id"], p.get("name"), p.get("rating")) for p in us if p["id"] in bid][:50])
# silvers whose name+rating appear twice, or same name+club twice
k2 = collections.Counter((p.get("name"), p.get("clubId")) for p in sil + [p for p in us if p["id"] not in bid])
P("silver same name+club twice:", [(k, n) for k, n in k2.items() if n > 1][:40])
cols = collections.Counter(p.get("color") for p in base + upd); P("ALL COLORS:", cols.most_common())
for kind in ["evosElite", "evos", "ltm", "ltms", "evolutions", "eliteEvos", "limitedTime", "objectives", "draftCups", "sbcGroups"]:
    try:
        d = U.fetch(f"{fs}/{kind}?pageSize=300")
        docs = d.get("documents", [])
        P(f"COLLECTION {kind}: {len(docs)} docs", [x["name"].split("/")[-1] for x in docs][:60])
        for x in docs:
            nm = x["name"].split("/")[-1]
            if nm.startswith("27"):
                P(f"  {kind}/{nm}:", short({k: U.conv(v) for k, v in x.get("fields", {}).items()}, 2500))
    except Exception as e:
        P(f"COLLECTION {kind}: failed", e)
try:
    req = urllib.request.Request(f"{fs}:listCollectionIds", data=b"{}", headers={"Content-Type": "application/json"})
    P("COLLECTION IDS:", urllib.request.urlopen(req, timeout=30).read().decode()[:3000])
except Exception as e:
    P("listCollectionIds failed", e)
for u in ["https://madfutdata.com/27/json/evos.json", "https://madfutdata.com/27/json/evo27.json", "https://madfutdata.com/27/json/ltm.json", "https://madfutdata.com/27/json/evosElite.json", "https://madfutdata.com/27/json/"]:
    try:
        d = U.fetch(u); P("URL ok", u, short(d, 2000))
    except Exception as e:
        P("URL fail", u, e)
