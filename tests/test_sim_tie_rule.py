"""Owner's tie rule (Sim): two cards with the same in-game value in their slot's stat -> the higher total wins.
His example: +2 attack boost on Red cards. Red 90/79/41 (in game 94/81/43), Blue 92/81/47 (94/83/49),
Green 92/81/48 (94/83/50). All 94 attack, so Green (highest total) must be picked."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fatal.sim as S
from fatal.core import load_cards, FORMATIONS, effective


def test_green_a():
    key = "88"
    w = json.load(open(os.path.join(os.path.dirname(__file__), "..", "config", "week.json")))
    series = dict(next(x for x in w["sim"] if x["key"] == key)); series.pop("opponents", None)
    site = json.load(open(os.path.join(os.path.dirname(__file__), "..", "docs", "results", f"sim_{key}.json")))["teams"][0]
    byid = {c["id"]: c for c in load_cards()}
    team = [byid[p["id"]] for p in site["players"]]
    slots = FORMATIONS[site["formation"]]
    i = next(k for k, s in enumerate(slots) if s == "ST")
    st = team[i]
    def clone(tag, color, a, c, d):
        x = dict(st, id=f"test_{tag}", name=f"{tag} A", color=color, rating=st["rating"])
        x["attack"], x["control"], x["defense"] = a, c, d
        return x
    series = dict(series, boosts=list(series.get("boosts", [])) + [{"on": "color", "id": "testred", "att": 2, "ctl": 0, "def": 0}])
    red = clone("Red", "testred", 90, 79, 41); blue = clone("Blue", "testblue", 92, 81, 47); green = clone("Green", "testgreen", 92, 81, 48)
    team[i] = red
    pool = S._pool(series, [red, blue, green] + [c for c in team if c is not red])
    byp = {c["id"]: c for c in pool}
    t = [byp[c["id"]] for c in team]
    E, _ = effective(t, series)
    assert E[i][0] == effective([byp["test_Green"] if k == i else c for k, c in enumerate(t)], series)[0][i][0], "same attack in game"
    out = S.tie_cleanup(t, slots, series, pool)
    assert out[i]["id"] == "test_Green", out[i]["name"]


if __name__ == "__main__":
    test_green_a(); print("ok: Green A")
