#!/usr/bin/env bash
# Publish one finished team straight away (the site shows it before the other series are done).
#   scripts/publish_one.sh docs/results/myclub_79.json
# The first team of a new season moves last season to the Vault first (like the final publish step does).
f="$1"; [ -f "$f" ] || { echo "no $f"; exit 0; }
cp "$f" /tmp/publish_one.json
git config user.name "madfut-tools bot"; git config user.email "actions@users.noreply.github.com"
for i in 1 2 3 4 5 6 7 8; do
  git fetch -q origin main && git reset -q --hard origin/main
  if ! python3 - <<'PY'
import json, sys
live = json.load(open("docs/results/week.json")).get("week")
sys.exit(0 if live == json.load(open("config/week.json")).get("week") else 1)
PY
  then
    # new season: last season goes to the Vault now (full history is needed to save its card list)
    git fetch -q --unshallow origin 2>/dev/null || true
    python3 scripts/build.py archive || { echo "archive failed: this team is published with the rest at the end"; exit 0; }
  fi
  cp /tmp/publish_one.json "$f"
  python3 scripts/build.py index
  git add -A docs/results docs/vault data/seasons
  git diff --cached --quiet && { echo "nothing new"; exit 0; }
  git commit -qm "Team ready: $(basename "$f" .json)" && git push -q origin HEAD:main && { echo "published $f"; exit 0; }
  echo "push raced with another job, retrying ($i)"; sleep $((3 + RANDOM % 12))
done
echo "could not publish early; the final step will"
