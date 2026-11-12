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


def variants():
    """config/variants.json: extra public versions of a series without some cards, e.g. {"myclub": {"89": [{"id": "noltm",
    "label": "No LTMs", "exclude": [{"color": "ltm"}]}]}}. Built as series key "89--noltm" -> docs/results/myclub_89--noltm.json"""
    try:
        return json.load(open(os.path.join(ROOT, "config", "variants.json")))
    except FileNotFoundError:
        return {}


def variant_keys(mode, keys):
    v = variants().get(mode, {})
    return [f"{k}--{x['id']}" for k in keys for x in v.get("*", []) + v.get(k, [])]


def variant_of(base, vid):
    v = variants().get("myclub", {})
    return next(x for x in v.get("*", []) + v.get(base, []) if x["id"] == vid)


def not_owned():
    """Cards left out of a personal rebuild ("Don't have" on the site). Weekly and nightly builds assume
    everyone owns every card, so they never set this."""
    return {x for x in os.environ.get("NOT_OWNED", "").split(",") if x}


def team_sig(d):
    t = d.get("team") or (d.get("teams") or [None])[0]
    return (t.get("formation"), [p["id"] for p in t["players"]]) if t and t.get("players") else None


def save(name, data):
    data["built"] = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
    data["week"] = week().get("week")
    # "changed": when the team last changed (the site shows it when the team isn't unbeatable)
    try:
        prev = json.load(open(os.path.join(RES, name)))
    except Exception:
        prev = None
    same = prev and prev.get("week") == data["week"] and team_sig(prev) == team_sig(data)
    data["changed"] = (prev.get("changed") or prev.get("built")) if same else data["built"]
    if not_owned():
        data["not_owned_ids"] = sorted(not_owned())
    if os.environ.get("REQ_CREATED"):            # personal rebuilds: when it was asked for (newest wins on save)
        data["request_created"] = os.environ["REQ_CREATED"]
    json.dump(data, open(os.path.join(RES, name), "w"), ensure_ascii=False, indent=1)
    print("saved", name)


def patched_candidates(prev, s, owned, per_slot=5, limit=12):
    """The full Best Team with every card you don't own replaced by the best owned card for that slot.
    Several replacements per slot are tried; the builder's final check picks the best worst case."""
    from fatal.core import effective, pid
    have = {c["id"]: c for c in owned}
    team = [(p["slot"], have.get(p["id"])) for p in prev["team"]["players"]]
    gaps = [i for i, (sl, c) in enumerate(team) if c is None]
    if not gaps or len(gaps) > 4: return []
    fits = lambda c, sl: sl == c.get("position") or sl in str(c.get("altPositions") or "").split(",")
    teams = [[c for _, c in team]]
    for i in gaps:
        sl, nxt = team[i][0], []
        for t in teams:
            used = {pid(c) for c in t if c}
            opts = []
            for c in owned:
                if not fits(c, sl) or pid(c) in used: continue
                tt = t[:i] + [c] + t[i + 1:]
                if any(x is None for x in tt):                  # other gaps still open: judge by the card alone
                    opts.append((c["attack"] + c["control"] + c["defense"], tt)); continue
                E, ch = effective(tt, s)
                opts.append((sum(ch) * 6 + sum(e[0] + e[1] + e[2] for e in E), tt))
            nxt += [tt for _, tt in sorted(opts, key=lambda z: -z[0])[:per_slot]]
        teams = nxt[:limit * 3]
    out = []
    for t in teams:
        if all(t):
            E, ch = effective(t, s); out.append((sum(ch) * 6 + sum(e[0] + e[1] + e[2] for e in E), t))
    out.sort(key=lambda z: -z[0])
    print("patched candidates:", len(out[:limit]))
    return [(f"Best Team, Swapped {n + 1}", t) for n, (_, t) in enumerate(out[:limit])]


def mc_pick(key, owned, allc, by_id, no_names):
    """Publish the best of the side-by-side My Club searches. Every search's team (and the published team) is played
    with the exact solver against one shared field: the Reddit team(s), every test team any search found (counter
    teams, balanced teams, stress tests), the other searches' teams and fresh counter teams built against each
    finalist. Same ranking as the builder (owner's shape, Reddit result, worst case, total, stats); the published
    team stays on a tie."""
    import glob as _g, random
    from fatal.myclub import Pool, Unbeat, set_icon_limit, fits, pscore, optimize, _key
    from fatal.par import pmap
    s = next(x for x in week()["myclub"] if x["key"] == key)
    set_icon_limit(s)
    me, field = Pool(s, owned), Pool(s, allc)
    mine, fid = {c["id"]: c for c in me.cards}, {c["id"]: c for c in field.cards}
    raws = []
    for f in sorted(_g.glob(os.path.join(RES, f"myclub_{key}.*.raw"))):
        try: raws.append((f.rsplit(".", 2)[1], json.load(open(f))))
        except Exception as e: print("search not read:", f, e)
    cands = []
    for t, r in raws:
        tm = [mine.get(p["id"]) for p in r["team"]["players"]]
        if all(tm) and fits(tm) and _key(tm) not in {_key(c[1]) for c in cands}: cands.append((f"search {t}", tm, r))
    prev = None
    try:
        prev = json.load(open(os.path.join(RES, f"myclub_{key}.json")))
        if prev.get("week") != week().get("week"): prev = None
    except Exception:
        prev = None
    if prev:
        tm = [mine.get(p["id"]) for p in prev["team"]["players"]]
        if all(tm) and fits(tm):
            cands = [c for c in cands if _key(c[1]) != _key(tm)] + [("Previous Best", tm, prev)]
    if not cands:
        print("no searches finished: the published team stays"); return
    print("My Club pick", key, [c[0] for c in cands])
    refs = [[fid[c["id"]] for c in resolve_team(t, by_id, allc) if c["id"] in fid] for t in s.get("opponents", [])]
    refs = [r for r in refs if len(r) == 11]
    F, seen = [], set()
    def add(tm, force=False):
        k = _key(tm)
        if k in seen and not force: return
        seen.add(k); F.append((k, tm))
    for r in refs: add(r, True)
    for _, r in raws:
        for d in (r.get("opponent_teams") or {}).values():
            tm = [fid.get(p["id"]) for p in d.get("players", [])]
            if len(tm) == 11 and all(tm): add(tm)
    for _, tm, _ in cands: add([fid[c["id"]] for c in tm])
    # fresh counter teams against each finalist (from the Reddit team, the other finalists and the team itself)
    starts = refs + [[fid[c["id"]] for c in tm] for _, tm, _ in cands]
    jobs = [(i, k) for i in range(len(cands)) for k in range(2)]
    def counter(j):
        i, k = jobs[j]; rng = random.Random(int(time.time() // 86400) * 31 + j)
        return optimize(field, list(rng.choice(starts)), [me.eff(cands[i][1])], [1], 150, rng, None, f"pick{j}")[1]
    for tm in pmap(counter, len(jobs)): add(tm)
    ub = Unbeat(field, s); ub.n_ref = len(refs)
    Es = [field.eff(tm) for _, tm in F]
    def score(i):
        k0, E = _key(cands[i][1]), me.eff(cands[i][1])
        per = [pscore(E, O) for j, ((k, _), O) in enumerate(zip(F, Es)) if j < len(refs) or k != k0]
        return ub.full_key(E, per)
    keys = pmap(score, len(cands))
    print("field of", len(F), "teams")
    best = None
    for (lab, tm, r), k in zip(cands, keys):
        print(f"  {lab}: {k[:5]}")
        if best is None or k > best[0] or (lab == "Previous Best" and k[:5] >= best[0][:5]): best = (k, lab, r)
    k, lab, out = best
    print("picked:", lab)
    for f in _g.glob(os.path.join(RES, f"myclub_{key}.*.raw")): os.remove(f)
    if lab == "Previous Best": return
    if prev and sorted(p["id"] for p in prev["team"]["players"]) == sorted(p["id"] for p in out["team"]["players"]):
        out["team"].update({x: prev["team"][x] for x in ("formation", "players", "chem") if x in prev["team"]})
    out["not_owned"] = no_names
    save(f"myclub_{key}.json", out)


def main():
    global RES          # a personal rebuild writes to docs/results/mine
    mode = sys.argv[1]
    if mode == "list":
        w = week()
        out = {m: [s["key"] for s in w.get(m, [])] for m in ("sim", "myclub")}
        # "No LTMs or Evos" versions: built once per season, after the all-cards teams (never rebuilt nightly).
        # A version already built this season is skipped unless asked for by name ("myclub:89--noltmevo").
        def built(k):
            try:
                return json.load(open(os.path.join(RES, f"myclub_{k}.json"))).get("week") == w.get("week")
            except Exception:
                return False
        out["variants"] = variant_keys("myclub", out["myclub"])
        named = {x.split(":", 1)[1].strip().lower() for x in (sys.argv[2] if len(sys.argv) > 2 else "").split(",") if "--" in x}
        out["variants"] = [k for k in out["variants"] if k.lower() in named or not built(k)]
        only = (sys.argv[2] if len(sys.argv) > 2 else "all").strip().lower()
        grp = lambda m: "myclub" if m == "variants" else m      # a series' variants follow its My Club team
        if only in ("sim", "myclub"):
            out = {m: (v if grp(m) == only else []) for m, v in out.items()}
        elif ":" in only or only == "":          # one or more series: "myclub:79,sim:85" ("" = nothing)
            want = {(m.strip(), k.strip().lower()) for m, _, k in (x.partition(":") for x in only.split(",") if x.strip())}
            if any("--" in k for _, k in want):       # only variants asked for ("myclub:89--noltmevo"): not the series itself
                out = {mm: [x for x in v if (grp(mm), x.lower()) in want] for mm, v in out.items()}
            else:
                out = {mm: [x for x in v if (grp(mm), x.split("--")[0].lower()) in want] for mm, v in out.items()}
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
        keys |= {"myclub_" + k for k in variant_keys("myclub", [s["key"] for s in w.get("myclub", [])])}
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
    # "Don't have" an LTM means none of its levels (each maxed rating is its own card): leave them all out
    ltm = {c["name"] for c in allc if c["id"] in NO and c.get("color") == "ltm"}
    NO = NO | {c["id"] for c in allc if c.get("color") == "ltm" and c["name"] in ltm}
    owned = [c for c in allc if c.get("owned", True) and c["id"] not in NO]
    no_names = sorted({c["name"] + (" (every level)" if c.get("color") == "ltm" else f" {c['rating']}") for c in allc if c["id"] in NO})
    by_id = {c["id"]: c for c in allc}
    if mode in ("sim", "simpick"):
        # two independent searches per series run side by side on separate machines ("sim KEY a" / "sim KEY b", raw
        # results), then "simpick KEY" publishes the better of the two (control first, then head to head) through the
        # usual checks below. "sim KEY" alone is one search, published directly (personal rebuilds).
        from fatal.sim import build_sim, best_of
        key = sys.argv[2]
        tag = sys.argv[3] if mode == "sim" and len(sys.argv) > 3 else None
        if tag == "b": os.environ["SIM_SEARCH"] = "1"
        s = next(x for x in week()["sim"] if x["key"] == key)
        print("Sim", key)
        refs = [resolve_team(t, by_id, allc) for t in s.get("opponents", [])]
        n_reddit = len(refs)
        try:                                # this season's current team is a starting point too (it gets polished)
            prev = json.load(open(os.path.join(RES, f"sim_{key}.json")))
            if prev.get("week") == week().get("week") and prev.get("teams"):
                sq = [by_id[p["id"]] for p in prev["teams"][0]["players"] if p["id"] in by_id]
                if len(sq) == 11 and all(c["id"] not in NO for c in sq): refs.append(sq)
        except Exception as e:
            print("no previous sim team to start from:", e)
        if mode == "sim":
            teams = build_sim(s, owned, refs=refs, n_reddit=n_reddit)
            if tag:
                json.dump({"teams": teams}, open(os.path.join(RES, f"sim_{key}.{tag}.raw"), "w"), ensure_ascii=False)
                print("search", tag, "saved"); return
        else:
            import glob as _g
            raws = [json.load(open(f))["teams"] for f in sorted(_g.glob(os.path.join(RES, f"sim_{key}.*.raw")))]
            raws = [r for r in raws if r]
            if not raws: print("no searches finished for", key); return
            pick = best_of(s, owned, [r[0] for r in raws])
            seen = {(pick["formation"], tuple(p["id"] for p in pick["players"]))}; teams = [pick]
            for r in raws:
                for tm in r:
                    sg = (tm["formation"], tuple(p["id"] for p in tm["players"]))
                    if sg not in seen and len(teams) < 3: seen.add(sg); teams.append(tm)
        try:                                # keep this season's previous team if the new search did worse
            from fatal.sim import evaluate, _slot_rows
            from fatal.core import FORMATIONS
            prev = json.load(open(os.path.join(RES, f"sim_{key}.json")))
            if prev.get("week") == week().get("week") and prev.get("teams") and teams:
                pt = prev["teams"][0]; sq = [by_id[p["id"]] for p in pt["players"] if p["id"] in by_id]
                if len(sq) == 11 and all(c["id"] not in NO for c in sq):
                    slots = FORMATIONS[pt["formation"]]; ev = evaluate(sq, slots, s)
                    from fatal.sim import sim_key as k     # includes "never lose to the Reddit team" (set by build_sim)
                    # safety net: level on the hard rules and control, the new team must not lose to the published one head
                    # to head (the same test as the builder's final round robin), or the published team stays
                    from fatal.sim import _side, _match
                    nt = teams[0]; nsq = [by_id[p["id"]] for p in nt["players"]]
                    _, a, b = _match(_side(nsq, FORMATIONS[nt["formation"]], s), _side(sq, slots, s))
                    kp, kn = k(ev), k(nt["metrics"])
                    cp, cn = round(ev["control"], 2), round(nt["metrics"]["control"], 2)
                    # level: same hard rules and control, or one has higher control and the other meets the attack floor
                    # better (owner: the floor against control is settled head to head)
                    level = (kp[0], kp[1], kp[3]) == (kn[0], kn[1], kn[3]) and (
                        (cp == cn and kp[2] == kn[2]) or (cp > cn and kp[2] < kn[2]) or (cp < cn and kp[2] > kn[2]))
                    if level and nsq != sq: print(f"new team vs published: scores {a:.3f}, concedes {b:.3f}")
                    if k(ev) > k(nt["metrics"]) and not (level and a > b) or (level and b > a):
                        print("previous team is better:", ev["control"], "vs", teams[0]["metrics"]["control"])
                        pt = dict(pt, metrics=ev, players=[dict(r, slot=sl) for r, sl in zip(_slot_rows(sq, s), slots)], source="Previous Best")
                        teams = [pt] + teams[:2]
        except FileNotFoundError:
            pass
        except Exception as e:
            print("previous sim team not compared:", e)
        save(f"sim_{key}.json", {"mode": "sim", "series": s, "teams": teams, "not_owned": no_names})
        if mode == "simpick":                # the raw searches never get published
            import glob as _g
            for f in _g.glob(os.path.join(RES, f"sim_{key}.*.raw")): os.remove(f)
    elif mode == "request" and json.load(open(sys.argv[2])).get("mode") == "rebuild":
        req = json.load(open(sys.argv[2]))
        kind, key = req.get("kind", "myclub"), str(req["series"])
        # a personal version: same build, without the cards this person doesn't have; saved to docs/results/mine/
        os.environ["NOT_OWNED"] = ",".join(req.get("not_owned", []))
        os.environ["REQ_CREATED"] = req.get("created", "")
        RES = os.path.join(ROOT, "docs", "results", "mine"); os.makedirs(RES, exist_ok=True)
        print("Personal rebuild", kind, key, "without", req.get("not_owned"))
        # quick: the full team with the missing cards swapped out is tried first (see patched_candidates),
        # plus a short search, so a missing card or two doesn't cost the full 3-hour build
        os.environ["QUICK_PATCH"] = "1"
        sys.argv = [sys.argv[0], kind, key] + (["20"] if kind == "myclub" else [])
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
    elif mode == "mcpick":
        mc_pick(sys.argv[2], owned, allc, by_id, no_names)
    elif mode == "myclub":
        from fatal.myclub import build_myclub
        key = sys.argv[2]
        base, _, vid = key.partition("--")
        s = next(x for x in week()["myclub"] if x["key"] == base)
        minutes = float(sys.argv[3]) if len(sys.argv) > 3 else s.get("minutes", 30)
        # three independent searches per series run side by side on separate machines ("myclub KEY MIN a|b|c", raw
        # results, each with its own random starts), then "mcpick KEY" publishes the best of them. No tag: one search,
        # published directly (personal rebuilds and the No LTMs or Evos versions).
        tag = sys.argv[4] if len(sys.argv) > 4 else None
        variant = None
        if vid:                             # a public "without these cards" version of the series
            variant = variant_of(base, vid)
            hit = lambda c: any(all(c.get(f) == val for f, val in rule.items()) for rule in variant["exclude"])
            gone = [c for c in owned if hit(c)]
            owned = [c for c in owned if not hit(c)]
            no_names = sorted({c["name"] + (" (every level)" if c.get("color") == "ltm" else " Evo" if c.get("color") == "evo" else f" {c['rating']}") for c in gone})
            print("Variant", variant["label"], "without", len(gone), "cards")
            try:                            # the all-cards team has none of those cards: it is also the best team without them
                full = json.load(open(os.path.join(RES, f"myclub_{base}.json")))
                if full.get("week") == week().get("week") and not any(hit(by_id[p["id"]]) for p in full["team"]["players"] if p["id"] in by_id):
                    full.update({"variant": {"id": vid, "label": variant["label"], "exclude": variant["exclude"]}, "not_owned": no_names, "same_as_full": True})
                    full.pop("built", None)
                    print("the all-cards team has no such cards: reused")
                    save(f"myclub_{key}.json", full); return
            except FileNotFoundError:
                pass
        opps = [resolve_team(t, by_id, allc) for t in s.get("opponents", [])]
        print("My Club", key, "opponents:", len(opps))
        kind = s.get("mode", "robust")      # best worst case against the Reddit team and stress tests
        cands = [(f"Reddit Reference Team {i+1}", o) for i, o in enumerate(opps)]
        try:                                # this week's hand-built team, if there is one
            mt = json.load(open(os.path.join(ROOT, "docs", "myteams.json")))
            if not variant and mt.get("week") == week().get("week") and key in mt.get("teams", {}):
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
            prev = None
        if os.environ.get("QUICK_PATCH") and prev:   # personal rebuild: the full team with each missing card swapped out
            cands = [c for c in cands if c[0] != "Previous Best"] + patched_candidates(prev, s, owned)
        # safety net: the builder has its own deadline (minutes x 1.25 + 15 min); if a step still runs 45 minutes past
        # it, stop and keep the current team, so the job never hits the 6-hour limit and the other steps still run
        import signal
        def _late(*_): raise TimeoutError
        signal.signal(signal.SIGALRM, _late)
        signal.alarm(int(minutes * 60 * 1.25 + 900 + 2700))
        try:
            day = int(time.time() // 86400)
            team = build_myclub(s, owned, allc, opponents=opps, minutes=minutes, mode=kind, seed=day + 100000 * "abc".find(tag or "a"),
                                verify=3 if kind == "robust" else 0, candidates=cands)
        except TimeoutError:
            print("time limit reached: the current team stays")
            return
        finally:
            signal.alarm(0)
        try:                                # same 11 cards as the current team: keep its slots so nothing moves on the site
            if prev and sorted(p["id"] for p in prev["team"]["players"]) == sorted(p["id"] for p in team["players"]):
                team.update({k: prev["team"][k] for k in ("formation", "players", "chem") if k in prev["team"]})
        except Exception as e:
            print("could not keep the slots:", e)
        out = {"mode": "myclub", "series": {k: v for k, v in s.items() if k != "opponents"},
               "opponents": [[c["name"] for c in o] for o in opps], "team": team, "not_owned": no_names}
        if variant: out["variant"] = {"id": vid, "label": variant["label"], "exclude": variant["exclude"]}
        if tag:
            json.dump(out, open(os.path.join(RES, f"myclub_{key}.{tag}.raw"), "w"), ensure_ascii=False)
            print("search", tag, "saved"); return
        save(f"myclub_{key}.json", out)


if __name__ == "__main__":
    main()
