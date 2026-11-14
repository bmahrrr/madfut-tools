import json, urllib.request, re
H = {"User-Agent": "Mozilla/5.0 (madfut-tools updater)"}
with urllib.request.urlopen(urllib.request.Request("https://madfutdata.com/27/json/realm27.json", headers=H), timeout=60) as r: d = json.loads(r.read())
f = d["fields"]; print("REALM field keys:", list(f)[:80])
def walk(x, path, out):
    if isinstance(x, dict):
        for k, v in x.items():
            if re.search(r"evo|upgrade|chain", k, re.I): out.append(path + "/" + k)
            walk(v, path + "/" + k, out)
    elif isinstance(x, list):
        for i, v in enumerate(x[:3]): walk(v, path + f"[{i}]", out)
out = []; walk(f, "", out); print("evo-ish paths:", sorted(set(re.sub(r"\[\d+\]", "[]", p) for p in out))[:80])
for k in f:
    if re.search(r"evo|upgrade|chain", k, re.I): print("KEY", k, json.dumps(f[k])[:2500])
FS = "https://firestore.googleapis.com/v1/projects/trivela-madfut/databases/%28default%29/documents"
with urllib.request.urlopen(urllib.request.Request(FS + "/evosElite?pageSize=300", headers=H), timeout=60) as r: e = json.loads(r.read())
docs = e.get("documents", []); print("evosElite docs", len(docs))
ev = docs[0]["fields"]["evos"]["arrayValue"]["values"][0]["mapValue"]["fields"]
print("elite evo keys:", list(ev)); print("standardUpgrades sample:", json.dumps(ev.get("standardUpgrades"))[:800])
for k in ev:
    if k not in ("players", "rewards"): print(" ", k, json.dumps(ev[k])[:600])
