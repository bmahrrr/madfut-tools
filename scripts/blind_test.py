"""Blind test: build a Sim series without the Reddit team or the current site team, then compare with both.
python scripts/blind_test.py KEY [rule|match]  ->  blindtest/results/<mode>/<KEY>.txt
"""
import json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
key, mode = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "rule")
if mode == "match": os.environ["SIM_TB"] = "match"
sys.path.insert(0, ROOT)
import fatal.sim as S
from fatal.core import load_cards, FORMATIONS

# WEEK_FILE / RES_DIR: test a past week from the Vault (its setup, its cards, its published teams)
w = json.load(open(os.path.join(ROOT, os.environ.get("WEEK_FILE") or os.path.join("config", "week.json"))))
RES = os.path.join(ROOT, os.environ.get("RES_DIR") or os.path.join("docs", "results"))
TAG = os.environ.get("TEST_TAG") or "current"
full = next(x for x in w["sim"] if x["key"] == key)
s = dict(full); s.pop("opponents", None)
cards = [c for c in load_cards() if c.get("owned", True)]
t0 = time.time()
team = S.build_sim(s, cards, refs=[], n_reddit=0, log=lambda *a: None)[0]
secs = round(time.time() - t0)
by = {c["id"]: c for c in S._pool(s, load_cards())}
me = S._side([by[p["id"]] for p in team["players"]], FORMATIONS[team["formation"]], s)
out = [f"{TAG} {key} {mode} blind build {secs}s {team['formation']}"]
m = team["metrics"]
out.append(f"control {m['control']} attack {m['attack']} defence {m['defence']} chem {m['chem']}")
out += [f"  {p['slot']:4} {p['name']} {p['rating']} {p['eff']}" for p in team["players"]]
def vs(label, form, ids):
    try:
        o = S._side([by[i] for i in ids], FORMATIONS[form], s)
    except KeyError:
        out.append(f"vs {label}: cards missing"); return
    e = S.evaluate([by[i] for i in ids], FORMATIONS[form], s)
    pc, a, b = S._match(me, o)
    out.append(f"vs {label} ({form}, {e['control']}/{e['attack']}/{e['defence']}): blind scores {a*100:.1f}%, they score {b*100:.1f}%, control {pc*100:.0f}%")
try:
    site = json.load(open(os.path.join(RES, f"sim_{key}.json")))["teams"][0]
    vs("site", site["formation"], [p["id"] for p in site["players"]])
    out.append("same as site: " + str({p["id"] for p in site["players"]} == {p["id"] for p in team["players"]}))
except FileNotFoundError:
    out.append("no site team")
if full.get("opponents"): vs("Reddit", full.get("opponent_formation") or "3-4-1-2", full["opponents"][0])
out.append("IDS " + ",".join(p["id"] for p in team["players"]))
os.makedirs(os.path.join(ROOT, "blindtest", "results", TAG, mode), exist_ok=True)
open(os.path.join(ROOT, "blindtest", "results", TAG, mode, f"{key}.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
