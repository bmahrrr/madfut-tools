import json, urllib.request, re
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r: return r.read()
FS = "https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/%28default%29/documents"
d = json.loads(get(FS + "/evosStandard?pageSize=300"))
docs = d.get("documents", []); print("evosStandard docs", len(docs))
def plain(v):
    if "mapValue" in v: return {k: plain(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v: return [plain(x) for x in v["arrayValue"].get("values", [])]
    for k in ("stringValue", "integerValue", "doubleValue", "booleanValue"):
        if k in v: return int(v[k]) if k == "integerValue" else v[k]
    return None
allevos = []
for doc in docs:
    f = {k: plain(v) for k, v in doc["fields"].items()}
    for e in f.get("evos", []): allevos.append(e)
print("evos total", len(allevos))
for e in allevos[:3]:
    print(json.dumps({k: v for k, v in e.items() if k not in ("players",)})[:2500])
print("ALL NAMES:", [e.get("name") for e in allevos][:120])
js = get("https://madfutdata.com/27/js/EvoCards.js").decode("utf8", "replace")
for m in re.finditer(r"standard(Requirements|Upgrades)|chain|minmax|attribute", js):
    pass
i = js.find("standardRequirements"); print("JS around standardRequirements:\n", js[max(0, i - 1500): i + 3500])
