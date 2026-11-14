import json, urllib.request, os
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"}
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=60) as r: return r.read()
os.makedirs("out", exist_ok=True)
for name in ["EvoCards.js", "Card.js", "Mappings.js", "Filter.js"]:
    open(f"out/{name}", "wb").write(get(f"https://madfutdata.com/27/js/{name}"))
FS = "https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/%28default%29/documents/evosStandard"
docs, tok = [], ""
while True:
    d = json.loads(get(FS + "?pageSize=300" + ("&pageToken=" + tok if tok else "")))
    docs += d.get("documents", []); tok = d.get("nextPageToken", "")
    if not tok: break
json.dump(docs, open("out/evosStandard.json", "w"))
print("docs", len(docs), [x["name"].split("/")[-1] for x in docs])
