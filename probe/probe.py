import json, urllib.request
H = {"User-Agent": "Mozilla/5.0 (madfut-tools updater)"}
def get(u, n=600):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=40) as r: b = r.read()
        return r.status, b
    except Exception as e: return str(e)[:80], b""
FS = "https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/%28default%29/documents"
for c in ["evos", "evolutions", "evo", "evosElite", "evoChains", "evolution", "evosNormal", "evosChains", "chains", "upgrades"]:
    st, b = get(f"{FS}/{c}?pageSize=2")
    print("FS", c, st, len(b))
    if b and b"documents" in b:
        d = json.loads(b); doc = d["documents"][0]
        print("   fields:", list(doc.get("fields", {}))[:30]); print("   sample:", json.dumps(doc)[:1500])
# list root collections
try:
    req = urllib.request.Request(FS + ":listCollectionIds", data=b'{"pageSize":200}', headers=dict(H, **{"Content-Type": "application/json"}), method="POST")
    with urllib.request.urlopen(req, timeout=40) as r: print("COLLECTIONS", r.read()[:3000])
except Exception as e: print("listCollectionIds failed", e)
for u in ["https://madfutdata.com/27", "https://madfutdata.com/27/Evos", "https://madfutdata.com/27/Evolutions", "https://madfutdata.com/27/json/evos27.json", "https://madfutdata.com/27/json/evolutions27.json"]:
    st, b = get(u); print("WEB", u, st, len(b))
    if b and u.endswith("/27"):
        import re; print("   links:", sorted(set(re.findall(rb'href="(/27/[^"]+)"', b)))[:60])
st, b = get("https://madfutdata.com/27/json/realm27.json")
if b:
    d = json.loads(b); print("REALM top keys:", list(d)[:40] if isinstance(d, dict) else type(d))
    if isinstance(d, dict):
        for k, v in d.items():
            if "evo" in k.lower(): print("  realm evo key", k, json.dumps(v)[:1500])
