#!/usr/bin/env bash
# Publish one finished team straight away (the site shows it before the other series are done).
#   scripts/publish_one.sh docs/results/myclub_79.json
# A new season is left to the final publish step, which moves last season to the Vault first.
f="$1"; [ -f "$f" ] || { echo "no $f"; exit 0; }
cp "$f" /tmp/publish_one.json
git config user.name "madfut-tools bot"; git config user.email "actions@users.noreply.github.com"
for i in 1 2 3 4 5 6 7 8; do
  git fetch -q origin main && git reset -q --hard origin/main
  python3 - <<'PY' || { echo "new season: this team is published with the rest at the end"; exit 0; }
import json, sys
live = json.load(open("docs/results/week.json")).get("week")
sys.exit(0 if live == json.load(open("config/week.json")).get("week") else 1)
PY
  cp /tmp/publish_one.json "$f"
  python3 scripts/build.py index
  git add docs/results
  git diff --cached --quiet && { echo "nothing new"; exit 0; }
  git commit -qm "Team ready: $(basename "$f" .json)" && git push -q origin HEAD:main && { echo "published $f"; exit 0; }
  echo "push raced with another job, retrying ($i)"; sleep $((3 + RANDOM % 12))
done
echo "could not publish early; the final step will"
