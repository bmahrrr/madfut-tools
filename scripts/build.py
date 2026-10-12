"""Build teams from config files and write results for the website.

  python scripts/build.py list                 # print the series keys (used by the workflow)
  python scripts/build.py sim KEY              # one Sim series      -> docs/results/sim_KEY.json
  python scripts/build.py myclub KEY [MIN]     # one My Club series  -> docs/results/myclub_KEY.json
  python scripts/build.py request FILE         # a custom build request (config/requests/*.json) -> docs/results/custom_*.json
  python scripts/build.py index                # docs/results/index.json (what the website reads)
"""
import json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from fatal.core import load_cards  # noqa: E402

RES = os.path.join(ROOT, "docs", "results")
os.makedirs(RES, exist_ok=True)


def week():
    return json.load(open(os.path.join(ROOT, "config", "week.json")))


def resolve_team(spec, by_id, cards):
    """A team is a list of card ids, or 'Name@rating' strings."""
    out = []
    for s in spec:
        if s in by_id:
            out.append(by_id[s]); continue
        name, _, r = str(s).partition("@")
        m = [c for c in cards if c["name"].lower() == name.strip().lower() and (not r or c["rating"] == int(r))]
        if not m:
            raise SystemExit(f"Could not find card '{s}'")
        out.append(max(m, key=lambda c: c["rating"]))
    return out


def save(name, data):
    data["built"] = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    json.dump(data, open(os.path.join(RES, name), "w"), ensure_ascii=False, indent=1)
    print("saved", name)


def main():
    mode = sys.argv[1]
    if mode == "list":
        w = week()
        out = {m: [s["key"] for s in w.get(m, [])] for m in ("sim", "myclub")}
        only = (sys.argv[2] if len(sys.argv) > 2 else "all").strip().lower()
        if only in ("sim", "myclub"):
            out = {m: (v if m == only else []) for m, v in out.items()}
        elif ":" in only:
            m, _, k = only.partition(":")
            out = {mm: [x for x in v if mm == m.strip() and x.lower() == k.strip()] for mm, v in out.items()}
        print(json.dumps(out))
        return
    if mode == "index":
        files = sorted(f for f in os.listdir(RES) if f.endswith(".json") and f not in ("index.json", "week.json", "extras.json"))
        w = week()
        json.dump({"week": w.get("week"), "files": files,
                   "series": {"sim": w.get("sim", []), "myclub": [{k: v for k, v in s.items() if k != "opponents"} for s in w.get("myclub", [])]}},
                  open(os.path.join(RES, "index.json"), "w"), indent=1)
        json.dump(w, open(os.path.join(RES, "week.json"), "w"), indent=1, ensure_ascii=False)
        ex = json.load(open(os.path.join(ROOT, "config", "extras.json")))
        json.dump({"cards": ex.get("cards", [])}, open(os.path.join(RES, "extras.json"), "w"), indent=1, ensure_ascii=False)
        return
    allc = load_cards()
    owned = [c for c in allc if c.get("owned", True)]
    by_id = {c["id"]: c for c in allc}
    if mode == "sim":
        from fatal.sim import build_sim
        key = sys.argv[2]
        s = next(x for x in week()["sim"] if x["key"] == key)
        print("Sim", key)
        teams = build_sim(s, owned)
        save(f"sim_{key}.json", {"mode": "sim", "series": s, "teams": teams})
    elif mode == "request":
        from fatal.myclub import build_myclub
        path = sys.argv[2]
        req = json.load(open(path))
        stem = os.path.splitext(os.path.basename(path))[0]
        s = next(x for x in week()["myclub"] if x["key"] == str(req["series"]))
        kind = req.get("mode", "robust")
        minutes = float(req.get("minutes", 60 if kind == "robust" else 30))
        opps = [resolve_team(t, by_id, allc) for t in (req.get("opponents") or [])]
        if kind == "robust":
            opps += [resolve_team(t, by_id, allc) for t in s.get("opponents", [])]
        print("Custom", kind, "series", s["key"], "opponents:", len(opps), "minutes:", minutes)
        team = build_myclub(s, owned, allc, opponents=opps, minutes=minutes, mode=kind,
                            verify=3 if kind == "robust" else 0)
        save(f"custom_{stem}.json", {"mode": "custom", "request": req, "series": {k: v for k, v in s.items() if k != "opponents"},
                                     "opponents": [[c["name"] for c in o] for o in opps], "team": team})
    elif mode == "myclub":
        from fatal.myclub import build_myclub
        key = sys.argv[2]
        s = next(x for x in week()["myclub"] if x["key"] == key)
        minutes = float(sys.argv[3]) if len(sys.argv) > 3 else s.get("minutes", 30)
        opps = [resolve_team(t, by_id, allc) for t in s.get("opponents", [])]
        print("My Club", key, "opponents:", len(opps))
        kind = s.get("mode", "robust")      # best worst case against the Reddit team and stress tests
        team = build_myclub(s, owned, allc, opponents=opps, minutes=minutes, mode=kind, verify=3 if kind == "robust" else 0)
        save(f"myclub_{key}.json", {"mode": "myclub", "series": {k: v for k, v in s.items() if k != "opponents"},
                                    "opponents": [[c["name"] for c in o] for o in opps], "team": team})


if __name__ == "__main__":
    main()
