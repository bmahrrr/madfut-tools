"""Which series a push to config/week.json needs to build: everything for a new season (or when unsure), otherwise
only the series whose setup changed (cap, boosts, squad bonuses or Reddit teams). Adding a Reddit team later only
rebuilds that one series; it starts from the team already built this season.

  python scripts/changed_series.py OLD_SHA   ->  "all" or "myclub:79,sim:85" (empty string = nothing changed)
"""
import json, subprocess, sys


def load(ref):
    try:
        return json.loads(subprocess.check_output(["git", "show", f"{ref}:config/week.json"], text=True, stderr=subprocess.DEVNULL))
    except Exception:
        return None


old, new = load(sys.argv[1]) if len(sys.argv) > 1 else None, json.load(open("config/week.json"))
if not old or old.get("week") != new.get("week"):
    print("all"); sys.exit()
out = []
for mode in ("myclub", "sim"):
    before = {s["key"]: s for s in old.get(mode, [])}
    for s in new.get(mode, []):
        if before.get(s["key"]) != s: out.append(f"{mode}:{s['key']}")
print(",".join(out))
