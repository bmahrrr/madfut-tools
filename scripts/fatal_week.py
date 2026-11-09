"""Turn madfutdata's Fatal My Club / Fatal Sim documents (Firestore collections fatalMyClub / fatalSim,
documents named 27_<n>) into this repo's week format (config/week.json).

  python scripts/fatal_week.py 27_2 2026-10-05 > config/vault/2026-10-05.json     # downloads both documents
  python scripts/fatal_week.py 27_2 2026-10-05 --myclub FILE --sim FILE           # or use saved copies
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_data as U

STAT = {"attack": "att", "control": "ctl", "defense": "def"}
GROUP = {"nation": "nation", "league": "league", "club": "club", "color": "color"}
SQUAD = {"nations": "nations", "leagues": "leagues", "clubs": "clubs", "colors": "types"}


def amounts(L):
    out = {"att": 0, "ctl": 0, "def": 0}
    for x in L:
        s, v = x.split(",")
        for k in (["attack", "control", "defense"] if s == "all_stats" else [s]):
            out[STAT[k]] += int(v)
    return out


def series(doc, kind):
    out = []
    for s in doc["series"]:
        key = "X" if s["rating"] >= 99 else str(s["rating"])
        boosts, bonuses = [], []
        for cond, amt in zip(s["boostConditions"], (s["boostAmountOne"], s["boostAmountTwo"])):
            a = amounts(amt)
            if cond["type"] in GROUP:
                at = cond["attribute"]
                boosts.append(dict({"on": GROUP[cond["type"]], "id": at if cond["type"] == "color" else int(at)}, **a))
            elif cond["type"] in SQUAD:
                bonuses.append(dict({"kind": SQUAD[cond["type"]], "min": int(cond["value"])}, **a))
            else:
                raise SystemExit(f"unknown boost condition {cond}")
        x = {"key": key, "cap": s["rating"], "boosts": boosts}
        if bonuses: x["bonuses"] = bonuses
        if kind == "myclub": x["minutes"] = 30
        out.append(x)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("doc"); ap.add_argument("week")
    ap.add_argument("--myclub"); ap.add_argument("--sim")
    a = ap.parse_args()
    fs = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "sources.json")))["firestore_base"]
    def get(coll, path):
        if path:
            docs = json.load(open(path))
            return next(x["fields"] for x in docs if x["name"] == a.doc)
        d = U.fetch(f"{fs}/{coll}/{a.doc}")
        return {k: U.conv(v) for k, v in d["fields"].items()}
    w = {"_help": f"Fatal week {a.doc} from madfutdata (Fatal My Club / Fatal Sim). Built for the vault: no Reddit teams.",
         "week": a.week, "myclub": series(get("fatalMyClub", a.myclub), "myclub"), "sim": series(get("fatalSim", a.sim), "sim")}
    print(json.dumps(w, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
