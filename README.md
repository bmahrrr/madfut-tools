# MadFut Tools

Fatal My Club and Fatal Sim team builder, an SBC solver and team comparison tools for MadFut 27.
Everything runs free on GitHub: GitHub Actions does the heavy building and GitHub Pages hosts the website.

**Website:** https://bmahrrr.github.io/madfut-tools/

## What it does

| Part | How |
|---|---|
| Card data | `Update card data` workflow pulls madfutdata.com every day (03:17 UTC) into `docs/cards.json`. |
| My Club builder | Searches for the team that does best against the reference teams with **perfect play from both sides** (exact solver, both lead orders). |
| Sim builder | Exact optimiser (MILP): highest control first, then attack and defence, inside the cap with every boost and bonus. |
| SBC solver | Website: type in the requirements, get the cheapest squad in seconds, tap **Don't have** on any card to re-solve without it. |
| Custom builds | Teams tab → **🛡 Build the most robust team** (judged by its worst result against every opponent and stress test, then checked against fresh stress tests), or My Club compare → **🎯 Build a team to beat this** (all the time spent beating one team, e.g. the Reddit team). Runs on GitHub; results appear under "Custom builds". |
| My Club compare | Website: put in two teams and get the exact result for both lead orders. |
| Match helper | Website: tells you the best lead or answer every round during a live game. |
| Sim compare | Website: your built Sim team vs theirs, with possession and match odds. |

## Each week

1. Open `config/week.json` on GitHub (website → **Weekly setup** has direct edit links).
2. Change the `week`, the caps, the boosts and the reference (opponent) teams. Commit.
3. The `Build teams` workflow starts on its own. Sim teams take a couple of minutes; My Club teams take about 30 minutes each, all running in parallel.
4. Refresh the website once the run is green.

To rebuild just one series: **Actions → Build teams → Run workflow**, then type e.g. `myclub:79` or `sim:84`.

### `config/week.json`

```json
{
  "week": "2026-10-12",
  "myclub": [
    {"key": "79", "cap": 79, "minutes": 30,
     "boosts": [{"on": "nation", "id": 18, "att": 1, "ctl": 2, "def": 0}],
     "bonuses": [{"kind": "nations", "min": 5, "att": 1, "ctl": 1, "def": 1}],
     "opponents": [["id123", "id456", "... 11 card ids"], ["Amoura@79", "Pogba@79", "... or Name@rating"]]}
  ],
  "sim": [
    {"key": "84", "cap": 84, "boosts": [{"on": "league", "id": 16, "att": 0, "ctl": 3, "def": 1}]}
  ]
}
```

- `boosts.on`: `nation`, `league`, `club` or `color` (card type, e.g. `"totw"`). Find ids with the **card id lookup** on the Weekly setup tab.
- `bonuses.kind`: `nations`, `clubs` or `types` (number of different ones in the squad needed for the bonus).
- `opponents`: the reference teams. The builder optimises against all of them.
- `minutes`: search time for a My Club series.

### `config/extras.json`

Cards that aren't in the madfutdata file: evos, upgraded LTMs. `"owned": true` means you have it; `false` means only opponents can use it.

### SBCs

Use the **SBC** tab on the website. Fill in only what the SBC asks for: formation, squad rating, chem, nations/leagues/clubs counts, and "Min/Max/Exactly N players from" a club, nation, league, card type or rarity (search a player to pick their club). It assumes you own every card; after solving, tap **Don't have** next to any card and it re-solves without it.

How it solves: a fast search finds a valid squad in about 2 seconds, then an exact solver (HiGHS, running in your browser) either finds a cheaper one or proves none exists among the best-fitting cards. "Cheapest" follows your order: golds first (lowest rated first), then cheap specials, silvers, bronze. Squad rating uses the EA formula without relying on rounding, so it's never short.

SBC chem: Icons +2 to their nation and +1 to every league; Heroes +1 nation, +2 league; Squad Foundations +2 league; Icons and Heroes are always full chem.

## Game rules used

**My Club:** 11 cards each, sides alternate leading (who goes first is random). The leader picks a card and a stat; attack is answered by defence, defence by attack, control by control. A tied stat goes to the card total; if that is also tied, nobody scores. Each card is used once, there are 10 rounds, and the 11th card plays the tiebreak automatically: if the score is level or 1 apart, a card total more than 5 higher (printed total + chem bonus, no boosts) wins a point.

**Chem:** league 3/5/8, nation 2/5/8, club 2/4/7, max 3. Icons, Heroes and Hall of FUT are always on full chem. Icons add +1 to every league; Heroes count for their nation and league. Squad Foundations count double for their league. Chem bonus on every stat: 0 → −3, 1 → 0, 2 → +1, 3 → +2.

## Running locally

```bash
pip install -r requirements.txt
python scripts/update_data.py          # download cards
python scripts/build.py sim 84
python scripts/build.py myclub 79 30   # 30 minutes
python scripts/build.py index
cd docs && python -m http.server       # website on http://localhost:8000
```
