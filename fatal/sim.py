"""FATAL Sim team builder.

Priority (as agreed): the highest possible Control in every control position (LM, LW, RM, RW,
CAM, CM, CDM, LB, RB), all on full chem; then the best Attack (ST, CAM, wingers, wide mids, full-backs);
then the best Defence (full backs, CDM, CB, GK).
"""
import time
from .core import (CTRL, ATT, DEF, AUTO, full_chem, FORMATIONS, SIM_FORMATIONS, boosted, effective, describe, pid)
from .milp import build

# In Fatal Sim the attacker is picked at random from the attacking positions, and full-backs can be picked too
ATT = ATT | {"LB", "RB"}


def _pool(series, cards):
    pool = []
    for c in cards:
        if c["rating"] > series["cap"]:
            continue
        a, k, d = boosted(c, series.get("boosts", []))
        c = dict(c); c["A"], c["C"], c["D"] = a, k, d; c["_i"] = len(pool)
        pool.append(c)
    return pool


def evaluate(team, slots, series):
    E, ch = effective(team, series)
    C = [E[i][1] for i, s in enumerate(slots) if s in CTRL]
    CT = sum(E[i][0] + E[i][1] + E[i][2] for i, s in enumerate(slots) if s in CTRL)   # control duels tie -> total stats
    A = [E[i][0] for i, s in enumerate(slots) if s in ATT]
    D = [E[i][2] for i, s in enumerate(slots) if s in DEF]
    AT = sum(E[i][0] + E[i][1] + E[i][2] for i, s in enumerate(slots) if s in ATT)   # attack duels tie -> total stats
    DT = sum(E[i][0] + E[i][1] + E[i][2] for i, s in enumerate(slots) if s in DEF)
    bad = sum(1 for i, s in enumerate(slots) if s in CTRL and ch[i] < 3)
    m = lambda v: sum(v) / len(v) if v else 0
    return {"control": round(m(C), 2), "attack": round(m(A), 2), "defence": round(m(D), 2),
            "control_cards": sorted(C, reverse=True), "attack_cards": sorted(A, reverse=True),
            "defence_cards": sorted(D, reverse=True), "chem": sum(ch), "ctrl_not_full": bad,
            "ctrl_total": round(CT / len(C), 2) if C else 0,
            "att_total": round(AT / len(A), 2) if A else 0, "def_total": round(DT / len(D), 2) if D else 0}


def rank_key(ev):
    """Owner's order, strictly one after the other: highest Control, then the control cards' totals; then highest
    Attack, then the attackers' totals; then highest Defence, then the defenders' totals; then chem."""
    return (round(ev["control"], 2), round(ev.get("ctrl_total", 0), 2), round(ev["attack"], 2), round(ev.get("att_total", 0), 2),
            round(ev["defence"], 2), round(ev.get("def_total", 0), 2), ev["chem"])


def sim_key(ev):
    """Teams with every control card on full chem first, then rank_key."""
    return (ev["ctrl_not_full"] == 0, rank_key(ev))


def polish(team, slots, series, pool, seconds=60):
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
                if k > best:
                    team, best, improved = trial, k, True
                    used = {pid(x) for kk, x in enumerate(team) if kk != i}
            if time.time() - t0 > seconds:
                break
    return team


def build_sim(series, cards, formations=None, margin=8, topk=120, time_limit=200, log=print, refs=(), polish_seconds=90):
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
            if mx is not None:               # "Max 3 clubs": at most that many different
                d = dict(v.get("distinct") or {}); lo = (d.get(k[:-1]) or (None, None))[0]; d[k[:-1]] = (lo, mx); v["distinct"] = d
            elif k == "nations": v["min_nations"] = b["min"]
            elif k == "types": v["min_types"] = b["min"]
            elif k in ("clubs", "leagues"):
                d = dict(v.get("distinct") or {}); d[k[:-1]] = (b["min"], (d.get(k[:-1]) or (None, None))[1]); v["distinct"] = d
            return v
        if k in ("nations", "clubs", "leagues") or (k == "types" and mx is None):
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

        def value(c, s):
            T = (c["A"] + c["C"] + c["D"]) / 400
            v = 0                     # control first, then attack, then defence (each with its total as the tiebreak)
            if s in CTRL: v += 1000 * (c["C"] + T)
            if s in ATT: v += 20 * (c["A"] + T)
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
    for k, ref in enumerate(refs or []):
        rc = [byid.get(c["id"]) for c in ref]
        if not all(rc):
            log(f"  Reddit team {k+1}: has cards above the cap, skipped"); continue
        for form in formations:
            slots = FORMATIONS[form]
            sq = build(rc, slots, lambda c, s: (1000 * c["C"] if s in CTRL else 0) + (3 * c["A"] if s in ATT else 0) + (c["D"] if s in DEF else 0),
                       time_limit=10)
            if sq:
                ev = evaluate(sq, slots, series); results.append((ev, form, sq))
                log(f"  Reddit {k+1} as {form}: control {ev['control']} attack {ev['attack']} defence {ev['defence']}")
    # polish the best few by swapping single cards with any card in the series
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    seen, top = set(), []
    for ev, form, sq in results:
        sig = (form, tuple(sorted(c["id"] for c in sq)))
        if sig in seen: continue
        seen.add(sig); top.append((ev, form, sq))
        if len(top) == 4: break
    for ev, form, sq in top:
        slots = FORMATIONS[form]
        p = polish(sq, slots, series, pool, polish_seconds)
        pe = evaluate(p, slots, series)
        if sim_key(pe) > sim_key(ev):
            log(f"  polished {form}: control {ev['control']} -> {pe['control']}, attack {ev['attack']} -> {pe['attack']}")
            results.append((pe, form, p))
    results.sort(key=lambda r: sim_key(r[0]), reverse=True)
    results = [r for r in results if r[0]["ctrl_not_full"] == 0] or results
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
