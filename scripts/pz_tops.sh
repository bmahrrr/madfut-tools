#!/bin/bash
# The squads behind the puzzle top scores are kept out of the public site: docs/puzzles_max.json only has the scores,
# and the squads live in the leaderboard database (Cloudflare D1, table pz_tops). Needs CLOUDFLARE_API_TOKEN and
# CLOUDFLARE_ACCOUNT_ID (repo secrets).
#   bash scripts/pz_tops.sh pull   adds the squads into docs/puzzles_max.json (in this checkout only)
#   bash scripts/pz_tops.sh push   saves every squad in docs/puzzles_max.json to the database, then takes them out of it
set -euo pipefail
cd "$(dirname "$0")/.."
F=docs/puzzles_max.json
trim() { printf %s "$1" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | tr -d '\n'; }
export CLOUDFLARE_API_TOKEN=$(trim "${CLOUDFLARE_API_TOKEN:-}") CLOUDFLARE_ACCOUNT_ID=$(trim "${CLOUDFLARE_ACCOUNT_ID:-}")
[ -n "$CLOUDFLARE_API_TOKEN" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ] || { echo "::error title=squads::Cloudflare secrets missing"; exit 1; }
echo "::add-mask::$CLOUDFLARE_API_TOKEN"
export WRANGLER_SEND_METRICS=false CI=true
command -v wrangler >/dev/null || npm i -g wrangler@4 >/dev/null 2>&1
W=$(mktemp -d)
ID=$(wrangler d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=s.indexOf("[");const x=i<0?null:JSON.parse(s.slice(i)).find(d=>d.name==="madfut-puzzles");process.stdout.write(x?x.uuid:"")})')
[ -n "$ID" ] || { echo "::error title=squads::database not found"; exit 1; }
printf 'name = "madfut-puzzles"\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "madfut-puzzles"\ndatabase_id = "%s"\n' "$ID" > "$W/wrangler.toml"
d1() { (cd "$W" && wrangler d1 execute madfut-puzzles --remote "$@"); }
d1 --command "CREATE TABLE IF NOT EXISTS pz_tops (id TEXT PRIMARY KEY, team TEXT NOT NULL)" >/dev/null
case "${1:-}" in
  pull)
    d1 --command "SELECT id, team FROM pz_tops" --json > "$W/rows.json"
    node -e '
      const fs = require("fs"), [F, R] = process.argv.slice(1), s = fs.readFileSync(R, "utf8");
      const rows = JSON.parse(s.slice(s.indexOf("[")))[0].results, M = JSON.parse(fs.readFileSync(F, "utf8"));
      let n = 0;
      for (const r of rows) { const p = M.puzzles[r.id]; if (p && !p.team) { p.team = JSON.parse(r.team); n++; } }
      const miss = Object.entries(M.puzzles).filter(([, p]) => !p.team).map(([id]) => id);
      if (miss.length) { console.log("::error title=squads::no squad saved for " + miss.join(" ")); process.exit(1); }
      fs.writeFileSync(F, JSON.stringify(M)); console.log("squads added:", n);' "$F" "$W/rows.json"
    ;;
  push)
    node -e '
      const fs = require("fs"), [F, Q] = process.argv.slice(1), M = JSON.parse(fs.readFileSync(F, "utf8")), q = s => "'"'"'" + s.replace(/'"'"'/g, "'"'"''"'"'") + "'"'"'";
      const L = Object.entries(M.puzzles).filter(([, p]) => p.team).map(([id, p]) => `INSERT OR REPLACE INTO pz_tops (id, team) VALUES (${q(id)}, ${q(JSON.stringify(p.team))});`);
      fs.writeFileSync(Q, L.join("\n") + "\n"); console.log("squads to save:", L.length);' "$F" "$W/save.sql"
    [ -s "$W/save.sql" ] && d1 --file="$W/save.sql" >/dev/null
    node -e '
      const fs = require("fs"), F = process.argv[1], M = JSON.parse(fs.readFileSync(F, "utf8"));
      for (const p of Object.values(M.puzzles)) delete p.team;
      fs.writeFileSync(F, JSON.stringify(M));' "$F"
    ;;
  *) echo "usage: pz_tops.sh pull|push"; exit 1 ;;
esac
