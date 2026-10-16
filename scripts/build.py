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

# WEEK_FILE / RES_DIR let the same builder fill a vault week (e.g. a past week) without touching this week's results
RES = os.path.join(ROOT, os.environ.get("RES_DIR") or os.path.join("docs", "results"))
os.makedirs(RES, exist_ok=True)


def week():
    return json.load(open(os.path.join(ROOT, os.environ.get("WEEK_FILE") or os.path.join("config", "week.json"))))


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
    """Cards left out of a personal rebuild ("Don't have" on the site). Weekly and nightly builds assume
    everyone owns every card, so they never set this."""
    return {x for x in os.environ.get("NOT_OWNED", "").split(",") if x}


def save(name, data):
    data["built"] = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    data["week"] = week().get("week")
    if not_owned():
        data["not_owned_ids"] = sorted(not_owned())
    if os.environ.get("REQ_CREATED"):            # personal rebuilds: when it was asked for (newest wins on save)
        data["request_created"] = os.environ["REQ_CREATED"]
    json.dump(data, open(os.path.join(RES, name), "w"), ensure_ascii=False, indent=1)
    print("saved", name)


def main():
    global RES          # a personal rebuild writes to docs/results/mine
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
        mine = os.path.join(RES, "mine")    # personal "Don't have" versions only last one season
        if os.path.isdir(mine):
            shutil.rmtree(mine)
        print("archived", old, len(kept), "files")
        try:                                # remember which game cards that season had (for later rebuilds of it)
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import season_cards
            season_cards.save(old)
        except Exception as e:
            print("season card list not saved:", e)
        return
    if mode == "objplan":
        # (objective, series) pairs to build: new objective, new season, or that series' best team changed
        w = week(); out = []
        objs = json.load(open(os.path.join(ROOT, "docs", "objectives.json"))).get("objectives", [])
        force = len(sys.argv) > 2 and sys.argv[2] == "all"
        for o in objs:
            for s in w.get("myclub", []):
                if not 70 <= (s.get("cap") or 99) <= 90: continue     # objectives are done in the 80-90 series, sometimes a bit below
                try:
                    pub = json.load(open(os.path.join(RES, f"myclub_{s['key']}.json")))
                except FileNotFoundError:
                    continue
                if pub.get("week") != w.get("week"): continue
                ids = [p["id"] for p in pub["team"]["players"]]
                try:
                    cur = json.load(open(os.path.join(RES, f"objective_{o['id']}_{s['key']}.json")))
                    if not force and cur.get("week") == w.get("week") and cur.get("base_ids") == ids and cur.get("objective") == o:
                        continue
                except FileNotFoundError:
                    pass
                out.append({"id": o["id"], "key": s["key"]})
        print(json.dumps(out))
        return
    if mode == "index":
        w = week()
        keys = {("myclub_" + s["key"]) for s in w.get("myclub", [])} | {("sim_" + s["key"]) for s in w.get("sim", [])}
        try:
            objs = json.load(open(os.path.join(ROOT, "docs", "objectives.json")))["objectives"]
        except FileNotFoundError:
            objs = []
        keys |= {f"objective_{o['id']}_{s['key']}" for o in objs for s in w.get("myclub", [])}
        files = sorted(f for f in os.listdir(RES) if f.endswith(".json") and f not in ("index.json", "week.json", "extras.json")
                       and (not f.startswith(("myclub_", "sim_", "objective_")) or f[:-5] in keys))
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
        try:                                # keep this season's previous team if the new search did worse
            from fatal.sim import evaluate, _slot_rows
            from fatal.core import FORMATIONS
            prev = json.load(open(os.path.join(RES, f"sim_{key}.json")))
            if prev.get("week") == week().get("week") and prev.get("teams") and teams:
                pt = prev["teams"][0]; sq = [by_id[p["id"]] for p in pt["players"] if p["id"] in by_id]
                if len(sq) == 11 and all(c["id"] not in NO for c in sq):
                    slots = FORMATIONS[pt["formation"]]; ev = evaluate(sq, slots, s)
                    from fatal.sim import rank_key
                    k = lambda e: (e["ctrl_not_full"] == 0,) + rank_key(e)
                    if k(ev) > k(teams[0]["metrics"]):
                        print("previous team is better:", ev["control"], "vs", teams[0]["metrics"]["control"])
                        pt = dict(pt, metrics=ev, players=[dict(r, slot=sl) for r, sl in zip(_slot_rows(sq, s), slots)], source="Previous Best")
                        teams = [pt] + teams[:2]
        except FileNotFoundError:
            pass
        except Exception as e:
            print("previous sim team not compared:", e)
        save(f"sim_{key}.json", {"mode": "sim", "series": s, "teams": teams, "not_owned": no_names})
    elif mode == "request" and json.load(open(sys.argv[2])).get("mode") == "rebuild":
        req = json.load(open(sys.argv[2]))
        kind, key = req.get("kind", "myclub"), str(req["series"])
        # a personal version: same build, without the cards this person doesn't have; saved to docs/results/mine/
        os.environ["NOT_OWNED"] = ",".join(req.get("not_owned", []))
        os.environ["REQ_CREATED"] = req.get("created", "")
        RES = os.path.join(ROOT, "docs", "results", "mine"); os.makedirs(RES, exist_ok=True)
        print("Personal rebuild", kind, key, "without", req.get("not_owned"))
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
    elif mode == "objective":
        # python scripts/build.py objective OBJ_ID KEY [SECONDS] -> docs/results/objective_<id>_<key>.json
        from fatal.objective import build_objective
        from fatal.core import describe
        oid, key = sys.argv[2], sys.argv[3]
        secs = float(sys.argv[4]) if len(sys.argv) > 4 else 60
        obj = next(o for o in json.load(open(os.path.join(ROOT, "docs", "objectives.json")))["objectives"] if o["id"] == oid)
        s = next(x for x in week()["myclub"] if x["key"] == key)
        pub = json.load(open(os.path.join(RES, f"myclub_{key}.json")))
        t = pub["team"]
        refs = [[by_id[p["id"]] for p in v["players"] if p["id"] in by_id] for n, v in t.get("opponent_teams", {}).items() if n.startswith("reference")]
        refs = [r for r in refs if len(r) == 11]
        base_ids = [p["id"] for p in t["players"]]
        print("Objective", oid, "series", key, "reddit teams:", len(refs))
        r = build_objective(obj, s, owned, base_ids, refs, seconds=secs, seed=int(time.time() // 86400))
        if "team_ids" in r:
            r["team"] = describe([by_id[i] for i in r.pop("team_ids")], s)
        r.update({"mode": "objective", "objective": obj, "series": {k: v for k, v in s.items() if k != "opponents"}, "base_ids": base_ids})
        save(f"objective_{oid}_{key}.json", r)
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
            SHARED = os.path.join(ROOT, os.environ.get("RES_DIR") or os.path.join("docs", "results"))
            prev = json.load(open(os.path.join(SHARED, f"myclub_{key}.json")))
            if json.load(open(os.path.join(SHARED, "week.json"))).get("week") == week().get("week"):
                cands.append(("Previous Best", [by_id[p["id"]] for p in prev["team"]["players"] if p["id"] in by_id]))
        except Exception as e:
            print("no previous team:", e)
        team = build_myclub(s, owned, allc, opponents=opps, minutes=minutes, mode=kind, seed=int(time.time() // 86400),
                            verify=3 if kind == "robust" else 0, candidates=cands)
        save(f"myclub_{key}.json", {"mode": "myclub", "series": {k: v for k, v in s.items() if k != "opponents"},
                                    "opponents": [[c["name"] for c in o] for o in opps], "team": team, "not_owned": no_names})


if __name__ == "__main__":
    main()
