"""FATAL Sim team builder.

Priority (as agreed): the highest possible Control in every control position (LM, LW, RM, RW,
CAM, CM, CDM, LB, RB), all on full chem; then the best Attack (ST, CAM, wingers, wide mids, full-backs);
then the best Defence (full backs, CDM, CB, GK).
"""
import time
from .core import (CTRL, ATT, DEF, AUTO, full_chem, FORMATIONS, SIM_FORMATIONS, boosted, effective, describe, pid, is_special)
from .milp import build

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


def _beat(x, ys):
    """Chance x beats a random value from ys = [(value, weight)] (a tie counts half)."""
    return sum(w * (1 if x > y else 0.5 if x == y else 0) for y, w in ys)


def opp_profile(teams):
    """teams: [(team, slots, series)]. Their control, attack (weighted by who attacks) and defence values."""
    C, A, D = [], [], []
    n = len(teams)
    for team, slots, series in teams:
        E, _ = effective(team, series)
        W = attack_weights(slots, [x["position"] for x in team])
        ci = [i for i, s in enumerate(slots) if s in CTRL]; di = [i for i, s in enumerate(slots) if s in DEF]
        C += [(E[i][1], 1 / (n * len(ci))) for i in ci]
        D += [(E[i][2], 1 / (n * len(di))) for i in di]
        A += [(E[i][0], W[i] / n) for i in range(len(slots)) if W[i] > 0]
    return {"C": C, "A": A, "D": D}


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
    m = lambda v: sum(v) / len(v) if v else 0
    net = None
    if OPP:          # how it actually plays against the strongest teams: we win control, then score; or they score
        di = [i for i, s in enumerate(slots) if s in DEF]
        h = m([_beat(c, OPP["C"]) for c in C])
        f = sum(W[i] * _beat(E[i][0], OPP["D"]) for i in range(len(slots)) if W[i] > 0)
        g = m([1 - _beat(E[i][2], OPP["A"]) for i in di])
        net = round(h * f - (1 - h) * g, 4)
    return {"control": round(m(C), 2), "attack": round(att_exp, 2), "defence": round(m(D), 2), "net": net,
            "control_cards": sorted(C, reverse=True), "attack_cards": sorted(A, reverse=True),
            "defence_cards": sorted(D, reverse=True), "chem": sum(ch), "ctrl_not_full": bad,
            "ctrl_total": round(CT / len(C), 2) if C else 0,
            "att_total": round(AT, 2), "def_total": round(DT / len(D), 2) if D else 0}


def rank_key(ev):
    """Owner's order: highest Control (then the control cards' totals); then Attack before Defence. A small defence
    gain never beats an attack gain: defence only counts a third as much (a 1-point attack gain beats up to a 3-point
    defence loss, so a tiny attack gain can't cost a big defence drop). Then Attack, its total, Defence, its total,
    match strength against the strongest teams, chem."""
    a, d = ev["attack"], ev["defence"]
    return (round(ev["control"], 2), round(ev.get("ctrl_total", 0), 2), round(a + d / 3, 2),
            round(a, 2), round(ev.get("att_total", 0), 2), round(d, 2), round(ev.get("def_total", 0), 2),
            ev.get("net") if ev.get("net") is not None else -9, ev["chem"])


def sim_key(ev):
    """Teams with every control card on full chem first, then rank_key."""
    return (ev["ctrl_not_full"] == 0, rank_key(ev))


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


def build_sim(series, cards, formations=None, margin=8, topk=120, time_limit=200, log=print, refs=(), polish_seconds=90, n_reddit=None):
    """refs: Reddit teams (lists of cards). Each is tried in every formation, and the best teams found (theirs and
    ours) are then polished by single-card swaps over the whole series, so the result is never worse than theirs."""
    """margin: control-position shortlist = every card within `margin` control of the best (2 was too narrow:
    it missed Beste at LM in the 77 series)."""
    formations = formations or series.get("formations") or SIM_FORMATIONS
    pool = _pool(series, cards)
    maxC = max(x["C"] for x in pool if x["P"] & CTRL)
    ctrlc = [x for x in pool if (x["P"] & CTRL) and x["C"] >= maxC - margin]
    nat = {x["nationId"] for x in ctrlc}; lg = {x["leagueId"] for x in ctrlc}; cl = {x["clubId"] for x in ctrlc}
    results = []
    bonus_variants = [{}]
    for b in series.get("bonuses", []):
        k = b["kind"]
        mx = b.get("max")
        def with_bonus(v, k=k, b=b, mx=mx):  # the same build, but forced to earn this bonus
            v = dict(v)
            if k == "specials":              # "8+ special cards" (or "Max N special cards")
                v["group_rules"] = list(v.get("group_rules") or ()) + [(is_special, "<=" if mx is not None else ">=", mx if mx is not None else b["min"])]
            elif mx is not None:             # "Max 3 clubs": at most that many different
                d = dict(v.get("distinct") or {}); lo = (d.get(k[:-1]) or (None, None))[0]; d[k[:-1]] = (lo, mx); v["distinct"] = d
            elif k == "nations": v["min_nations"] = b["min"]
            elif k == "types": v["min_types"] = b["min"]
            elif k in ("clubs", "leagues"):
                d = dict(v.get("distinct") or {}); d[k[:-1]] = (b["min"], (d.get(k[:-1]) or (None, None))[1]); v["distinct"] = d
            return v
        if k in ("nations", "clubs", "leagues", "specials") or (k == "types" and mx is None):
            bonus_variants = bonus_variants + [with_bonus(v) for v in bonus_variants]
    for form in formations:
        slots = FORMATIONS[form]
        cand = set()
        for s in set(slots):
            if s in CTRL:
                cand |= {x["_i"] for x in ctrlc if s in x["P"]}
            else:
                key = (lambda x: x["A"]) if s in ATT else (lambda x: x["D"])
                el = [x for x in pool if s in x["P"]]
                cand |= {x["_i"] for x in sorted(el, key=lambda x: -key(x))[:topk]}
                cand |= {x["_i"] for x in el if x["clubId"] in cl or full_chem(x) or
                         (x["leagueId"] in lg and key(x) >= maxC - 6) or (x["nationId"] in nat and key(x) >= maxC - 4)}
        cards_f = [pool[i] for i in cand]

        sw = attack_weights(slots, list(slots))
        slot_w = {}
        for k2, sl in enumerate(slots): slot_w[sl] = max(slot_w.get(sl, 0), sw[k2])

        def value(c, s):
            T = (c["A"] + c["C"] + c["D"]) / 400
            v = 0                     # control first, then attack, then defence (each with its total as the tiebreak)
            if s in CTRL: v += 1000 * (c["C"] + T)
            if s in ATT: v += 100 * slot_w.get(s, 0.2) * (c["A"] + T)
            if s in DEF: v += 0.5 * (c["D"] + T)
            return v

        def chem_w(c, s):
            return (3 if s in ATT else 0) + (1 if s in DEF else 0) + 0.01

        def full(c, s):
            return s in CTRL and not full_chem(c)

        for bv in bonus_variants:
            sq = build(cards_f, slots, value, chem_weight=chem_w, force_full=full, time_limit=time_limit, **bv)
            if not sq:
                continue
            ev = evaluate(sq, slots, series)
            results.append((ev, form, sq))
            log(f"  {form} {bv or ''}: control {ev['control']} attack {ev['attack']} defence {ev['defence']}")
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
    if prof:
        OPP = opp_profile(prof)
        results = [(evaluate(sq, FORMATIONS[form], series), form, sq) for ev, form, sq in results]
    # polish the best few by swapping single cards with any card in the series
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    seen, top = set(), []
    for ev, form, sq in results:
        sig = (form, tuple(sorted(c["id"] for c in sq)))
        if sig in seen: continue
        seen.add(sig); top.append((ev, form, sq))
        if len(top) == 6: break
    for ev, form, sq in top:
        slots = FORMATIONS[form]
        p = polish(sq, slots, series, pool, polish_seconds)
        pe = evaluate(p, slots, series)
        if sim_key(pe) > sim_key(ev):
            log(f"  polished {form}: control {ev['control']} -> {pe['control']}, attack {ev['attack']} -> {pe['attack']}")
            results.append((pe, form, p))
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
        results[0][0]["swaps_checked"] = st.get("checked", 0)
        log(f"  swap check: {st.get('checked', 0)} swaps tried on the final team")
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
