"""Blind test for Fatal My Club: build a series WITHOUT the Reddit team, the hand-built team or the site's current team,
then judge it with the exact solver (perfect play, both lead orders) against a realistic field, next to the site team:
  the Reddit team and the site team, plus each of them with one card swapped for the best other card for that position
  (what players field when they lack a card), plus simple "player-built" teams (best cards at full chem).
python scripts/blind_myclub.py KEY [minutes]  ->  blindtest/myclub/<KEY>.txt
"""
import json, os, sys, time
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from fatal.myclub import build_myclub, Pool, pair_score, set_icon_limit, balanced_teams, fits
from fatal.game import play
from fatal.core import load_cards, pid

key = sys.argv[1]; minutes = float(sys.argv[2]) if len(sys.argv) > 2 else 150
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1      # independent searches differ by seed (their own random starts)
w = json.load(open(os.path.join(ROOT, "config", "week.json")))
s = next(x for x in w["myclub"] if x["key"] == key)
allc = load_cards(); by = {c["id"]: c for c in allc}
owned = [c for c in allc if c.get("owned", True)]
s_blind = dict(s); s_blind.pop("opponents", None)
t0 = time.time()
final = os.environ.get("MC_FINAL") == "1"
if final:
    # the final round: the three searches' teams are the starting points AND the opponents (no Reddit team): one more
    # search improves the best of them against the other two, like the next night's search does on the site
    starts = []
    for f in (f"{key}.txt", f"{key}-s2.txt", f"{key}-s3.txt"):
        q = os.path.join(ROOT, "blindtest", "myclub", f)
        if os.path.exists(q):
            ids = next(l[4:] for l in open(q).read().splitlines() if l.startswith("IDS")).split(",")
            if all(i in by for i in ids): starts.append([by[i] for i in ids])
    team = build_myclub(s_blind, owned, allc, opponents=starts, minutes=minutes, mode="robust", seed=seed + 50, verify=3, candidates=[(f"search {i + 1}", t) for i, t in enumerate(starts)], log=lambda *a: None)
else:
    team = build_myclub(s_blind, owned, allc, opponents=[], minutes=minutes, mode="robust", seed=seed, verify=3, candidates=[], log=lambda *a: None)
secs = round(time.time() - t0)
set_icon_limit(s)
P = Pool(s, allc); pc = {c["id"]: c for c in P.cards}
blind = [pc[p["id"]] for p in team["players"]]
site_d = json.load(open(os.path.join(ROOT, "docs", "results", f"myclub_{key}.json")))
site = [pc[p["id"]] for p in site_d["team"]["players"] if p["id"] in pc]
reddit = [[pc[i] for i in ids if i in pc] for ids in s.get("opponents", [])]
reddit = [r for r in reddit if len(r) == 11]

def variants(tm, n=11):       # each card swapped for the best other card that can play that position (not already in)
    out = []
    for i, c in enumerate(tm):
        used = {pid(x) for j, x in enumerate(tm) if j != i}
        alt = [x for x in P.pos_top.get(c["position"], []) if pid(x) not in used and x["id"] != c["id"]]
        alt.sort(key=lambda x: -x["T3"])
        for x in alt:
            t2 = tm[:i] + [x] + tm[i + 1:]
            if fits(t2): out.append(t2); break
    return out[:n]

field = [("Reddit team", r) for r in reddit] + [("Site team", site)]
for lab, base in list(field):
    for k, v in enumerate(variants(base)): field.append((f"{lab} swap {k+1}", v))
try:
    for k, b in enumerate(balanced_teams(P, s, seconds=300)): field.append((f"player-built {k+1}", b))
except Exception as e:
    print("no player-built teams:", e)

lab = {1: "W", 0: "D", -1: "L"}
def judge(tm):
    E = P.eff(tm); rows = []; worst = 99; wins = losses = 0
    for name, O in field:
        EO = P.eff(O); a, b = play(E, EO, 0)[0], play(E, EO, 1)[0]
        sc = pair_score(a, b); worst = min(worst, sc); wins += (a > 0) + (b > 0); losses += (a < 0) + (b < 0)
        rows.append((name, lab[a] + lab[b]))
    return worst, wins, losses, rows
bw, bwin, bloss, brows = judge(blind)
sw, swin, sloss, srows = judge(site)
Eb, Es = P.eff(blind), P.eff(site)
h2h = lab[play(Eb, Es, 0)[0]] + lab[play(Eb, Es, 1)[0]]
same = sorted(c["id"] for c in blind) == sorted(c["id"] for c in site)
out = [f"myclub {key} blind build {secs}s {minutes:g} min {team.get('formation')} chem {team.get('chem')}"]
out += [f"  {p.get('slot', ''):4} {p['name']} {p['rating']} {p.get('eff', '')}" for p in team["players"]]
out.append(f"same cards as site: {same}")
out.append(f"blind vs site head to head (you lead, they lead): {h2h}")
for r in reddit:
    Er = P.eff(r); out.append(f"blind vs Reddit: {lab[play(Eb, Er, 0)[0]]}{lab[play(Eb, Er, 1)[0]]} | site vs Reddit: {lab[play(Es, Er, 0)[0]]}{lab[play(Es, Er, 1)[0]]}")
out.append(f"field of {len(field)}: blind worst {bw} wins {bwin} losses {bloss} | site worst {sw} wins {swin} losses {sloss}")
out.append("field results (blind / site): " + "; ".join(f"{n} {a}/{b}" for (n, a), (_, b) in zip(brows, srows)))
out.append("IDS " + ",".join(c["id"] for c in blind))
os.makedirs(os.path.join(ROOT, "blindtest", "myclub"), exist_ok=True)
open(os.path.join(ROOT, "blindtest", "myclub", f"{key}" + ("-final" if final else f"-s{seed}" if len(sys.argv) > 3 else "") + ".txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
