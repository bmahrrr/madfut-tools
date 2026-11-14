import json, sys, os, collections
sys.path.insert(0, "scripts")
import update_data as U, evos as EV
H = {}
src = json.load(open("config/sources.json"))
realm = U.fetch(src["realm_urls"][0]); players = U.players_from(realm)
upd = U.players_from(U.fetch(src["update_urls"][0]))
by = {}
for p in players + upd:
    if "id" in p: by[p["id"]] = p
print("players", len(by), "sample keys", sorted(list(by.values())[0])[:40])
docs, tok = [], ""
while True:
    d = U.fetch(src["firestore_base"] + "/evosStandard?pageSize=300" + ("&pageToken=" + tok if tok else ""))
    docs += d.get("documents", []); tok = d.get("nextPageToken", "")
    if not tok: break
evs = EV.read_evos(docs); print("evos", len(evs), [e["name"] for e in evs])
rows = EV.build(list(by.values()), evs, U.FIELDS)
print("EVOLVED CARDS", len(rows), "unique base", len({r["base"] for r in rows}))
print("by chain length", collections.Counter(len(r["evos"]) for r in rows))
os.makedirs("evodata", exist_ok=True)
EV.save(rows, U.FIELDS, "evodata/evos_all.json")
top = sorted(rows, key=lambda r: -r["rating"])[:8]
for r in top: print(r["rating"], r["name"], r["position"], r["attack"], r["control"], r["defense"], r["evos"], r["specialChem"])
