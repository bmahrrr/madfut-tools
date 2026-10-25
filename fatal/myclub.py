"""FATAL My Club team builder.

A team is judged by playing the exact game (see game.c) with perfect play from both sides
against a pool of opponents: reference teams you supply, plus "counter-teams" that the
builder itself searches for (teams built specifically to beat the current best team).
The search is a local search over owned cards that respects positions and chemistry.
"""
import collections, random, time
from .core import AUTO, ICON, full_chem, FORMATIONS, boosted, effective, formation_fit, pid, describe, CTRL, CHEM_BONUS
from .game import play
from .milp import build

_fit_cache = {}
MAX_ICONS = 5          # game rule: a My Club team holds at most 5 Icons (Debut Icons count); no limit in the X series
ICON_RULE = [(lambda c: c["color"] in ICON, "<=", MAX_ICONS)]


def set_icon_limit(series):
    """The X series (no rating cap) has no Icon limit; every other series keeps 5."""
    global MAX_ICONS, ICON_RULE
    if str(series.get("key", "")).split("--")[0].upper() == "X" or (series.get("cap") or 0) >= 99:
        MAX_ICONS, ICON_RULE = 11, []
    else:
        MAX_ICONS, ICON_RULE = 5, [(lambda c: c["color"] in ICON, "<=", 5)]


def fits(team):
    if sum(1 for x in team if x["color"] in ICON) > MAX_ICONS:
        return False
    key = tuple(sorted(tuple(sorted(x["P"])) for x in team))
    v = _fit_cache.get(key)
    if v is None:
        v = formation_fit(team) is not None
        _fit_cache[key] = v
    return v


class Pool:
    def __init__(self, series, cards):
        self.series = series
        self.cards = []
        for c in cards:
            if c["rating"] > series["cap"]:
                continue
            a, k, d = boosted(c, series.get("boosts", []))
            c = dict(c); c["bA"], c["bC"], c["bD"] = a, k, d; c["T3"] = a + k + d; c["pid"] = pid(c)
            self.cards.append(c)
        cs = self.cards
        top = {}
        for key in ("bA", "bC", "bD", "T3"):
            for x in sorted(cs, key=lambda x: -x[key])[:70]: top[x["id"]] = x
        for a, b in (("bA", "bC"), ("bC", "bD"), ("bA", "bD")):
            for x in sorted(cs, key=lambda x: -min(x[a], x[b]))[:40]: top[x["id"]] = x
        self.top = list(top.values())
        self.by = {k: collections.defaultdict(list) for k in ("nationId", "leagueId", "clubId")}
        for x in cs:
            for k in self.by: self.by[k][x[k]].append(x)
        for k in self.by:
            for g in self.by[k]:
                self.by[k][g].sort(key=lambda x: -x["T3"]); self.by[k][g] = self.by[k][g][:60]
        self.auto = sorted([x for x in cs if full_chem(x)], key=lambda x: -x["T3"])[:80]
        # the best cards for EACH position (a GK never makes an overall top list: its total is ~165 vs 220+),
        # including full-chem Icons/Heroes for that position
        self.pos_top = {}
        for p in {q for x in cs for q in x["P"]}:
            el = [x for x in cs if p in x["P"]]
            sel = {}
            for key in ("bA", "bC", "bD", "T3"):
                for x in sorted(el, key=lambda x: -x[key])[:15]: sel[x["id"]] = x
            for x in sorted((x for x in el if full_chem(x)), key=lambda x: -x["T3"])[:10]: sel[x["id"]] = x
            self.pos_top[p] = list(sel.values())

    def eff(self, team, full=False):
        E, _ = effective(team, self.series, full)
        return E

    def propose(self, team, rng):
        i = rng.randrange(11)
        r = rng.random()
        if r < 0.3:
            c = rng.choice(self.top)
        elif r < 0.5:                       # a strong card for the replaced card's own position
            L = self.pos_top.get(rng.choice(sorted(team[i]["P"])))
            if not L: return None
            c = rng.choice(L)
        elif r < 0.9:
            y = rng.choice(team)
            key = rng.choice(("nationId", "leagueId", "clubId"))
            L = self.by[key][y[key]]
            if not L: return None
            c = rng.choice(L[:30])
        else:
            c = rng.choice(self.auto or self.top)
        if any(z["pid"] == c["pid"] for k, z in enumerate(team) if k != i):
            return None
        new = team[:i] + [c] + team[i + 1:]
        return new if fits(new) else None


class Unbeat:
    """Unbeatable cards: a card's attack / control / defence that NO card in the series can beat in that duel (attack
    vs defence, control vs control), even at its best: boosts, full chem and every squad bonus. A tie on the stat
    goes to the higher card total, so an equal stat only counts if no card at that stat has a higher total; an exact
    tie is allowed (nothing WINS it). Same test as the site's Cards to Watch.
    The owner's rule for a team: 5 cards unbeatable in the SAME stat (every lead you make wins), plus the best
    tiebreak card kept back (the last card decides a 5-5 or 5-6 game)."""
    CTR = (2, 1, 0)

    def __init__(self, field, series):
        bon = [0, 0, 0]
        for b in series.get("bonuses") or []:
            bon[0] += b.get("att", 0); bon[1] += b.get("ctl", 0); bon[2] += b.get("def", 0)
        self.bon = bon
        self.maxV, self.maxT = [], []
        for q in range(3):
            cs = self.CTR[q]
            best, tot = -99, -1
            for x in field.cards:
                v = (x["bA"], x["bC"], x["bD"])[cs] + 2 + bon[cs]
                t = x["attack"] + x["control"] + x["defense"] + 6
                if v > best: best, tot = v, t
                elif v == best and t > tot: tot = t
            self.maxV.append(best); self.maxT.append(tot)
        # the highest card total in the series (full chem): a tiebreak card within 5 of it can't lose the tiebreak
        self.maxTotal = max(x["attack"] + x["control"] + x["defense"] + 6 for x in field.cards)

    def ok(self, q, v, tot):
        return v > self.maxV[q] or (v == self.maxV[q] and tot >= self.maxT[q])

    def key(self, E):
        """(tier, unbeatable count in the best stat, tiebreak total, stat). tier 1 = at least 5 unbeatable in one
        stat AND a tiebreak card that can't lose the tiebreak; the tiebreak is the best total among the cards left
        after keeping the 5 (lowest-total) unbeatables."""
        best = (0, 0, 0, -1)
        for q in range(3):
            U = sorted((i for i, e in enumerate(E) if self.ok(q, e[q], e[3])), key=lambda i: E[i][3])
            if len(U) >= 5:
                keep = set(U[:5]); tb = max(e[3] for i, e in enumerate(E) if i not in keep)
                # tier 1 only when the tiebreak card can't lose the tiebreak (no card totals more than 5 above it):
                # 5 unbeatable leads only guarantee 5 points, the last card has to hold the rest (72 lost 38 of 124
                # test teams with a 217 tiebreak against a 232 best total)
                k = (1, min(len(U), 6), tb, q) if tb >= self.maxTotal - 5 else (0, len(U), 0, q)
            else:
                k = (0, len(U), 0, q)
            if k[:3] > best[:3]: best = k
        return best

    def full_key(self, E, per):
        """Ranking used everywhere: 5 unbeatable in one stat + best tiebreak first (owner's rule), then the worst
        result against every test team, then total results and stats. Below tier 1 the test results come first."""
        k = self.key(E); w, s = (min(per), sum(per)) if per else (0, 0)
        return (1, k[2], w, s, secondary(E)) if k[0] else (0, w, k[1], s, secondary(E))


def pair_score(a, b):
    """One opponent, both lead orders, as one number: 3 x (results) minus 1 per loss, so a loss in one lead order is
    worse than drawing both (WW 6 > WD 3 > DD 0 > WL -1 > DL -4 > LL -8). The builder prefers teams that can't lose."""
    return 3 * (a + b) - (a < 0) - (b < 0)


def pscore(E, O):
    return pair_score(play(E, O, 0)[0], play(E, O, 1)[0])


def evaluate(E, opps, weights, bound=None, robust=False, floor=None, order=None, need=None):
    """Score a team against opponents. Normal: weighted sum of results (+1 win, 0 draw, -1 loss
    for each lead order). Robust: the worst result against any single opponent comes first.
    floor (robust): give up (None) as soon as one opponent scores below it - such a team can't be
    accepted, so most candidates are rejected after one or two games. order: opponent indexes,
    hardest first; the one that rejected a team moves to the front.
    need (robust): the current team's (worst, total). Also give up when the worst case can no longer
    beat it and the total can no longer reach it (the team can only be worse)."""
    tot = lv = 0
    if robust:
        worst = 99
        idx = list(order) if order is not None else list(range(len(opps)))
        if need is not None and floor is None: floor = need[0]
        rem = sum(2 * weights[k] for k in idx)
        for n, k in enumerate(idx):
            O, w = opps[k], weights[k]
            oo = []
            for f in (0, 1):
                o, l = play(E, O, f)
                oo.append(o); tot += w * o; lv += w * l
            s = pair_score(*oo)
            worst = min(worst, s); rem -= 2 * w
            if (floor is not None and s < floor) or (need is not None and worst <= need[0] and tot + rem < need[1]):
                if order is not None and n: order.insert(0, order.pop(order.index(k)))
                return None
        return (worst, tot), lv
    rem = sum(2 * w for w in weights)
    for O, w in zip(opps, weights):
        for f in (0, 1):
            o, l = play(E, O, f)
            tot += w * o; lv += w * l; rem -= w
            if bound is not None and tot + rem < bound:
                return None
    return tot, lv


def catscore(E):
    """Best total when each card is given ONE stat it is used for (attack / control / defence), 3 or 4 cards per
    stat. In this game every card is used once, to lead or to answer with one stat, so what wins is enough cards
    that are very strong in each stat - not all-rounders. Far better than raw stat totals at telling which of two
    teams wins (tested on the 76 series: teams built on it beat the old builder's team every time)."""
    best = {(0, 0, 0): 0}
    for e in E:
        nxt = {}
        for (a, c, d), v in best.items():
            for q, cnt in ((0, a), (1, c), (2, d)):
                if cnt >= 4: continue
                k = (a + (q == 0), c + (q == 1), d + (q == 2)); w = v + e[q]
                if nxt.get(k, -1) < w: nxt[k] = w
        best = nxt
    return max(v for k, v in best.items() if min(k) >= 3)


def stat_strength(E):
    """Raw stat strength (top 7 of each stat + tiebreak totals); the objective builder's % strength uses it."""
    s = 0
    for k in range(3):
        v = sorted((e[k] for e in E), reverse=True); s += sum(v[:7])
    return s + sum(e[3] for e in E) / 10


def secondary(E):
    return catscore(E) * 10000 + stat_strength(E)


def optimize(pool, seed, opps, weights, seconds, rng, log=None, label="", robust=False, guard=None):
    """guard(E) -> tuple: when given, no move may lower it (keeps a team's unbeatable cards and tiebreak)."""
    cur = seed[:]
    E = pool.eff(cur)
    g0 = guard(E) if guard else None
    order = list(range(len(opps))) if robust else None
    o, l = evaluate(E, opps, weights, robust=robust)
    ckey = (o, l, secondary(E)); best = (ckey, cur[:])
    head = (lambda k: k[0][0]) if robust else (lambda k: k[0])
    t0 = time.time(); it = 0
    while time.time() - t0 < seconds:
        it += 1
        new = pool.propose(cur, rng)
        if new is None: continue
        if rng.random() < 0.3:
            n2 = pool.propose(new, rng)
            if n2 is not None: new = n2
        E2 = pool.eff(new)
        if guard and guard(E2) < g0: continue
        r = evaluate(E2, opps, weights, bound=None if robust else ckey[0] - 1, robust=robust,
                     need=ckey[0] if robust else None, order=order)
        if r is None: continue
        k2 = (r[0], r[1], secondary(E2))
        if k2 > ckey or (k2[:2] == ckey[:2] and rng.random() < 0.3) or \
                (k2[0] == ckey[0] and k2[1] >= ckey[1] - 1 and rng.random() < 0.05):
            cur = new; ckey = k2
            if k2 > best[0]:
                best = (k2, cur[:])
                if log: log(f"  [{label}] {time.time()-t0:.0f}s score={k2[0]} margin={k2[1]}")
        if head(ckey) < head(best[0]) - (0 if robust else 1):
            cur = best[1][:]; ckey = best[0]
    return best


def polish(pool, team, opps, weights, seconds, log=None, per_link=25, rng=None, guard=None):
    """Systematic check of the finished team: try every promising single-card swap, judged on
    (worst case, total results) against every opponent. Candidates: cards linked to the team by
    nation/league/club, full-chem cards (Icons, Heroes...) and the strongest cards; a swap must not
    lower the team's chemistry. Swaps that tie are kept as stepping stones and searched one level
    deeper (full-chem cards first, they unlock links), so two-card changes like 'an Icon + the card
    its league link puts on full chem' are found too."""
    t0 = time.time(); order = list(range(len(opps)))
    chem = lambda tm: sum(effective(tm, pool.series)[1])
    def score(tm):
        E = pool.eff(tm); r = evaluate(E, opps, weights, robust=True)
        return (r[0], secondary(E))
    cur = team[:]; ck = score(cur)
    g0 = guard(pool.eff(cur)) if guard else None
    def cands(tm):
        seen = {}
        for x in tm:
            for k in ("nationId", "leagueId", "clubId"):
                for c in pool.by[k][x[k]][:per_link]: seen[c["id"]] = c
        for c in pool.auto[:2 * per_link] + sorted(pool.top, key=lambda x: -x["T3"])[:3 * per_link]: seen[c["id"]] = c
        for x in tm:                          # every position's own best cards (GKs, full-backs...)
            for p in x["P"]:
                for c in pool.pos_top.get(p, []): seen[c["id"]] = c
        used = {x["pid"] for x in tm}
        L = [c for c in seen.values() if c["pid"] not in used]
        if rng: rng.shuffle(L)              # a different order each night within the same strength band
        return sorted(L, key=lambda c: -(c["T3"] // 8))
    def sweep(base, bkey, collect):
        # every (slot, card) swap, best upgrades first: ranked by how much stronger the card is than the one it
        # replaces (so a +4 goalkeeper is tried before a weaker outfield card, whatever the totals)
        ties, ch0, tried = [], chem(base), 0
        # Cheap filter first (formation fits, team chem not lower), then per slot the biggest in-game upgrade first
        # (after boosts and chem); slots take turns (round robin) so every position - the goalkeeper too - gets its
        # best options tried early. Only then the expensive game checks.
        C = cands(base); E0 = pool.eff(base); per = [[] for _ in range(11)]
        for c in C:
            for i in range(11):
                new = base[:i] + [c] + base[i + 1:]
                if not fits(new) or chem(new) < ch0: continue
                e = pool.eff(new)[i]
                per[i].append((sum(e[:3]) - sum(E0[i][:3]), c))
        for L in per: L.sort(key=lambda z: -z[0])
        pairs = [(i, per[i][r][1]) for r in range(max((len(L) for L in per), default=0)) for i in range(11) if r < len(per[i])]
        for i, c in pairs:
            if time.time() - t0 > seconds: return None, ties, tried
            new = base[:i] + [c] + base[i + 1:]
            tried += 1
            E2 = pool.eff(new)
            if guard and guard(E2) < g0: continue
            r = evaluate(E2, opps, weights, robust=True, need=bkey[0], order=order)
            if r is None: continue
            k2 = (r[0], secondary(E2))
            if k2[0] > ck[0]: return (k2, new), ties, tried
            if collect and k2[0] == bkey[0]: ties.append((k2, new, c))
        return None, ties, tried
    while time.time() - t0 < seconds:
        hit, ties, n = sweep(cur, ck, True)
        if log: log(f"  polish: {n} swaps tried, {len(ties)} ties, {time.time()-t0:.0f}s")
        if not hit:
            for k2, tie, c in sorted(ties, key=lambda t: (not full_chem(t[2]), -t[0][1])):
                if time.time() - t0 > seconds: break
                hit, _, _ = sweep(tie, k2, False)
                if hit: break
        if not hit: break
        ck, cur = hit
        if log: log(f"  polish: better team, worst {ck[0][0]} total {ck[0][1]}: {[c['name'] for c in cur]}")
    return ck, cur


ROLE = {"GK": "bD", "CB": "bD", "LB": "bD", "RB": "bD", "LWB": "bD", "RWB": "bD", "CDM": "bC", "CM": "bC", "CAM": "bC",
        "LM": "bC", "RM": "bC", "ST": "bA", "CF": "bA", "LW": "bA", "RW": "bA"}


def seed_cards(pool, series=None):
    """Candidate cards for the seed programs: every position's best cards by each stat, full-chem cards, and every card
    of a boosted nation / league / club."""
    chosen = {}
    positions = {p for f in FORMATIONS.values() for p in f}
    for p in positions:
        el = [x for x in pool.cards if p in x["P"]]
        for key in ("T3", "bA", "bC", "bD"):
            for x in sorted(el, key=lambda x: -x[key])[:25]: chosen[x["id"]] = x
    for x in pool.auto: chosen[x["id"]] = x
    KEYS = {"nation": "nationId", "league": "leagueId", "club": "clubId"}
    for b in (series or pool.series or {}).get("boosts", []):
        k = KEYS.get(b.get("on"))
        if k:
            for x in pool.cards:
                if x[k] == b["id"]: chosen[x["id"]] = x
    cards = []
    for i, c in enumerate(chosen.values()):
        c = dict(c); c["_i"] = i; cards.append(c)
    return cards


CAT_FORMS = ("3-4-3", "4-3-3", "4-4-2", "3-5-2", "3-4-1-2", "4-2-3-1", "4-1-2-1-2 (2)", "5-3-2", "4-3-3 (2)", "4-2-2-2",
             "3-4-2-1", "4-4-2 (2)", "4-1-4-1", "5-2-1-2", "4-3-1-2", "3-1-4-2", "4-2-4", "5-4-1", "4-5-1", "4-3-2-1")
SPLITS = ({0: (3, 3), 1: (4, 4), 2: (4, 4)}, {0: (4, 4), 1: (3, 3), 2: (4, 4)}, {0: (4, 4), 1: (4, 4), 2: (3, 3)})


def cat_seeds(pool, series=None, seconds=300, log=None, time_limit=20):
    """The main seed population: for each formation and each split of the 11 cards into 3/4/4 by the stat each card
    is used for (attack / control / defence), the chem-valid team with the highest total of those stats.
    Stops when the time is used up (formations in order of how often they win)."""
    cards = seed_cards(pool, series)
    t0 = time.time(); out, seen = [], set()
    for cw in (4, 2):                       # chem weight 4 = full chem first; 2 = closer to the real chem bonus
        for form in CAT_FORMS:
            for bnd in SPLITS:
                if time.time() - t0 > seconds: return out
                sq = build(cards, FORMATIONS[form], lambda c, s: 0, chem_weight=lambda c, s, cw=cw: cw,
                           cats=(lambda c: (c["bA"], c["bC"], c["bD"]), bnd), time_limit=time_limit, gap=0.002, group_rules=ICON_RULE)
                if not sq: continue
                k = frozenset(c["id"] for c in sq)
                if k in seen: continue
                seen.add(k); out.append(sq)
                if log: log(f"  seed: stat split {form} {[v[0] for v in bnd.values()]} chem {cw}")
    return out


def milp_seeds(pool, series=None, time_limit=15, log=None):
    """Extra, different starting teams (other styles of team, also used as opponents):
    - the strongest full-chem team (total in-game stats) for several formations;
    - "specialists": each slot weighted to the stat that position duels with (defenders' defence, forwards' attack);
    - one team built only from each boosted nation / league / club (the boosted cluster, e.g. Germany + Bundesliga)."""
    cards = seed_cards(pool, series)
    boosts = (series or pool.series or {}).get("boosts", [])
    KEYS = {"nation": "nationId", "league": "leagueId", "club": "clubId"}
    groups = []
    for b in boosts:
        k = KEYS.get(b.get("on"))
        if k: groups.append((f"{b['on']} {b['id']}", lambda c, k=k, v=b["id"]: c[k] == v))
    if len(groups) > 1:                      # all boosted cards together
        gs = [f for _, f in groups]
        groups.append(("boosted", lambda c, gs=gs: any(f(c) for f in gs)))
    seeds, seen = [], set()
    def add(sq, label):
        if not sq: return
        k = frozenset(c["id"] for c in sq)
        if k in seen: return
        seen.add(k); seeds.append(sq)
        if log: log(f"  seed: {label}")
    forms = ("4-4-2", "4-3-3", "3-4-3", "3-4-1-2", "4-2-3-1", "4-1-2-1-2 (2)", "3-5-2", "5-3-2")
    best = []
    for form in forms:
        sq = build(cards, FORMATIONS[form], lambda c, s: c["T3"], chem_weight=lambda c, s: 6, time_limit=time_limit, gap=0.002, group_rules=ICON_RULE)
        if sq: best.append((sum(e[0] + e[1] + e[2] for e in pool.eff(sq)), form, sq))
    for tot, form, sq in sorted(best, key=lambda z: -z[0])[:3]: add(sq, f"strongest {form}")
    for form in ("4-4-2", "3-4-3", "5-3-2"):
        sq = build(cards, FORMATIONS[form], lambda c, s: c["T3"] + 2 * c[ROLE.get(s, "bC")], chem_weight=lambda c, s: 6, time_limit=time_limit, gap=0.002, group_rules=ICON_RULE)
        add(sq, f"specialists {form}")
    for label, f in groups:
        sub = [c for c in cards if f(c) or full_chem(c)]
        for form in ("4-4-2", "3-4-3"):
            sq = build(sub, FORMATIONS[form], lambda c, s: c["T3"] + c[ROLE.get(s, "bC")], chem_weight=lambda c, s: 6, time_limit=time_limit, gap=0.002, group_rules=ICON_RULE)
            add(sq, f"{label} {form}")
    return seeds


BAL_FORMS = ("4-4-2", "4-3-3", "3-4-3", "3-4-1-2", "4-2-3-1", "4-1-2-1-2", "3-5-2", "5-3-2", "4-5-1", "4-2-2-2",
             "3-4-2-1", "5-2-1-2", "4-1-4-1", "4-3-2-1")


def balanced_teams(pool, series=None, forms=BAL_FORMS, time_limit=12, log=None, seconds=600):
    """Teams like the ones people actually field (and Reddit posts): every card on full chem, strong in every stat.
    Two kinds per formation: the highest total stats, and each slot weighted to the stat its position duels with."""
    cards = seed_cards(pool, series)
    out, seen, t0 = [], set(), time.time()
    full = lambda c, s: True
    for form in forms:
        for label, val in (("balanced", lambda c, s: c["T3"]),
                           ("balanced specialists", lambda c, s: c["T3"] + c[ROLE.get(s, "bC")])):
            if time.time() - t0 > seconds: break
            sq = build(cards, FORMATIONS[form], val, chem_weight=lambda c, s: 1, force_full=full, time_limit=time_limit,
                       gap=0.002, group_rules=ICON_RULE)
            if not sq: continue
            k = frozenset(c["id"] for c in sq)
            if k in seen: continue
            seen.add(k); out.append(sq)
            if log: log(f"  {label} {form}")
    return out


def team_chem(team):
    from .core import chem
    return sum(chem(team))


def unbeat_seeds(pool, series, ub, forms=None, time_limit=20, log=None, seconds=900):
    """The owner's team shape, built directly: for each stat and formation, the team with the most cards unbeatable
    in that stat (up to 5, each on full chem), then the best tiebreak card kept apart from them, then the strongest
    rest. Exact program over the strongest cards for every position (seed_cards), not a search."""
    import pulp
    bon = ub.bon
    # the strongest cards for every position, plus every card that can be unbeatable and its nation / league / club
    # mates (the links that put it on chem)
    cards = seed_cards(pool, series); have = {c["id"] for c in cards}
    able = [x for x in pool.cards if any(ub.ok(q, (x["bA"], x["bC"], x["bD"])[q] + 2 + bon[q], x["attack"] + x["control"] + x["defense"] + 6) for q in range(3))]
    extra_cards = {x["id"]: x for x in able}
    for x in able:
        for k in ("nationId", "leagueId", "clubId"):
            for y in pool.by[k][x[k]][:30]: extra_cards[y["id"]] = y
    for y in extra_cards.values():
        if y["id"] not in have: y = dict(y); y["_i"] = len(cards); cards.append(y); have.add(y["id"])
    t0 = time.time(); out, seen = [], set()
    tot0 = lambda x: x["attack"] + x["control"] + x["defense"]
    def need_of(x, q):                    # the lowest chem at which the card is unbeatable in stat q (None: never)
        if full_chem(x): return 3 if ub.ok(q, (x["bA"], x["bC"], x["bD"])[q] + 2 + bon[q], tot0(x) + 6) else None
        return next((ch for ch in (1, 2, 3) if ub.ok(q, (x["bA"], x["bC"], x["bD"])[q] + bon[q] + CHEM_BONUS[ch], tot0(x) + 3 * CHEM_BONUS[ch])), None)
    def add(sq, label):
        if not sq: return False
        k = frozenset(c["id"] for c in sq)
        if k in seen: return False
        seen.add(k); out.append(sq)
        if log: log(f"  seed: {label} -> {ub.key(pool.eff(sq))}")
        return ub.key(pool.eff(sq))[0] == 1
    for q in (0, 2, 1):
        ableq = [x for x in able if need_of(x, q) is not None]
        pids = sorted({x["pid"] for x in ableq})
        if len(pids) < 5:
            continue                      # fewer than 5 players in the series can be unbeatable in this stat
        # Lock-in: every group of 5 such players (closest-linked groups first), each forced into the team on the chem
        # it needs; the program then only picks the other 6 (best tiebreak card, then strength) or proves the group
        # can't work. Small programs, so this finds a 5-unbeatable team whenever one exists (time permitting).
        import itertools
        rep = {p: [x for x in ableq if x["pid"] == p] for p in pids}
        link = lambda a, b: sum(1 for k in ("nationId", "leagueId", "clubId") if any(x[k] == y[k] for x in rep[a] for y in rep[b]))
        groups = sorted(itertools.combinations(pids, 5), key=lambda g: -sum(link(a, b) for a, b in itertools.combinations(g, 2)))
        found = 0
        for g in groups[:3000]:
            if time.time() - t0 > seconds * 0.7 or found >= 6: break
            gset = set(g); ids = {x["id"] for p in g for x in rep[p]}
            for form in forms or CAT_FORMS:
                slots = FORMATIONS[form]
                # quick check: the 5 can take 5 different slots of this formation
                P = [set().union(*(x["P"] for x in rep[p])) for p in g]
                match = [-1] * len(slots)
                def tr(i, seen2):
                    for j, sl in enumerate(slots):
                        if sl in P[i] and j not in seen2:
                            seen2.add(j)
                            if match[j] < 0 or tr(match[j], seen2): match[j] = i; return True
                    return False
                if not all(tr(i, set()) for i in range(5)): continue
                def extra(prob, X, Y, H, byi, used, obj, q=q, ids=ids, gset=gset):
                    T = {}
                    for i in used:
                        x = byi[i]
                        if x["id"] in ids:
                            nd = need_of(x, q)
                            if nd and not full_chem(x): prob += H[i] >= nd * Y[i]
                        elif x["pid"] not in gset:
                            T[i] = pulp.LpVariable(f"t_{i}", cat="Binary"); prob += T[i] <= Y[i]; prob += H[i] >= 3 * T[i]
                            obj.append((tot0(x) + 6) * T[i])
                    prob += pulp.lpSum(T.values()) == 1
                rules = ICON_RULE + [(lambda c, p=p, ids=ids: c["pid"] == p and c["id"] in ids, ">=", 1) for p in g]
                sq = build(cards, slots, lambda c, s: c["T3"] / 50, chem_weight=lambda c, s: 0.01, time_limit=8,
                           gap=0.001, group_rules=rules, extra=extra)
                if sq and add(sq, f"unbeatable {'ACD'[q]} locked {form}"):
                    hits = getattr(add, "hits", 0) + 1; add.hits = hits     # every formation for this group: the
                    if hits >= 8: break                                    # tiebreak card differs by formation
            if getattr(add, "hits", 0): found += 1; add.hits = 0
        if found: continue
        def extra(prob, X, Y, H, byi, used, obj, q=q):
            F, T = {}, {}
            for i in used:
                x = byi[i]
                base = (x["bA"], x["bC"], x["bD"])[q] + bon[q]; tot0 = x["attack"] + x["control"] + x["defense"]
                # the lowest chem at which the card is still unbeatable (chem 2 is often enough)
                need = next((ch for ch in (1, 2, 3) if ub.ok(q, base + CHEM_BONUS[ch], tot0 + 3 * CHEM_BONUS[ch])), None)
                if need is not None and not full_chem(x):
                    F[i] = pulp.LpVariable(f"f_{i}", cat="Binary"); prob += F[i] <= Y[i]; prob += H[i] >= need * F[i]
                elif need is not None:
                    F[i] = pulp.LpVariable(f"f_{i}", cat="Binary"); prob += F[i] <= Y[i]
                T[i] = pulp.LpVariable(f"t_{i}", cat="Binary"); prob += T[i] <= Y[i]; prob += H[i] >= 3 * T[i]
                if i in F: prob += F[i] + T[i] <= 1
                obj.append((tot0 + 6) * T[i])
            u = pulp.LpVariable("u_unbeat", 0, 5)
            prob += u <= pulp.lpSum(F.values()); prob += pulp.lpSum(T.values()) == 1
            obj.append(100000 * u)
        for form in forms or CAT_FORMS:
            if time.time() - t0 > seconds: return out
            sq = build(cards, FORMATIONS[form], lambda c, s: c["T3"] / 50, chem_weight=lambda c, s: 1, time_limit=time_limit,
                       gap=0.0005, group_rules=ICON_RULE, extra=extra)
            add(sq, f"unbeatable {'ACD'[q]} {form}")
    return out


def milp_seed(pool, rng=None, time_limit=60):
    s = milp_seeds(pool, time_limit=time_limit)
    return s[0] if s else None


def _key(team):
    return frozenset(c["id"] for c in team)


def dedupe(out):
    """Drop opponents whose 11 cards repeat an earlier opponent, and renumber the rest without gaps.
    An opponent identical to the team itself is kept once, as 'mirror' (a copy of this team)."""
    teams, res = out.get("opponent_teams", {}), out.get("results", {})
    mine = frozenset(p["id"] for p in out["players"])
    order = sorted(res, key=lambda n: (not n.startswith(("reference", "target")), n != "mirror"))
    seen, keep = set(), []
    for n in order:
        if n not in teams:
            keep.append((n, n)); continue
        k = frozenset(p["id"] for p in teams[n]["players"])
        if k in seen: continue
        seen.add(k)
        if k == mine and not n.startswith(("reference", "target")):
            keep.append((n, "mirror")); continue
        keep.append((n, "counter 0" if n == "mirror" else n))   # an old copy that no longer matches the team
    count, new_res, new_teams = {}, {}, {}
    for old, new in keep:
        base = new.rstrip("0123456789").strip()
        if base == "counter p": base = new = "counter"     # population teams are counter-teams too
        if base in ("counter", "fresh test", "final check"):
            count[base] = count.get(base, 0) + 1; new = f"{base} {count[base]}"
        new_res[new] = res[old]
        if old in teams: new_teams[new] = teams[old]
    order_rank = lambda n: ["reference", "target", "mirror", "counter", "fresh test", "final check"].index(
        next(b for b in ["reference", "target", "mirror", "counter", "fresh test", "final check"] if n.startswith(b)))
    out["results"] = dict(sorted(new_res.items(), key=lambda kv: (order_rank(kv[0]), int("0" + "".join(ch for ch in kv[0] if ch.isdigit())))))
    if teams: out["opponent_teams"] = {n: new_teams[n] for n in out["results"] if n in new_teams}
    return out


def build_myclub(series, owned_cards, all_cards, opponents=(), minutes=30, rounds=4, seed=1, log=print,
                 mode="standard", verify=0, candidates=(), polish_share=0.25):
    """opponents: teams (lists of card dicts) to beat, e.g. Reddit reference teams.
    mode "standard": good against the opponents and against counter teams the builder finds.
    mode "robust":   judged by its WORST result against any opponent or counter team, more rounds.
    mode "beat":     all the time goes into beating the given opponents (no counter teams).
    verify: number of fresh counter teams searched at the end (not used while building) as a check.
    candidates: (label, team) pairs, e.g. the Reddit team or a hand-built team. At the end every candidate
                and the built team are scored on the SAME opponents (references, counters, fresh tests) and
                the one with the best worst case is returned, so copying the Reddit team wins when it is best.
    Returns dict with the team, formation and results against every opponent tested."""
    set_icon_limit(series)
    rng = random.Random(seed)
    robust = mode == "robust"
    if mode == "beat":
        rounds = 0
    elif robust:
        rounds = max(rounds, 8)
    me = Pool(series, owned_cards)
    field = Pool(series, all_cards)
    T = minutes * 60
    owned_ids = {c["id"]: c for c in me.cards}
    pool_opps = [field.eff(o) for o in opponents]
    weights = [1 if mode == "beat" else 3] * len(pool_opps)
    names = [f"{'target' if mode == 'beat' else 'reference'} {i+1}" for i in range(len(pool_opps))]
    seeds = []
    for o in opponents:
        v = [owned_ids.get(c["id"]) for c in o]
        if all(v) and fits(v): seeds.append(v)
    opp_cards = dict(zip(names, opponents))   # every opponent team, saved so the site can show it
    t_pop = time.time()
    field_ids = {c["id"]: c for c in field.cards}
    same_pool = len(me.cards) == len(field.cards)
    # 1) a population of strong, different teams (any card: these are the teams other players can field)
    # 0) the owner's shape first: 5 cards unbeatable in one stat + the best tiebreak card (exact programs)
    ub = Unbeat(field, series)
    useeds = unbeat_seeds(field, series, ub, seconds=min(T * 0.12, 1500), log=log)
    pop = cat_seeds(field, series, seconds=min(T * 0.15, 1800), log=log)
    bal = balanced_teams(field, series, log=log, seconds=min(T * 0.06, 600))
    if mode != "beat":
        for k, t in enumerate(bal):
            pool_opps.append(field.eff(t)); weights.append(3); names.append(f"balanced {k+1}"); opp_cards[f"balanced {k+1}"] = t
    bal_mine = bal if same_pool else balanced_teams(me, series, seconds=min(T * 0.04, 400))
    bal_mine = [[owned_ids[c["id"]] for c in t] for t in bal_mine if all(c["id"] in owned_ids for c in t)]
    pop += milp_seeds(field, series, log=log)
    pop += useeds
    mine = pop if same_pool else cat_seeds(me, series, seconds=min(T * 0.08, 900), log=log) + milp_seeds(me, series, log=log) + \
        unbeat_seeds(me, series, ub, seconds=min(T * 0.08, 900), log=log)
    shape = lambda E: (lambda k: (k[0], k[2] if k[0] else k[1]))(ub.key(E))   # guard: tier, then tiebreak (or count)
    if mode != "beat":
        # 2) every population team is also an opponent: a team must hold up against all of them, not just against
        #    teams found by improving one starting team (that missed simple strong teams)
        Ep = [field.eff(t) for t in pop]
        for k, t in enumerate(pop):
            pool_opps.append(Ep[k]); weights.append(1); names.append(f"counter p{k+1}"); opp_cards[f"counter p{k+1}"] = t
    # 3) start from the owned population teams that do best against everyone (worst case, then total)
    def rr(t):
        Et = me.eff(t); per = [pscore(Et, O) for O in pool_opps]
        return ub.full_key(Et, per)
    mine = [[owned_ids[c["id"]] for c in t] for t in mine if all(c["id"] in owned_ids for c in t)]
    ranked = sorted(mine, key=rr, reverse=True)
    log(f"  population: {len(pop)} teams, {len(mine)} starting teams, {time.time() - t_pop:.0f}s")
    seeds += ranked[:6]
    ushape = [t for t in ranked if ub.key(me.eff(t))[0]][:3]       # the best owned teams of the owner's shape
    for t in ushape:
        if t not in seeds: seeds.append(t)
    log(f"  unbeatable-shape teams: {len([t for t in mine if ub.key(me.eff(t))[0]])}, best {ub.key(me.eff(ranked[0])) if ranked else None}")
    if not pool_opps:          # nothing to beat yet: start from the seed's own mirror
        base = seeds[-1]
        pool_opps = [field.eff(base)]; weights = [1]; names = ["mirror"]; opp_cards["mirror"] = base
    left = max(0.3, 1 - (time.time() - t_pop) / T)      # share of the time still available
    share = (0.95 if mode == "beat" else 0.45) * left
    verify_share = (0.1 if verify else 0) * left
    cands = []
    for k, sd in enumerate(seeds):
        g = shape if ub.key(me.eff(sd))[0] else None      # a seed of the owner's shape keeps it while improving
        b = optimize(me, sd, pool_opps, weights, T * (share - verify_share / 2) / max(1, len(seeds)), rng, log, f"seed{k}", robust, guard=g)
        cands.append(b)
    fk = lambda t: ub.full_key(me.eff(t), [pscore(me.eff(t), O) for O in pool_opps])
    team = max((b[1] for b in cands), key=fk)
    ubest = max((b[1] for b in cands if ub.key(me.eff(b[1]))[0]), key=fk, default=None)
    counters = []
    for rd in range(rounds):
        E = me.eff(team)
        # counter-teams start from the population teams that already do best against this team, from the team
        # itself, from the opponents and from earlier counters
        strong = sorted(pop, key=lambda t: -sum(play(field.eff(t), E, f)[0] for f in (0, 1)))[:4]
        starts = list(opponents) + [team] + counters + strong
        start = rng.choice(starts)
        start = [next((y for y in field.cards if y["id"] == c["id"]), c) for c in start]
        br = optimize(field, start, [E], [1], T * 0.25 * left / rounds, rng, None, f"counter{rd}")
        tg = shape if ub.key(E)[0] else None
        log(f"  counter-team {rd+1}: result vs my team {br[0][0]:+d}")
        if _key(br[1]) in {_key(x) for x in list(opponents) + counters}:
            log("    same as an earlier opponent: not added again")
            b = optimize(me, team, pool_opps, weights, T * (0.30 * left - verify_share / 2) / rounds, rng, log, f"improve{rd}", robust, guard=tg)
            team = b[1]; continue
        counters.append(br[1])
        pool_opps.append(field.eff(br[1])); weights.append(1); names.append(f"counter {rd+1}")
        opp_cards[f"counter {rd+1}"] = br[1]
        b = optimize(me, team, pool_opps, weights, T * (0.30 * left - verify_share / 2) / rounds, rng, log, f"improve{rd}", robust, guard=tg)
        team = b[1]
    E = me.eff(team)
    res = {}
    lab = {1: "WIN", 0: "DRAW", -1: "LOSS"}
    for n, O in zip(names, pool_opps):
        res[n] = {"you_lead_first": lab[play(E, O, 0)[0]], "they_lead_first": lab[play(E, O, 1)[0]]}
    # fresh stress tests: new counter teams searched against the FINAL team, never used to build it
    vr = random.Random(seed + 1000)
    for k in range(verify):
        start = vr.choice(list(opponents) + [team] + counters)
        start = [next((y for y in field.cards if y["id"] == c["id"]), c) for c in start]
        br = optimize(field, start, [E], [1], T * verify_share / verify, vr, None, f"fresh{k}")
        O = field.eff(br[1]); opp_cards[f"fresh test {k+1}"] = br[1]
        pool_opps.append(O); names.append(f"fresh test {k+1}")
        res[f"fresh test {k+1}"] = {"you_lead_first": lab[play(E, O, 0)[0]], "they_lead_first": lab[play(E, O, 1)[0]]}
        log(f"  fresh test {k+1}: {res[f'fresh test {k+1}']}")
    source = "builder"
    if ubest is not None and _key(ubest) != _key(team):      # the best team of the owner's shape always reaches the final check
        candidates = [("Unbeatable", ubest)] + list(candidates)
    if mode != "beat" and bal_mine:      # the best full-chem balanced teams also reach the final check
        bk = lambda t: ub.full_key(me.eff(t), [pscore(me.eff(t), O) for O in pool_opps])
        for t in sorted(bal_mine, key=bk, reverse=True)[:2]:
            if _key(t) != _key(team): candidates = list(candidates) + [("Balanced", t)]
    if candidates:              # final check: the builder's team vs the Reddit / hand-built teams
        # Fair test: each candidate also gets stress-test teams built specifically against IT, then every
        # team is scored on the same full set of opponents and the best worst case wins.
        valid = []
        for label, cand in candidates:
            cand = [owned_ids.get(c["id"]) for c in cand]
            if all(cand) and fits(cand): valid.append((label, cand))
            else: log(f"  {label}: skipped (not ownable or no formation fits)")
        n_chk = max(verify, 2); i = 0
        for label, cand in valid:
            Ec = me.eff(cand)
            for k in range(n_chk):
                start = vr.choice(list(opponents) + [cand, team] + counters)
                start = [next((y for y in field.cards if y["id"] == c["id"]), c) for c in start]
                br = optimize(field, start, [Ec], [1], max(20, min(T * 0.1, 600) / n_chk), vr, None, f"check{i}")   # capped: a long search must still finish inside the 6-hour job limit
                i += 1
                pool_opps.append(field.eff(br[1])); names.append(f"final check {i}"); opp_cards[f"final check {i}"] = br[1]
        def worst_case(Et):         # owner's shape first, then worst result vs any opponent, total results, stats
            return ub.full_key(Et, [pscore(Et, O) for O in pool_opps])
        best_key = worst_case(E)
        log(f"  built team: worst case {best_key}")
        for label, cand in valid:
            k = worst_case(me.eff(cand))
            log(f"  {label}: worst case {k}")
            # best worst case wins; equal worst case -> more wins/draws over all opponents -> stronger stats.
            # The current team ("Previous Best", always last) keeps its place on a full tie.
            if k > best_key or (label == "Previous Best" and k[:4] >= best_key[:4]):
                best_key, team, source = k, cand, label
        E = me.eff(team)
    if polish_share and mode != "beat":
        # systematic swap check of the chosen team against every opponent found so far
        ck, pteam = polish(me, team, pool_opps, [1] * len(pool_opps), T * polish_share * left, log, rng=random.Random(seed + 7),
                           guard=shape if ub.key(E)[0] else None)
        if _key(pteam) != _key(team):
            # the improved team must also face stress tests built specifically against it
            Ep = me.eff(pteam); n_chk = max(verify, 2)
            for k in range(n_chk):
                start = vr.choice(list(opponents) + [pteam, team] + counters)
                start = [next((y for y in field.cards if y["id"] == c["id"]), c) for c in start]
                br = optimize(field, start, [Ep], [1], max(20, min(T * 0.1, 600) / n_chk), vr, None, f"pcheck{k}")
                nm = f"final check {sum(1 for n in names if n.startswith('final check')) + 1}"
                pool_opps.append(field.eff(br[1])); names.append(nm); opp_cards[nm] = br[1]
            key = lambda Et: ub.full_key(Et, [pscore(Et, O) for O in pool_opps])
            ko, kp = key(E), key(Ep)
            log(f"  polished team {kp} vs chosen team {ko}")
            if kp[:4] > ko[:4]:
                team, source, E = pteam, "Polished", Ep
    if mode != "beat":
        # every other version of each player in the team (e.g. Can 89 Evo -> Can 92 Elite Evo): a swap is kept when it
        # is at least as good on worst case and total against EVERY opponent found, and better overall
        vkey = lambda Et: ub.full_key(Et, [pscore(Et, O) for O in pool_opps])
        by_pid = collections.defaultdict(list)
        for c in me.cards: by_pid[c["pid"]].append(c)
        ck = vkey(E); improved = True
        while improved:
            improved = False
            for i, c in enumerate(team):
                for v in by_pid[c["pid"]]:
                    if v["id"] == c["id"]: continue
                    t = team[:i] + [v] + team[i + 1:]
                    if not fits(t): continue
                    Et = me.eff(t); k = vkey(Et)
                    if k[:4] >= ck[:4] and k > ck:
                        log(f"  version swap: {c['name']} {c['rating']} -> {v['rating']} {k} vs {ck}")
                        team, E, ck, improved = t, Et, k, True
                        if source == "builder": source = "Polished"
                        break
                if improved: break
    if mode != "beat":
        # chem: a card below full chem stays only if it changes a result. Try each such card's slot with full-chem
        # options (the best cards for that position, and cards linking to the rest of the team); keep a swap when the
        # results against every test team are no worse (owner's shape included) and the team's chem goes up.
        from .core import chem as chem_of
        vkey = lambda Et: ub.full_key(Et, [pscore(Et, O) for O in pool_opps])
        ck, cc, t0c = vkey(E), team_chem(team), time.time()
        improved = True
        while improved and time.time() - t0c < min(T * 0.08, 900):
            improved = False
            ch = chem_of(team)
            for i in sorted(range(11), key=lambda i: ch[i]):
                if ch[i] >= 3: continue
                opts = {}
                for p in team[i]["P"]:
                    for c in me.pos_top.get(p, []): opts[c["id"]] = c
                for y in team:
                    for key in ("nationId", "leagueId", "clubId"):
                        for c in me.by[key][y[key]][:25]: opts[c["id"]] = c
                for c in opts.values():
                    if c["id"] == team[i]["id"] or any(z["pid"] == c["pid"] for k2, z in enumerate(team) if k2 != i): continue
                    t = team[:i] + [c] + team[i + 1:]
                    if not fits(t): continue
                    tc = team_chem(t)
                    if tc <= cc: continue
                    Et = me.eff(t); k = vkey(Et)
                    if k[:4] >= ck[:4]:
                        log(f"  chem swap: {team[i]['name']} {team[i]['rating']} (chem {ch[i]}) -> {c['name']} {c['rating']}, team chem {cc} -> {tc}, {k[:4]} vs {ck[:4]}")
                        team, E, ck, cc, improved = t, Et, k, tc, True
                        if source == "builder": source = "Polished"
                        break
                    if time.time() - t0c > min(T * 0.08, 900): break
                if improved: break
    res = {n: {"you_lead_first": lab[play(E, O, 0)[0]], "they_lead_first": lab[play(E, O, 1)[0]]}
           for n, O in zip(names, pool_opps)}
    out = describe(team, series)
    out["results"] = res
    out["source"] = source
    k = ub.key(me.eff(team))
    out["shape"] = {"unbeatable": k[1], "stat": ("attack", "control", "defence")[k[3]] if k[3] >= 0 else None, "tiebreak": k[2] if k[0] else None}
    out["mode"] = mode
    out["opponent_teams"] = {}
    for n, cards in opp_cards.items():
        try:
            out["opponent_teams"][n] = describe(cards, series)
        except Exception as e:   # never lose a finished build over a display extra
            log(f"  could not describe {n}: {e}")
    return dedupe(out)
