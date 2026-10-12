"""FATAL Sim team builder.

Priority (as agreed): the highest possible Control in every control position (LM, LW, RM, RW,
CAM, CM, CDM, LB, RB), all on full chem; then the best Attack (ST, CAM, wingers, wide mids);
then the best Defence (full backs, CDM, CB, GK).
"""
from .core import (CTRL, ATT, DEF, AUTO, full_chem, FORMATIONS, SIM_FORMATIONS, boosted, effective, describe)
from .milp import build


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
    A = [E[i][0] for i, s in enumerate(slots) if s in ATT]
    D = [E[i][2] for i, s in enumerate(slots) if s in DEF]
    bad = sum(1 for i, s in enumerate(slots) if s in CTRL and ch[i] < 3)
    m = lambda v: sum(v) / len(v) if v else 0
    return {"control": round(m(C), 2), "attack": round(m(A), 2), "defence": round(m(D), 2),
            "control_cards": sorted(C, reverse=True), "attack_cards": sorted(A, reverse=True),
            "defence_cards": sorted(D, reverse=True), "chem": sum(ch), "ctrl_not_full": bad}


def build_sim(series, cards, formations=None, margin=2, topk=50, time_limit=120, log=print):
    formations = formations or series.get("formations") or SIM_FORMATIONS
    pool = _pool(series, cards)
    maxC = max(x["C"] for x in pool if x["P"] & CTRL)
    ctrlc = [x for x in pool if (x["P"] & CTRL) and x["C"] >= maxC - margin]
    nat = {x["nationId"] for x in ctrlc}; lg = {x["leagueId"] for x in ctrlc}; cl = {x["clubId"] for x in ctrlc}
    results = []
    bonus_variants = [{}]
    for b in series.get("bonuses", []):
        k = b["kind"]
        def with_bonus(v, k=k, b=b):         # the same build, but forced to earn this bonus
            v = dict(v)
            if k == "nations": v["min_nations"] = b["min"]
            elif k == "types": v["min_types"] = b["min"]
            elif k in ("clubs", "leagues"):
                d = dict(v.get("distinct") or {}); d[k[:-1]] = (b["min"], None); v["distinct"] = d
            return v
        if k in ("nations", "types", "clubs", "leagues"):
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
            T = (c["A"] + c["C"] + c["D"]) / 1000
            v = 0
            if s in CTRL: v += 1000 * (c["C"] + T)
            if s in ATT: v += 3 * c["A"]
            if s in DEF: v += 1 * c["D"]
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
    results.sort(key=lambda r: (-round(r[0]["control"], 2), -(3 * r[0]["attack"] + r[0]["defence"])))
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
