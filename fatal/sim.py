"""FATAL Sim team builder.

Priority (as agreed): the highest possible Control in every control position (LM, LW, RM, RW,
CAM, CM, CDM, LB, RB), all on full chem; then the best Attack (ST, CAM, wingers, wide mids, full-backs);
then the best Defence (full backs, CDM, CB, GK).
"""
import time
from .core import (CTRL, ATT, DEF, AUTO, full_chem, FORMATIONS, SIM_FORMATIONS, boosted, effective, describe, pid, is_special)
from .milp import build
from .par import pmap

import itertools

# Fatal Sim (confirmed by the Reddit team maker): attackers are LM/LW, RM/RW, CAM and ST (full-backs never attack);
# defenders are CB, LB/RB, GK and CDM. Each possession 3 control cards are picked; the attack needs 3 cards that were
# not picked for control. When fewer than 3 natural attackers are left (always in 5-3-2), the game fills the attack
# with the cards whose MAIN position is most attacking (CM first, then CDM, ...), wherever they are played.
FILL = [{"ST", "CF"}, {"LW", "RW"}, {"CAM"}, {"LM", "RM"}, {"CM"}, {"CDM"}, {"LB", "RB"}, {"CB"}, {"GK"}]


def attack_weights(slots, mainpos):
    """Chance that each of the 11 cards is the attacker in a possession (sums to 1)."""
    n = len(slots)
    N = [i for i, s in enumerate(slots) if s in ATT]
    C = [i for i, s in enumerate(slots) if s in CTRL]
    picks = list(itertools.combinations(C, 3)) if len(C) >= 3 else [tuple(C)]
    w = [0.0] * n
    for P in picks:
        avail = [i for i in N if i not in P]
        if len(avail) >= 3:
            for i in avail: w[i] += 1 / len(avail)
            continue
        for i in avail: w[i] += 1 / 3
        need = 3 - len(avail)
        rest = [i for i in range(n) if i not in P and i not in avail]
        for lvl in FILL:
            if need <= 0: break
            g = [i for i in rest if mainpos[i] in lvl]
            if not g: continue
            share = min(need, len(g)) / len(g)
            for i in g: w[i] += share / 3
            need -= min(need, len(g))
    return [x / len(picks) for x in w]


def _pool(series, cards):
    pool = []
    for c in cards:
        if c["rating"] > series["cap"]:
            continue
        a, k, d = boosted(c, series.get("boosts", []))
        c = dict(c); c["A"], c["C"], c["D"] = a, k, d; c["_i"] = len(pool)
        pool.append(c)
    return pool


OPP = None      # profile of the strongest teams in the series (set by build_sim): what our team plays against
MAXA = None     # the highest in-game attack any card in the series can reach (set by build_sim)
FIELD = None    # the strongest teams found (set by build_sim), as match sides: the simulated-match tie-break plays each
MATCH_TB = __import__("os").environ.get("SIM_TB") == "match"     # test: after control, rank by simulated matches vs FIELD
REDDIT = []     # the Reddit teams in every Sim formation they fit (set by build_sim): a team must not lose to them


def _match(A, B):
    """Head-to-head, like the site's simMatch. A, B: dicts with slots, mainpos, E (a, c, d, total) per card.
    Returns (control chance for A, goal chance for A, goal chance for B) per possession."""
    def tb(x, y):
        c = lambda u, v: 1 if u > v else 0.5 if u == v else 0
        return (c(x[0], y[0]) + c(x[2], y[2]) + c(x[0] + x[1] + x[2], y[0] + y[1] + y[2])) / 3
    C1 = [A["E"][i] for i, s in enumerate(A["slots"]) if s in CTRL]; C2 = [B["E"][i] for i, s in enumerate(B["slots"]) if s in CTRL]
    D1 = [A["E"][i] for i, s in enumerate(A["slots"]) if s in DEF]; D2 = [B["E"][i] for i, s in enumerate(B["slots"]) if s in DEF]
    if not C1 or not C2: return 0.5, 0, 0
    pc = sum((1 if x[1] > y[1] else 0) if x[1] != y[1] else tb(x, y) for x in C1 for y in C2) / (len(C1) * len(C2))
    def pa(T, D):
        s = 0.0
        for i, w in enumerate(T["W"]):
            if not w or not D: continue
            x = T["E"][i]
            s += w * sum((1 if x[0] > y[2] else 0) if x[0] != y[2] else tb(x, y) for y in D) / len(D)
        return s
    return pc, pc * pa(A, D2), (1 - pc) * pa(B, D1)


def _side(sq, slots, series, E=None):
    if E is None: E, _ = effective(sq, series)
    return {"slots": slots, "E": [tuple(e[:3]) for e in E], "W": attack_weights(slots, [x["position"] for x in sq])}


def set_reddit(refs, series):
    """Every Reddit team in every Sim formation it fits (cards placed in their listed order, GK first): each team we
    consider is played against all of them, and the one that does best against it counts."""
    global REDDIT
    REDDIT = []
    for ref in refs or []:
        groups = []
        E, _ = effective(ref, series)
        for f in SIM_FORMATIONS:
            slots = FORMATIONS[f]; used = set(); order = []
            for sl in slots:
                i = next((j for j, c in enumerate(ref) if j not in used and sl in c["P"]), None)
                if i is None: order = None; break
                used.add(i); order.append(i)
            if order: groups.append(_side([ref[i] for i in order], slots, series, [E[i] for i in order]))
        if groups: REDDIT.append(groups)


def vs_reddit(sq, slots, series, E=None):
    """Worst goal-chance margin (ours minus theirs) against any Reddit team in its best formation; None if none."""
    if not REDDIT: return None
    me = _side(sq, slots, series, E)
    worst = None
    for groups in REDDIT:
        m = min(a - b for _, a, b in (_match(me, g) for g in groups))
        worst = m if worst is None else min(worst, m)
    return round(worst, 4)


def _beat(x, ys):
    """Chance x beats a random value from ys = [(value, weight)] (a tie counts half)."""
    return sum(w * (1 if x > y else 0.5 if x == y else 0) for y, w in ys)


def opp_profile(teams):
    """teams: [(team, slots, series)]. Their control, attack (weighted by who attacks) and defence values."""
    C, A, D, CF = [], [], [], []
    n = len(teams)
    for team, slots, series in teams:
        E, _ = effective(team, series)
        W = attack_weights(slots, [x["position"] for x in team])
        ci = [i for i, s in enumerate(slots) if s in CTRL]; di = [i for i, s in enumerate(slots) if s in DEF]
        C += [(E[i][1], 1 / (n * len(ci))) for i in ci]
        CF += [(tuple(E[i][:3]), 1 / (n * len(ci))) for i in ci]
        D += [(E[i][2], 1 / (n * len(di))) for i in di]
        A += [(E[i][0], W[i] / n) for i in range(len(slots)) if W[i] > 0]
    return {"C": C, "A": A, "D": D, "CF": CF}


def evaluate(team, slots, series):
    E, ch = effective(team, series)
    C = [E[i][1] for i, s in enumerate(slots) if s in CTRL]
    CT = sum(E[i][0] + E[i][1] + E[i][2] for i, s in enumerate(slots) if s in CTRL)   # control duels tie -> total stats
    W = attack_weights(slots, [x["position"] for x in team])
    A = [E[i][0] for i in range(len(slots)) if W[i] > 0]
    D = [E[i][2] for i, s in enumerate(slots) if s in DEF]
    att_exp = sum(W[i] * E[i][0] for i in range(len(slots)))                     # expected attack of the attacker
    AT = sum(W[i] * (E[i][0] + E[i][1] + E[i][2]) for i in range(len(slots)))     # attack duels tie -> total stats
    DT = sum(E[i][0] + E[i][1] + E[i][2] for i, s in enumerate(slots) if s in DEF)
    bad = sum(1 for i, s in enumerate(slots) if s in CTRL and ch[i] < 3)
    # quality check (owner): a card that attacks in 5%+ of possessions should have in-game attack of at least
    # cap - 1 (79 in the 80 series, 89 in the 90). Control decides, but never at the cost of a striker who can't
    # score. Teams that reach it rank above all that don't; if none can, the smallest shortfall wins.
    # X has no real cap (99): a 98 floor would rank attack above control there. No floor in X until the owner sets one.
    floor = series.get("attack_floor", 0 if str(series.get("key")) == "X" else series.get("cap", 0) - 1)
    weak = [team[i]["name"] for i in range(len(slots)) if W[i] >= 0.05 and E[i][0] < floor]
    short = round(sum(W[i] * (floor - E[i][0]) for i in range(len(slots)) if W[i] >= 0.05 and E[i][0] < floor), 3)
    m = lambda v: sum(v) / len(v) if v else 0
    net = None; p_att = p_def = None; ctrl_win = None
    if OPP:          # how it actually plays against the strongest teams: we win control, then score; or they score
        di = [i for i, s in enumerate(slots) if s in DEF]
        h = m([_beat(c, OPP["C"]) for c in C])
        def _cduel(x, y):
            if x[1] != y[1]: return 1 if x[1] > y[1] else 0
            c = lambda u, v: 1 if u > v else 0.5 if u == v else 0
            return (c(x[0], y[0]) + c(x[2], y[2]) + c(sum(x), sum(y))) / 3
        ctrl_win = round(m([sum(w * _cduel(tuple(E[i][:3]), y) for y, w in OPP["CF"]) for i, s in enumerate(slots) if s in CTRL]), 4)
        f = sum(W[i] * _beat(E[i][0], OPP["D"]) for i in range(len(slots)) if W[i] > 0)
        g = m([1 - _beat(E[i][2], OPP["A"]) for i in di])
        net = round(h * f - (1 - h) * g, 4)
        p_att, p_def = round(f, 4), round(1 - g, 4)     # chance our shooter beats a strong defender / our defender stops a strong attacker
    vr = vs_reddit(team, slots, series, E)
    h2h = None
    if FIELD:        # average goal-chance margin per possession against the strongest teams found
        me = _side(team, slots, series, E)
        h2h = round(sum(a - b for _, a, b in (_match(me, f) for f in FIELD)) / len(FIELD), 5)
    return {"h2h": h2h, "ctrl_win": ctrl_win, "control": round(m(C), 2), "attack": round(att_exp, 2), "defence": round(m(D), 2), "net": net, "vs_reddit": vr,
            "control_cards": sorted(C, reverse=True), "attack_cards": sorted(A, reverse=True),
            "defence_cards": sorted(D, reverse=True), "p_att": p_att, "p_def": p_def, "chem": sum(ch), "ctrl_not_full": bad, "def_unbeatable": bool(MAXA) and all(E[i][2] > MAXA for i, s in enumerate(slots) if s in DEF), "weak_attackers": weak, "attack_short": short,
            "ctrl_total": round(CT / len(C), 2) if C else 0,
            "att_total": round(AT, 2), "def_total": round(DT / len(D), 2) if D else 0}


def rank_key(ev):
    """Owner's order: highest Control; then Attack before Defence. A small defence
    gain never beats an attack gain: defence only counts a third as much (a 1-point attack gain beats up to a 3-point
    defence loss, so a tiny attack gain can't cost a big defence drop). Then Attack, its total, Defence, its total,
    match strength against the strongest teams, chem."""
    a, d = ev["attack"], ev["defence"]
    if MATCH_TB and ev.get("h2h") is not None:     # test: control, then simulated matches, then attack, defence
        return (round(ev["control"], 2), ev["h2h"], round(a + d / 3, 2), round(a, 2), round(ev.get("att_total", 0), 2),
                round(d, 2), round(ev.get("def_total", 0), 2), ev["chem"])
    # attack and defence are judged by the chance to beat the strongest teams' real defenders / attackers (a 66 and a
    # 68 striker are equally useless if strong defences are 70); without that profile, by their average values
    pa, pd = ev.get("p_att"), ev.get("p_def")
    # Owner's tie rule is per card (same control -> higher total plays, see tie_cleanup); the control cards' team total
    # only splits teams equal on everything else. Ranked above attack it picked high-total control over better strikers (73).
    # control duels won (the game's tiebreak on tied control) only after attack and defence: ranked straight after
    # control, a 0.5% edge there beat a 10-point defence gap (80)
    if pa is not None: return (round(ev["control"], 2), round(pa + pd / 3, 4), round(pa, 4),
                               round(a + d / 3, 2), round(a, 2), round(ev.get("att_total", 0), 2), round(d, 2), round(ev.get("def_total", 0), 2),
                               ev.get("ctrl_win") or 0, round(ev.get("ctrl_total", 0), 2), ev.get("net") if ev.get("net") is not None else -9, ev["chem"])
    return (round(ev["control"], 2), round(a + d / 3, 2),
            round(a, 2), round(ev.get("att_total", 0), 2), round(d, 2), round(ev.get("def_total", 0), 2),
            round(ev.get("ctrl_total", 0), 2), ev.get("net") if ev.get("net") is not None else -9, ev["chem"])


def sim_key(ev):
    """Teams with every control card on full chem first; then never a team that loses to the Reddit team head to head
    (most players copy it: any team at least level with it ranks above every team that loses to it, and among
    losing teams the smaller loss wins); then rank_key."""
    # Owner: when boosts make an unbeatable defence possible (every defender above any attack in the series, e.g. the
    # Arsenal boost in 88), use it; the rest of the team fills in around it. Rare, boost-dependent.
    vr = ev.get("vs_reddit")
    return (ev["ctrl_not_full"] == 0, ev.get("def_unbeatable", False), -ev.get("attack_short", 0), min(vr, 0) if vr is not None else 0, rank_key(ev))


def tie_cleanup(team, slots, series, pool, log=None):
    """Owner's rule: when two cards give the same value in the stat their slot uses (control in control slots, else
    attack, else defence), play the one with the higher total; still level, the higher control. Only when every other
    card keeps exactly the same in-game stats (a swap that breaks a chem link is never made)."""
    team = list(team)
    role = lambda s: 1 if s in CTRL else 0 if s in ATT else 2
    changed = True
    while changed:
        changed = False
        E, _ = effective(team, series)
        for i, sl in enumerate(slots):
            r = role(sl); used = {pid(x) for k, x in enumerate(team) if k != i}
            cur = (E[i][0] + E[i][1] + E[i][2], E[i][1])
            short0 = evaluate(team, slots, series)["attack_short"]
            best = None
            for c in pool:
                if sl not in c["P"] or c["id"] == team[i]["id"] or pid(c) in used: continue
                trial = team[:i] + [c] + team[i + 1:]
                E2, _ = effective(trial, series)
                if E2[i][r] != E[i][r] or any(E2[k][:3] != E[k][:3] for k in range(len(team)) if k != i): continue
                v = (E2[i][0] + E2[i][1] + E2[i][2], E2[i][1])
                if v > cur and (best is None or v > best[0]):
                    # never a swap that puts an attacker under the attack floor (89: Abedi Pelé -> Sneijder, 87 attack)
                    if evaluate(trial, slots, series)["attack_short"] > short0: continue
                    best = (v, c)
            if best:
                if log: log(f"  tie rule: {team[i]['name']} -> {best[1]['name']} at {sl} (same {['attack', 'control', 'defence'][r]}, higher total)")
                team[i] = best[1]; changed = True; E, _ = effective(team, series)
    return team


def exact_line(team, slots, series, pool, grp, per_slot=20, seconds=150, links=0):
    """Every combination of likely cards for the slots in grp (back line or strikers), the rest of the team fixed, judged
    exactly (real chem, full ranking). Likely cards: the current ones, the best by the slot's stat, and the best few that
    share a club, or a nation and league, with the team. Returns (slots, team) if a better line is found, else None."""
    t0 = time.time()
    idx = [i for i, sl in enumerate(slots) if sl in grp]
    if not idx: return None
    att = bool(set(slots[i] for i in idx) & ATT)
    st = (lambda x: x["A"]) if att else (lambda x: x["D"])
    rest = [team[i] for i in range(len(slots)) if i not in idx]
    keys = {c["clubId"] for c in team} | {(c["nationId"], c["leagueId"]) for c in team}
    used = {pid(c) for c in rest}
    pools = {}
    for sl in {slots[i] for i in idx}:
        el = [x for x in pool if sl in x["P"] and pid(x) not in used]
        pick = {x["id"]: x for x in sorted(el, key=lambda x: -st(x))[:per_slot // 3]}
        # link cards, teammates first (a club link is the strongest), however low their stats
        clubs = {c["clubId"] for c in team}; nl = {(c["nationId"], c["leagueId"]) for c in team}
        by = {}
        for x in el:
            for k in (x["clubId"], (x["nationId"], x["leagueId"])):
                if k in keys: by.setdefault(k, []).append(x)
        extra = sorted({x["id"]: x for L in by.values() for x in sorted(L, key=lambda x: -st(x))[:3]}.values(),
                       key=lambda x: (-(x["clubId"] in clubs), -((x["nationId"], x["leagueId"]) in nl), -st(x)))
        for x in extra:
            if len(pick) >= per_slot: break
            pick[x["id"]] = x
        # cards that link with the most of the rest of the team (club counts double), however they link: a card
        # sharing only a nation with one and a league with three (81: Pau Torres) is not a club / nation+league card
        if links:
            score = lambda x: sum(2 * (x["clubId"] == c["clubId"]) + (x["nationId"] == c["nationId"]) + (x["leagueId"] == c["leagueId"]) for c in rest)
            for x in sorted(el, key=lambda x: (-score(x), -st(x)))[:links]: pick[x["id"]] = x
        for i in idx:
            if slots[i] == sl: pick[team[i]["id"]] = team[i]
        pools[sl] = list(pick.values())
    order = sorted(set(slots[i] for i in idx))
    n_of = {sl: sum(1 for i in idx if slots[i] == sl) for sl in order}
    best = sim_key(evaluate(team, slots, series)); best_team = None
    def combos(k, chosen, usedp):
        if k == len(order):
            yield chosen; return
        sl = order[k]
        for comb in itertools.combinations(pools[sl], n_of[sl]):
            ps = [pid(x) for x in comb]
            if len(set(ps)) < len(ps) or any(p in usedp for p in ps): continue
            yield from combos(k + 1, chosen + [(sl, comb)], usedp | set(ps))
    for ch in combos(0, [], set()):
        if time.time() - t0 > seconds: break
        it = {sl: list(comb) for sl, comb in ch}
        trial = [it[slots[i]].pop(0) if i in idx else team[i] for i in range(len(slots))]
        k = sim_key(evaluate(trial, slots, series))
        if k > best: best, best_team = k, trial
    return (slots, best_team) if best_team else None


def resolve_line(form, sq, idx, series, pool, excl=(), time_limit=60):
    """Solve the slots idx again (back line, strikers, or both at once), the rest of the team fixed, every card in the
    series allowed there (chem counted, control cards kept on full chem), valued by duels against the strongest teams
    (OPP). Both at once finds packages neither alone can: 81's Lucas Vázquez needs Quansah and Pau Torres behind him
    AND Beier up front to stay on full chem."""
    bA = lambda x: _beat(x, OPP["D"]) * 100; bD = lambda x: _beat(x, OPP["A"]) * 100
    slots = FORMATIONS[form]
    fixed = {sq[i]["_i"]: slots[i] for i in range(len(slots)) if i not in idx}
    gs = {slots[i] for i in idx}
    keys = {(c["clubId"]) for c in sq} | {(c["nationId"], c["leagueId"]) for c in sq}
    cand = {}
    for sl in gs:
        el = [x for x in pool if sl in x["P"] and x["_i"] not in fixed]
        st = (lambda x: x["A"]) if sl in ATT else (lambda x: x["D"])
        for x in sorted(el, key=lambda x: -st(x))[:150]: cand[x["_i"]] = x
        by = {}
        for x in el:
            for k in (x["clubId"], (x["nationId"], x["leagueId"])):
                if k in keys: by.setdefault(k, []).append(x)
        for L in by.values():
            for x in sorted(L, key=lambda x: -st(x))[:6]: cand[x["_i"]] = x
    cards = [pool[i] for i in fixed] + list(cand.values())
    nD = max(1, sum(1 for x in slots if x in DEF)); wD = 100 / (3 * nD)
    sw = attack_weights(slots, list(slots)); slot_w = {}
    for k2, sl in enumerate(slots): slot_w[sl] = max(slot_w.get(sl, 0), sw[k2])
    def value(c, s):
        if c["_i"] in fixed: return 1e7 if fixed[c["_i"]] == s else None
        if s not in gs: return None
        T = c["A"] + c["C"] + c["D"]
        return (100 * slot_w.get(s, 0.2) * (bA(c["A"] - 3) + T / 400)) if s in ATT else (wD * (bD(c["D"] - 3) + T / 400))
    def chem_w(c, s):
        if s in gs: return (100 * slot_w.get(s, 0.2) * (bA(c["A"] + 2) - bA(c["A"] - 3)) / 3) if s in ATT else (wD * (bD(c["D"] + 2) - bD(c["D"] - 3)) / 3)
        return 0.01 + (100 * slot_w.get(s, 0.2) * (bA(c["A"] + 2) - bA(c["A"] - 3)) / 3 if s in ATT else 0) + (wD * (bD(c["D"] + 2) - bD(c["D"] - 3)) / 3 if s in DEF else 0)
    nsq = build(cards, slots, value, chem_weight=chem_w, force_full=lambda c, s: s in CTRL and not full_chem(c), time_limit=time_limit,
                exclude_pids=excl)
    return (evaluate(nsq, slots, series), form, nsq) if nsq else None


def control_variants(results, series, pool, n_teams=4, per_slot=5):
    """The best teams with one control card swapped for another that reaches the same control (at full chem). The new
    card's links can allow a much better back line or strikers (81: Lucas Vázquez instead of Yassine at the same 85
    control lets Pau Torres and Quansah in). Highest totals first (the owner's tie rule)."""
    seen, base = set(), []
    for ev, form, sq in results:
        sg = (form, frozenset(c["id"] for c in sq))
        if sg in seen: continue
        seen.add(sg); base.append((form, sq))
        if len(base) == n_teams: break
    out, vs = [], set()
    for form, sq in base:
        slots = FORMATIONS[form]; E, _ = effective(sq, series)
        for i, sl in enumerate(slots):
            if sl not in CTRL: continue
            used = {pid(x) for k, x in enumerate(sq) if k != i}
            el = [c for c in pool if sl in c["P"] and c["id"] != sq[i]["id"] and pid(c) not in used and c["C"] + 2 >= E[i][1]]
            for c in sorted(el, key=lambda c: -(c["A"] + c["C"] + c["D"]))[:per_slot]:
                v = sq[:i] + [c] + sq[i + 1:]
                sg = (form, frozenset(x["id"] for x in v))
                if sg not in vs: vs.add(sg); out.append((form, v))
    return out


def variant_line(form, sq, series, pool, seconds=40):
    """A control variant: its back line and strikers solved together around it, then checked exactly (smaller lists)."""
    slots = FORMATIONS[form]
    r = resolve_line(form, sq, [i for i, sl in enumerate(slots) if sl in ("GK", "CB", "ST", "CF")], series, pool)
    if r: sq = r[2]
    for grp in ({"GK", "CB"}, {"ST", "CF"}):
        r = exact_line(sq, slots, series, pool, grp, per_slot=12, seconds=seconds / 2, links=8)
        if r: sq = r[1]
    return (evaluate(sq, slots, series), form, sq)


def polish(team, slots, series, pool, seconds=60, stats=None):
    """Swap one card at a time for ANY card in the series (every rating, every link) while the team gets better.
    Catches what the shortlist misses, e.g. a 55 link card that lets a better control card on full chem."""
    t0 = time.time()
    cand = {s: [c for c in pool if s in c["P"]] for s in set(slots)}
    team = list(team); best = sim_key(evaluate(team, slots, series))
    improved = True
    while improved and time.time() - t0 < seconds:
        improved = False
        for i in range(len(slots)):
            used = {pid(x) for k, x in enumerate(team) if k != i}
            for c in cand[slots[i]]:
                if c["id"] == team[i]["id"] or pid(c) in used:
                    continue
                trial = team[:i] + [c] + team[i + 1:]
                k = sim_key(evaluate(trial, slots, series))
                if stats is not None: stats["checked"] = stats.get("checked", 0) + 1
                if k > best:
                    team, best, improved = trial, k, True
                    used = {pid(x) for kk, x in enumerate(team) if kk != i}
            if time.time() - t0 > seconds:
                break
    return team


def build_sim(series, cards, formations=None, margin=4, topk=20, time_limit=200, log=print, refs=(), polish_seconds=90, n_reddit=None):
    """refs: Reddit teams (lists of cards). Each is tried in every formation, and the best teams found (theirs and
    ours) are then polished by single-card swaps over the whole series, so the result is never worse than theirs."""
    """margin: control-position shortlist = every card within `margin` control of the best (2 was too narrow:
    it missed Beste at LM in the 77 series)."""
    formations = formations or series.get("formations") or SIM_FORMATIONS
    pool = _pool(series, cards)
    _byid = {c["id"]: c for c in pool}
    _red = [[_byid.get(c["id"]) for c in r] for r in list(refs or [])[:n_reddit if n_reddit is not None else len(refs or [])]]
    set_reddit([r for r in _red if all(r)], series)
    maxC = max(x["C"] for x in pool if x["P"] & CTRL)
    # an unbeatable defence: every defender's defence (at full chem) above the best attack anyone can field
    global MAXA
    MAXA = max(x["A"] for x in pool if x["P"] & ATT) + 2
    UNB = {x["_i"] for x in pool if x["D"] + 2 > MAXA}
    # candidate lists of three sizes, all solved, the best team kept: a short list lets the solver finish (68 needed it:
    # 8,000 cards hit the time limit with weak teams) but can miss a card a wider list has (73 and 86 lost attack)
    CONFIGS = ((margin, topk, 2, 2), (margin + 2, topk * 3, 4, 3), (margin + 4, topk * 6, 6, 4))
    cap = series.get("cap", 99)
    floor = series.get("attack_floor", 0 if str(series.get("key")) == "X" else cap - 1)
    results = []
    totals = []           # teams built to favour high-total control cards (they win control tiebreaks): always in the final
    variants = []         # control-variant teams (tied control card + back line and strikers rebuilt): always in the final
    bonus_variants = [{}]
    for b in series.get("bonuses", []):
        k = b["kind"]
        mx = b.get("max")
        def with_bonus(v, k=k, b=b, mx=mx):  # the same build, but forced to earn this bonus
            v = dict(v)
            if k.startswith("same_"):        # "Max 2 from same nation"
                if mx is not None: v["max_same"] = dict(v.get("max_same") or {}, **{k[5:]: mx})
            elif k == "specials":              # "8+ special cards" (or "Max N special cards")
                v["group_rules"] = list(v.get("group_rules") or ()) + [(is_special, "<=" if mx is not None else ">=", mx if mx is not None else b["min"])]
            elif mx is not None:             # "Max 3 clubs": at most that many different
                d = dict(v.get("distinct") or {}); lo = (d.get(k[:-1]) or (None, None))[0]; d[k[:-1]] = (lo, mx); v["distinct"] = d
            elif k == "nations": v["min_nations"] = b["min"]
            elif k == "types": v["min_types"] = b["min"]
            elif k in ("clubs", "leagues"):
                d = dict(v.get("distinct") or {}); d[k[:-1]] = (b["min"], (d.get(k[:-1]) or (None, None))[1]); v["distinct"] = d
            return v
        if k in ("nations", "clubs", "leagues", "specials") or (k == "types" and mx is None) or (k.startswith("same_") and mx is not None):
            bonus_variants = bonus_variants + [with_bonus(v) for v in bonus_variants]
    def job(form, cfg, duel=None):
        """duel: the strongest teams' profile (OPP). Then attack and defence cards are valued by their chance to win
        their duel against those teams, not by raw stats: one 71 defender who stops most strikers beats four 67-70s
        (68: André Moreira's back line over Boevink's, a 3-card change single swaps can't reach)."""
        mg, tk, sm, per = cfg
        slots = FORMATIONS[form]
        cand = set()
        # control slots: within mg of the best control that can play THAT slot (full-backs are control in 5 at the back)
        src = []
        for s in {x for x in slots if x in CTRL}:
            el = [x for x in pool if s in x["P"]]; top = max(x["C"] for x in el)
            cand |= {x["_i"] for x in el if x["C"] >= top - mg}; src += [x for x in el if x["C"] >= top - sm]
        src_club = {x["clubId"] for x in src}; src_nl = {(x["nationId"], x["leagueId"]) for x in src}
        for s in set(slots):
            if s not in CTRL:
                key = (lambda x: x["A"]) if s in ATT else (lambda x: x["D"])
                el = [x for x in pool if s in x["P"]]
                cand |= {x["_i"] for x in sorted(el, key=lambda x: -key(x))[:tk]}
                # link cards: teammates of a top control card, or players with its nation AND league, best few of each,
                # whatever their stats (the Reddit 68 team's GK and CBs are teammates of its control cards).
                # Owner: a link-only card plays defence, never attack: in attack slots it must reach the floor (cap - 1).
                ok = (lambda x: x["A"] >= floor) if s in ATT else (lambda x: True)
                for gk, keep in ((lambda x: x["clubId"], src_club), (lambda x: (x["nationId"], x["leagueId"]), src_nl)):
                    by = {}
                    for x in el:
                        if gk(x) in keep and ok(x): by.setdefault(gk(x), []).append(x)
                    for L in by.values(): cand |= {x["_i"] for x in sorted(L, key=lambda x: -key(x))[:per]}
        cards_f = [pool[i] for i in cand]

        sw = attack_weights(slots, list(slots))
        slot_w = {}
        for k2, sl in enumerate(slots): slot_w[sl] = max(slot_w.get(sl, 0), sw[k2])

        nD = max(1, sum(1 for x in slots if x in DEF))

        def value(c, s):
            # the same order as the final ranking (sim_key): control, then the control cards' totals (control duels
            # tie on totals), then attack, then defence at a third of attack. Before, totals and defence barely counted,
            # so the solver happily took a 65 GK as a link card in the 80 series.
            T = c["A"] + c["C"] + c["D"]
            v = 0
            if s in CTRL: v += 10000 * c["C"] + 0.5 * T     # totals only split equal control (per-card tie rule)
            if s in ATT: v += 100 * slot_w.get(s, 0.2) * (c["A"] + T / 400)
            if s in DEF: v += 100 / (3 * nD) * (c["D"] + T / 400)
            return v

        def chem_w(c, s):
            return (3 if s in ATT else 0) + (1 if s in DEF else 0) + 0.01

        if duel:
            bA = lambda x: _beat(x, duel["D"]) * 100        # % chance an attacker of x beats a strong team's defender
            bD = lambda x: _beat(x, duel["A"]) * 100        # % chance a defender of x stops a strong team's attacker
            wA = lambda s: 100 * slot_w.get(s, 0.2); wD = 100 / (3 * nD)

            def value(c, s):     # at 0 chem (stat - 3); each chem point adds a third of the way to 3 chem (+2)
                T = c["A"] + c["C"] + c["D"]; v = 0
                if s in CTRL: v += 10000 * c["C"] + 0.5 * T
                if s in ATT: v += wA(s) * (bA(c["A"] - 3) + T / 400)
                if s in DEF: v += wD * (bD(c["D"] - 3) + T / 400)
                return v

            def chem_w(c, s):
                return (wA(s) * (bA(c["A"] + 2) - bA(c["A"] - 3)) / 3 if s in ATT else 0) + \
                       (wD * (bD(c["D"] + 2) - bD(c["D"] - 3)) / 3 if s in DEF else 0) + 0.01

        def full(c, s):
            return s in CTRL and not full_chem(c)

        return slots, cards_f, value, chem_w, full

    # every (formation, bonus) build is independent: run them on all cores at once
    jobs = [(form, job(form, cfg), bv) for form in formations for cfg in CONFIGS for bv in bonus_variants]
    for form in formations:          # boosts allowing it: a build that must field an unbeatable back line
        dslots = [x for x in FORMATIONS[form] if x in DEF and x not in CTRL]
        if all(sum(1 for i in UNB if sl in pool[i]["P"]) >= dslots.count(sl) for sl in set(dslots)) and dslots:
            for cfg in CONFIGS[:2]:
                sl_, cf, val, cw, fu = job(form, cfg)
                val2 = (lambda val: lambda c, s: (None if s in DEF and s not in CTRL and c["_i"] not in UNB else val(c, s)))(val)
                jobs += [(form, (sl_, cf, val2, cw, fu), bv) for bv in bonus_variants]
    def run(i):
        form, (slots, cards_f, value, chem_w, full), bv = jobs[i]
        sq = build(cards_f, slots, value, chem_weight=chem_w, force_full=full, time_limit=time_limit, **bv)
        return (evaluate(sq, slots, series), form, sq, bv) if sq else None
    for r in pmap(run, len(jobs)):
        if not r: continue
        ev, form, sq, bv = r
        results.append((ev, form, sq))
        log(f"  {form} {bv or ''}: control {ev['control']} attack {ev['attack']} defence {ev['defence']}")
    # the field also gets teams built the way other players build: attack first, defence first, balanced. Without them a
    # blind build only measures itself against its own control-first teams and can misjudge (73: it gave up a 78
    # striker for CBs that the real 78-79 strikers beat anyway). They are opponents to judge against, and candidates.
    style_teams = []
    def style_job(i):
        form, style = STYLES[i]
        slots, cards_f, _, chem_w, full = job(form, CONFIGS[1])
        wt = {"attack": (100, 10000, 100), "defence": (100, 100, 10000), "balanced": (100, 100, 100)}[style]
        def value(c, s):
            return (wt[0] * c["C"] if s in CTRL else 0) + (wt[1] * c["A"] if s in ATT else 0) + (wt[2] * c["D"] if s in DEF else 0)
        sq = build(cards_f, slots, value, chem_weight=lambda c, s: 1, force_full=full, time_limit=min(time_limit, 120))
        return (evaluate(sq, slots, series), form, sq) if sq else None
    STYLES = [(f, st) for f in ("3-4-1-2", "3-1-4-2") if f in formations for st in ("attack", "balanced")]
    for r in pmap(style_job, len(STYLES)):
        if r: results.append(r); style_teams.append(r)
    # Reddit teams: their 11 cards placed in each formation (the same program, just on those 11 cards)
    byid = {c["id"]: c for c in pool}
    ref_sigs = set()
    for k, ref in enumerate(refs or []):
        rc = [byid.get(c["id"]) for c in ref]
        if not all(rc):
            log(f"  Reddit team {k+1}: has cards above the cap, skipped"); continue
        for form in formations:
            slots = FORMATIONS[form]
            sq = build(rc, slots, lambda c, s: (1000 * c["C"] if s in CTRL else 0) + (3 * c["A"] if s in ATT else 0) + (c["D"] if s in DEF else 0),
                       time_limit=10)
            if sq:
                ev = evaluate(sq, slots, series); results.append((ev, form, sq)); (ref_sigs.add((form, frozenset(c["id"] for c in sq))) if n_reddit is None or k < n_reddit else None)
                log(f"  Reddit {k+1} as {form}: control {ev['control']} attack {ev['attack']} defence {ev['defence']}")
    # the strongest teams found (Reddit teams included) are what our team is measured against from here on
    global OPP
    OPP = None
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    prof, sigs = [], set()
    for ev, form, sq in results:
        sg = (form, frozenset(c["id"] for c in sq))
        if sg in sigs: continue
        sigs.add(sg); prof.append((sq, FORMATIONS[form], series))
        if sg in ref_sigs: prof += [(sq, FORMATIONS[form], series)] * 2     # Reddit teams count 3x: most players copy them
        if len(sigs) == 6: break
    for ev, form, sq in style_teams:          # other players' styles always in the field
        sg = (form, frozenset(c["id"] for c in sq))
        if sg not in sigs: sigs.add(sg); prof.append((sq, FORMATIONS[form], series))
    global FIELD
    FIELD = None
    if prof:
        OPP = opp_profile(prof)
        FIELD = [_side(sq, sl, sr) for sq, sl, sr in prof] if MATCH_TB else None
        results = [(evaluate(sq, FORMATIONS[form], series), form, sq) for ev, form, sq in results]
    # second pass: the formations of the best teams solved again with attack and defence valued by duels against the
    # strongest teams found (what the ranking measures), short and medium lists
    if OPP:
        seenf, forms2 = set(), []
        for ev, form, sq in sorted(results, key=lambda r: sim_key(r[0]), reverse=True):
            if form not in seenf: seenf.add(form); forms2.append(form)
            if len(forms2) == 3: break
        jobs2 = [(form, job(form, cfg, OPP), bv) for form in forms2 for cfg in CONFIGS[:2] for bv in bonus_variants]
        def run2(i):
            form, (slots, cards_f, value, chem_w, full), bv = jobs2[i]
            sq = build(cards_f, slots, value, chem_weight=chem_w, force_full=full, time_limit=time_limit, **bv)
            return (evaluate(sq, slots, series), form, sq) if sq else None
        for r in pmap(run2, len(jobs2)):
            if r:
                results.append(r); log(f"  duel pass {r[1]}: control {r[0]['control']} attack {r[0]['attack']} defence {r[0]['defence']}")
        # the same formations, with control cards of higher totals strongly preferred among equal control (the game's
        # control tiebreak): 90 lost twice to teams with Rogers and Can over Olise and Heath at the same control
        def run3(i):
            form, (slots, cards_f, value, chem_w, full), bv = jobs2[i]
            v2 = lambda c, s: (None if value(c, s) is None else value(c, s) + (49.5 * (c["A"] + c["C"] + c["D"]) if s in CTRL else 0))
            sq = build(cards_f, slots, v2, chem_weight=chem_w, force_full=full, time_limit=time_limit, **bv)
            return (evaluate(sq, slots, series), form, sq) if sq else None
        for r in pmap(run3, len(jobs2)):
            if r:
                results.append(r); totals.append(r); log(f"  high totals {r[1]}: control {r[0]['control']} attack {r[0]['attack']} defence {r[0]['defence']}")
    # polish the best few by swapping single cards with any card in the series
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    seen, top = set(), []
    for ev, form, sq in results:
        sig = (form, tuple(sorted(c["id"] for c in sq)))
        if sig in seen: continue
        seen.add(sig); top.append((ev, form, sq))
        if len(top) == 6: break
    pol = pmap(lambda i: polish(top[i][2], FORMATIONS[top[i][1]], series, pool, polish_seconds), len(top))
    for (ev, form, sq), p in zip(top, pol):
        slots = FORMATIONS[form]
        pe = evaluate(p, slots, series)
        if sim_key(pe) > sim_key(ev):
            log(f"  polished {form}: control {ev['control']} -> {pe['control']}, attack {ev['attack']} -> {pe['attack']}")
            results.append((pe, form, p))
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    # re-solve the back line, then the strikers, of the best teams: everything else fixed, every card in the series
    # allowed there (chem counted), valued by duels against the strongest teams. Finds 3-card changes single swaps
    # can't (68: André Moreira, Bouland, Ciobotariu instead of Boevink's line).
    if OPP:
        bA = lambda x: _beat(x, OPP["D"]) * 100; bD = lambda x: _beat(x, OPP["A"]) * 100
        seen2, tops = set(), []
        for ev, form, sq in results:
            sg = (form, frozenset(c["id"] for c in sq))
            if sg not in seen2: seen2.add(sg); tops.append((form, sq))
            if len(tops) == 6: break
        rjobs = []
        for t, (form, sq) in enumerate(tops):
            slots = FORMATIONS[form]
            for grp in ({"GK", "CB"}, {"ST", "CF"}):
                idx = [i for i, sl in enumerate(slots) if sl in grp]
                if not idx: continue
                rjobs.append((form, sq, idx, ()))
        def rsolve(j):
            form, sq, idx, excl = rjobs[j]
            return resolve_line(form, sq, idx, series, pool, excl)
        for r in pmap(rsolve, len(rjobs)):
            if r:
                results.append(r); log(f"  re-solve {r[1]}: control {r[0]['control']} attack {r[0]['attack']} defence {r[0]['defence']}")
        results.sort(key=lambda r: sim_key(r[0]), reverse=True)
        # exact check of the back line and the strikers of the best 3 teams: every combination of the likely cards,
        # each judged with real chem and the full ranking (the solver only estimates chem's effect on stats)
        seen3, best3, perf = set(), [], {}
        for ev, form, sq in results:          # the best 2 teams of each of the best 3 formations
            sg = (form, frozenset(c["id"] for c in sq))
            if sg in seen3 or (form not in perf and len(perf) == 3) or perf.get(form, 0) == 2: continue
            seen3.add(sg); best3.append((form, sq)); perf[form] = perf.get(form, 0) + 1
            if len(best3) == 6: break
        xjobs = [(form, sq, grp) for form, sq in best3 for grp in ({"GK", "CB"}, {"ST", "CF"})]
        for r in pmap(lambda j: exact_line(xjobs[j][1], FORMATIONS[xjobs[j][0]], series, pool, xjobs[j][2]), len(xjobs)):
            if r:
                form = xjobs[0][0]
                results.append((evaluate(r[1], r[0], series), next(f for f in FORMATIONS if FORMATIONS[f] == r[0] and f in formations), r[1]))
                log(f"  exact line: control {results[-1][0]['control']} attack {results[-1][0]['attack']} defence {results[-1][0]['defence']}")
        results.sort(key=lambda r: sim_key(r[0]), reverse=True)
        # tied control cards: one control card swapped for an equal one, then the back line and strikers rebuilt around
        # its links (81: Lucas Vázquez for Yassine, then Pau Torres and Quansah)
        vjobs = control_variants(results, series, pool)
        for r in pmap(lambda j: variant_line(vjobs[j][0], vjobs[j][1], series, pool), len(vjobs)):
            if r and sim_key(r[0]) > sim_key(results[0][0]):
                log(f"  control variant {r[1]}: control {r[0]['control']} attack {r[0]['attack']} defence {r[0]['defence']}")
            if r: results.append(r); variants.append(r)
        results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    results = [r for r in results if r[0]["ctrl_not_full"] == 0] or results
    # swap check on the team that will be published: every card in the series tried in every slot until no single
    # swap is better (control, then attack, then defence, each then its total)
    if results:
        ev, form, sq = results[0]; slots = FORMATIONS[form]; st = {}
        p = polish(sq, slots, series, pool, 600, stats=st)
        pe = evaluate(p, slots, series)
        if sim_key(pe) > sim_key(ev):
            log(f"  swap check improved {form}: attack {ev['attack']} -> {pe['attack']}, defence {ev['defence']} -> {pe['defence']}")
            results[0] = (pe, form, p)
        t2 = tie_cleanup(results[0][2], slots, series, pool, log)
        if t2 != results[0][2]: results[0] = (evaluate(t2, slots, series), form, t2)
        results[0][0]["swaps_checked"] = st.get("checked", 0)
        log(f"  swap check: {st.get('checked', 0)} swaps tried on the final team")
    # final pick by results, not proxies: the best teams that are level on every hard rule (full chem in control,
    # unbeatable defence when possible, attack floor, never losing to the Reddit team) and on the highest control
    # play each other and the field (other players' styles, the Reddit teams 3x). The best total margin is published.
    if results:
        top = results[0][0]
        hard = lambda e: (e["ctrl_not_full"] == 0, e.get("def_unbeatable", False), -e.get("attack_short", 0),
                          min(e.get("vs_reddit") or 0, 0), round(e["control"], 2))
        fin, sigs4 = [], set()
        for ev, form, sq in results:
            sg = (form, frozenset(c["id"] for c in sq))
            if sg in sigs4 or hard(ev) != hard(top): continue
            sigs4.add(sg); fin.append((ev, form, sq))
            if len(fin) == 12: break
        # the best control variants always play the final too: the ranking can put them just below 12 others on attack
        # proxies while they win head to head (81: the Lucas Vázquez team beats the Yassine team 51.9% to 38.5%)
        for ev, form, sq in sorted(variants, key=lambda r: sim_key(r[0]), reverse=True):
            sg = (form, frozenset(c["id"] for c in sq))
            if sg in sigs4 or hard(ev) != hard(top): continue
            sigs4.add(sg); fin.append((ev, form, sq))
            if len(fin) >= 16: break
        # owner: the attack floor against control is settled head to head. The best teams with the highest control play
        # the final even when an attacker is under the floor (89: Karetsas, 87 attack, gives +0.2 control and wins)
        base = lambda e: (e["ctrl_not_full"] == 0, e.get("def_unbeatable", False), min(e.get("vs_reddit") or 0, 0))
        cmax = max(round(e["control"], 2) for e, f, q in results if base(e) == base(top))
        extra = [r for r in results if base(r[0]) == base(top) and round(r[0]["control"], 2) == cmax and cmax > round(top["control"], 2)]
        n0 = len(fin)
        for ev, form, sq in extra + sorted(totals, key=lambda r: sim_key(r[0]), reverse=True):
            sg = (form, frozenset(c["id"] for c in sq))
            if sg in sigs4 or base(ev) != base(top): continue
            if hard(ev) != hard(top) and round(ev["control"], 2) != cmax: continue
            sigs4.add(sg); fin.append((ev, form, sq))
            if len(fin) >= n0 + 6: break
        if len(fin) > 1:
            sides = [_side(sq, FORMATIONS[form], series) for ev, form, sq in fin]
            opp = [(_side(sq, FORMATIONS[form], series), 1) for ev, form, sq in style_teams]
            for groups in REDDIT:            # the Reddit teams, in every formation they fit, 3x in all
                opp += [(g, 3 / len(groups)) for g in groups]
            score = []
            for i, a in enumerate(sides):
                t = sum(x - y for j, b in enumerate(sides) if j != i for _, x, y in [_match(a, b)])
                t += sum(w * (x - y) for b, w in opp for _, x, y in [_match(a, b)])
                score.append(t)
            order = sorted(range(len(fin)), key=lambda i: -score[i])
            if order[0] != 0:
                log(f"  round robin: {fin[order[0]][1]} beats the ranking's pick ({score[order[0]]:+.3f} vs {score[0]:+.3f})")
            w_ev, w_form, w_sq = fin[order[0]]
            w_slots = FORMATIONS[w_form]
            t2 = tie_cleanup(w_sq, w_slots, series, pool, log)
            if t2 != w_sq: w_sq = t2; w_ev = evaluate(t2, w_slots, series)
            w_ev["round_robin"] = round(score[order[0]], 4)
            rest = [fin[i] for i in order[1:]]
            results = [(w_ev, w_form, w_sq)] + rest + [r for r in results if r not in fin]
    out = []
    for ev, form, sq in results[:3]:
        d = describe(sq, series)
        # keep the formation we solved for (describe() may find another one that fits)
        d["formation"] = form
        slots = FORMATIONS[form]
        d["players"] = [dict(p, slot=s) for p, s in zip(_slot_rows(sq, series), slots)]
        d["metrics"] = ev
        out.append(d)
    return out


def _slot_rows(sq, series):
    E, ch = effective(sq, series)
    return [{"id": x["id"], "name": x["name"], "rating": x["rating"], "color": x["color"], "position": x["position"],
             "nationId": x["nationId"], "leagueId": x["leagueId"], "clubId": x["clubId"],
             "card": [x["attack"], x["control"], x["defense"]], "chem": ch[i], "eff": list(E[i][:3])}
            for i, x in enumerate(sq)]
