import json, sys, os
sys.path.insert(0, "scripts")
import update_data as U
fs = json.load(open("config/sources.json"))["firestore_base"]
os.makedirs("probe-out/fatal", exist_ok=True)
for kind in ["fatalMyClub", "fatalSim", "fatalDraft", "configs", "ltmMarket", "livePlayers", "promo"]:
    try:
        d = U.fetch(f"{fs}/{kind}?pageSize=300")
        docs = d.get("documents", [])
        out = [{"name": x["name"].split("/")[-1], "createTime": x.get("createTime"), "updateTime": x.get("updateTime"),
                "fields": {k: U.conv(v) for k, v in x.get("fields", {}).items()}} for x in docs]
        json.dump(out, open(f"probe-out/fatal/{kind}.json", "w"), ensure_ascii=False, indent=1)
        print(kind, len(out), [o["name"] for o in out][:80], flush=True)
    except Exception as e:
        print(kind, "failed", e, flush=True)
