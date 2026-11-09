"""Save which game cards existed in a season, so later rebuilds of that season leave out newer cards.

  python scripts/season_cards.py 2026-10-05      # -> data/seasons/2026-10-05.json

Uses the last data/cards.json in git history before the next season started (week + 7 days, 00:00 UTC).
Needs the full git history (actions/checkout with fetch-depth: 0).
"""
import datetime, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def save(week):
    end = (datetime.date.fromisoformat(week) + datetime.timedelta(days=7)).isoformat() + "T00:00:00Z"
    git = lambda *a: subprocess.check_output(["git", "-C", ROOT, *a], text=True).strip()
    rev = git("log", "-1", "--format=%H %cI", f"--before={end}", "--", "data/cards.json")
    if not rev:
        print("no card data before", end, "- nothing saved"); return False
    sha, when = rev.split()
    raw = json.loads(git("show", f"{sha}:data/cards.json"))
    i = raw["fields"].index("id")
    ids = sorted(r[i] for r in raw["cards"])
    os.makedirs(os.path.join(ROOT, "data", "seasons"), exist_ok=True)
    json.dump({"week": week, "season_end": end, "card_data_commit": sha, "card_data_time": when, "count": len(ids), "ids": ids},
              open(os.path.join(ROOT, "data", "seasons", f"{week}.json"), "w"), separators=(",", ":"))
    print("saved", week, len(ids), "cards from", when)
    return True


if __name__ == "__main__":
    save(sys.argv[1])
