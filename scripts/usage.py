"""Card usage across the year: which cards the Best Teams (everyone's teams, not personal versions) used.

  python scripts/usage.py        # -> docs/usage.json

Each series' team is followed through the git history of docs/results/. A card is credited with the DAYS it was
actually in that series' team: if a, b, c start the season and a new card replaces a on day 4, a gets days 1-3 and
the new card days 4-7. Past seasons with no day-by-day history (built afterwards into the Vault) count their final
team for the whole 7 days. Needs the full git history (fetch-depth: 0).
"""
import collections, datetime, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
git = lambda *a: subprocess.check_output(["git", "-C", ROOT, *a], text=True)
DAY = 86400.0


def players(d):
    if "team" in d: return d["team"]["players"]
    return (d.get("teams") or [{}])[0].get("players", [])


def main():
    now = datetime.datetime.now(datetime.timezone.utc).timestamp()
    # (week, file) -> [(time, [card rows])] in time order
    hist = collections.defaultdict(list)
    log = git("log", "--reverse", "--format=%H %ct", "--", "docs/results/").split("\n")
    for line in filter(None, log):
        sha, t = line.split(); t = float(t)
        try:
            names = git("ls-tree", "--name-only", sha, "docs/results/").split()
        except subprocess.CalledProcessError:
            continue
        for path in names:
            f = os.path.basename(path)
            if not f.startswith(("myclub_", "sim_")) or not f.endswith(".json"): continue
            try:
                d = json.loads(git("show", f"{sha}:{path}"))
            except Exception:
                continue
            wk = d.get("week")
            if not wk: continue
            ps = players(d)
            key = (wk, f[:-5])
            ids = [p["id"] for p in ps]
            if hist[key] and hist[key][-1][2] == ids: continue          # same team, nothing changed
            hist[key].append((t, ps, ids))
    cards = {}
    def credit(p, wk, series, days):
        c = cards.setdefault(p["id"], {"id": p["id"], "name": p["name"], "rating": p["rating"], "color": p["color"],
                                       "position": p.get("position") or p.get("slot"), "days": 0.0, "teams": set(), "seasons": {}})
        c["days"] += days; c["teams"].add(f"{wk}|{series}")
        s = c["seasons"].setdefault(wk, {"myclub": 0.0, "sim": 0.0, "series": set()})
        s[series.split("_")[0]] += days; s["series"].add(series)
    covered = set()
    for (wk, series), H in hist.items():
        start = datetime.datetime.fromisoformat(wk).replace(tzinfo=datetime.timezone.utc).timestamp()
        end = min(start + 7 * DAY, now)
        for n, (t, ps, _) in enumerate(H):
            a = max(t, start); b = min(H[n + 1][0], end) if n + 1 < len(H) else end
            if b <= a: continue
            for p in ps: credit(p, wk, series, (b - a) / DAY)
        covered.add(wk)
    try:                                       # Vault seasons built afterwards: final team, whole week
        for w in json.load(open(os.path.join(ROOT, "docs", "vault", "index.json")))["weeks"]:
            if w["week"] in covered: continue
            for f in w.get("files", []):
                d = json.load(open(os.path.join(ROOT, "docs", "vault", w["week"], f)))
                for p in players(d): credit(p, w["week"], f[:-5], 7.0)
    except FileNotFoundError:
        pass
    out = []
    for c in cards.values():
        c["days"] = round(c["days"], 1); c["teams"] = len(c["teams"])
        c["seasons"] = {k: {"myclub": round(v["myclub"], 1), "sim": round(v["sim"], 1), "series": sorted(v["series"])} for k, v in c["seasons"].items()}
        out.append(c)
    out.sort(key=lambda c: (-c["days"], -c["teams"], c["name"]))
    json.dump({"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "cards": out},
              open(os.path.join(ROOT, "docs", "usage.json"), "w"), ensure_ascii=False, separators=(",", ":"))
    print("usage:", len(out), "cards")


if __name__ == "__main__":
    main()
