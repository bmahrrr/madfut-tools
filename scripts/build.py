"""Build teams from config files and write results for the website.

  python scripts/build.py list                 # print the series keys (used by the workflow)
  python scripts/build.py sim KEY              # one Sim series      -> docs/results/sim_KEY.json
  python scripts/build.py myclub KEY [MIN]     # one My Club series  -> docs/results/myclub_KEY.json
  python scripts/build.py request FILE         # a custom build request (config/requests/*.json) -> docs/results/custom_*.json
  python scripts/build.py index                # docs/results/index.json (what the website reads)
  python scripts/build.py archive              # new week? copy last week's results into docs/vault/<week>/
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


def not_owned():
    """Cards marked "Don't have" on the site for THIS week (config/notowned.json). A new week forgets them."""
    try:
        n = json.load(open(os.path.join(ROOT, "config", "notowned.json")))
    except Exception:
        return set()
    return set(n.get("ids", [])) if n.get("week") == week().get("week") else set()


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
    if mode == "archive":
        import shutil
        try:
            old = json.load(open(os.path.join(RES, "week.json"))).get("week")
        except Exception:
            old = None
        if not old or old == week().get("week"):
            print("same week, nothing to archive"); return
        dest = os.path.join(ROOT, "docs", "vault", old)
        os.makedirs(dest, exist_ok=True)
        kept = [f for f in os.listdir(RES) if f.startswith(("myclub_", "sim_")) or f == "week.json"]
        for f in kept:
            shutil.copy(os.path.join(RES, f), dest)
        vi = os.path.join(ROOT, "docs", "vault", "index.json")
        try:
            v = json.load(open(vi))
        except Exception:
            v = {"weeks": []}
        v["weeks"] = [x for x in v["weeks"] if x["week"] != old] + [{"week": old, "files": sorted(f for f in kept if f != "week.json")}]
        v["weeks"].sort(key=lambda x: x["week"], reverse=True)
        json.dump(v, open(vi, "w"), indent=1)
        for f in kept:          # last week's teams leave the live results
            if f != "week.json":
                os.remove(os.path.join(RES, f))
        print("archived", old, len(kept), "files")
        return
    if mode == "index":
        w = week()
        keys = {("myclub_" + s["key"]) for s in w.get("myclub", [])} | {("sim_" + s["key"]) for s in w.get("sim", [])}
        files = sorted(f for f in os.listdir(RES) if f.endswith(".json") and f not in ("index.json", "week.json", "extras.json")
                       and (not f.startswith(("myclub_", "sim_")) or f[:-5] in keys))
        json.dump({"week": w.get("week"), "files": files,
                   "series": {"sim": w.get("sim", []), "myclub": [{k: v for k, v in s.items() if k != "opponents"} for s in w.get("myclub", [])]}},
                  open(os.path.join(RES, "index.json"), "w"), indent=1)
        json.dump(w, open(os.path.join(RES, "week.json"), "w"), indent=1, ensure_ascii=False)
        ex = json.load(open(os.path.join(ROOT, "config", "extras.json")))
        json.dump({"cards": ex.get("cards", [])}, open(os.path.join(RES, "extras.json"), "w"), indent=1, ensure_ascii=False)
        return
    allc = load_cards()
    NO = not_owned()
    owned = [c for c in allc if c.get("owned", True) and c["id"] not in NO]
    no_names = [c["name"] + f" {c['rating']}" for c in allc if c["id"] in NO]
    by_id = {c["id"]: c for c in allc}
    if mode == "sim":
        from fatal.sim import build_sim
        key = sys.argv[2]
        s = next(x for x in week()["sim"] if x["key"] == key)
        print("Sim", key)
        teams = build_sim(s, owned)
        save(f"sim_{key}.json", {"mode": "sim", "series": s, "teams": teams, "not_owned": no_names})
    elif mode == "request" and json.load(open(sys.argv[2])).get("mode") == "rebuild":
        req = json.load(open(sys.argv[2]))
        kind, key = req.get("kind", "myclub"), str(req["series"])
        print("Rebuild", kind, key, "without", no_names)
        sys.argv = [sys.argv[0], kind, key]
        return main()
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
        cands = [(f"Reddit Reference Team {i+1}", o) for i, o in enumerate(opps)]
        try:                                # this week's hand-built team, if there is one
            mt = json.load(open(os.path.join(ROOT, "docs", "myteams.json")))
            if mt.get("week") == week().get("week") and key in mt.get("teams", {}):
                cands.append(("Hand-Built Team", resolve_team(mt["teams"][key]["ids"], by_id, allc)))
        except Exception as e:
            print("no hand-built team:", e)
        try:                                # this week's current best team: the new build must beat it to replace it
            prev = json.load(open(os.path.join(RES, f"myclub_{key}.json")))
            if json.load(open(os.path.join(RES, "week.json"))).get("week") == week().get("week"):
                cands.append(("Previous Best", [by_id[p["id"]] for p in prev["team"]["players"] if p["id"] in by_id]))
        except Exception as e:
            print("no previous team:", e)
        team = build_myclub(s, owned, allc, opponents=opps, minutes=minutes, mode=kind, seed=int(time.time() // 86400),
                            verify=3 if kind == "robust" else 0, candidates=cands)
        save(f"myclub_{key}.json", {"mode": "myclub", "series": {k: v for k, v in s.items() if k != "opponents"},
                                    "opponents": [[c["name"] for c in o] for o in opps], "team": team, "not_owned": no_names})


if __name__ == "__main__":
    main()
