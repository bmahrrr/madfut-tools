# MadFut Tools ⚽

The best Fatal My Club and Fatal Sim teams every week, an SBC solver and live match help for MadFut 27.

🌐 **Site:** https://bmahrrr.github.io/madfut-tools/

Everything runs free on GitHub. Actions does the building, Pages hosts the site.

## What's Inside

- 🏆 **Best Teams**: for every series, the team that's hardest to beat. Tested against dozens of counters built to beat it, then rebuilt every night to keep improving.
- 📋 **Game Plan**: which cards to open with, the key matchups, and which card to save for the tiebreak.
- ⚔️ **Head to Head**: put in two teams and get the exact result, whoever leads first.
- 🎮 **Match Helper**: the best lead or answer every round of a live game.
- 📊 **Sim Odds**: your Sim team against theirs, with possession and match odds.
- 🎯 **Beat a Team**: load any team and build a counter to it.
- 🧩 **SBC**: type or paste the requirements, get the cheapest squad in seconds.
- 🃏 **Cards**: every card on the site, plus the most used cards each season.

Missing a card from a Best Team? Tap **Missing a card?**, pick it, and get your own version in about 40 minutes. Everyone else still sees the full team.

## Each Season

1. Open the site and go to **Season Setup**.
2. Set the start date, the series, their boosts and any teams to test against.
3. Tap **Save & Rebuild**. Sim teams are ready in minutes, My Club in a few hours.

Last season's teams move to the **Vault** automatically.

The nightly run starts at 4am Brisbane time (18:00 UTC). Card data updates daily from madfutdata.com.

## Setup Files

- `config/week.json`: the season. Series, caps, boosts, squad bonuses and teams to test against. Season Setup writes this for you.
- `config/extras.json`: cards the data doesn't have yet, like Evos and LTMs. `"owned": false` means only opponents can use it.
- `config/variants.json`: extra public versions of each team, e.g. No LTMs or Evos.

<details>
<summary>📄 <code>week.json</code> example</summary>

```json
{
  "week": "2026-11-09",
  "myclub": [
    {"key": "82", "cap": 82,
     "boosts": [{"on": "league", "id": 31, "att": 1, "ctl": 1, "def": 1}],
     "bonuses": [{"kind": "same_nation", "max": 2, "att": 0, "ctl": 2, "def": 0}],
     "opponents": [["id123", "id456", "... 11 card ids"]]}
  ],
  "sim": [
    {"key": "88", "cap": 88, "boosts": [{"on": "club", "id": 10, "att": 0, "ctl": 3, "def": 1}]}
  ]
}
```

- **Boosts** apply to a `nation`, `league`, `club` or card type (`color`).
- **Bonuses** need the whole squad to qualify: `nations`, `leagues`, `clubs`, `types`, `specials`, or `same_nation` / `same_league` / `same_club` (e.g. Max 2 from the same nation).

</details>

## Game Rules Used

**My Club:** 11 cards each, sides take turns to lead. The leader picks a card and a stat. Attack is answered by defence, defence by attack, control by control. A tied stat goes to the higher card total, and a full tie scores nothing. Every card plays once over 10 rounds. The 11th card plays the tiebreak: if the score is level or 1 apart, a card total more than 5 higher wins a point.

**Chem:** league 3/5/8, nation 2/5/8, club 2/4/7, max 3 per player. Icons, Heroes and Hall of FUT are always full chem. Icons add to every league and Heroes count for their nation and league. Squad Foundations count double for their league, and World POTM double for their club and nation. Chem changes every stat by −3, 0, +1 or +2.

**SBC chem:** Icons +2 nation and +1 every league, Heroes +1 nation and +2 league.

## Run It Yourself 🛠️

```bash
pip install -r requirements.txt
python scripts/update_data.py          # download cards
python scripts/build.py sim 88         # one Sim series
python scripts/build.py myclub 82 30   # one My Club series, 30 minutes
python scripts/build.py index
cd docs && python -m http.server       # site on http://localhost:8000
```
