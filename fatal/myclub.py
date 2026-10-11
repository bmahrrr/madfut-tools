"""FATAL My Club team builder.

A team is judged by playing the exact game (see game.c) with perfect play from both sides
against a pool of opponents: reference teams you supply, plus "counter-teams" that the
builder itself searches for (teams built specifically to beat the current best team).
The search is a local search over owned cards that respects positions and chemistry.
"""
import collections, random, time
from .core import AUTO, FORMATIONS, boosted, effective, formation_fit, pid, describe, CTRL
from .game import play
from .milp import build

_fit_cache = {}


def fits(team):
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
        self.auto = sorted([x for x in cs if x["color"] in AUTO], key=lambda x: -x["T3"])[:80]

    def eff(self, team, full=False):
        E, _ = effective(team, self.series, full)
        return E

    def propose(self, team, rng):
        i = rng.randrange(11)
        r = rng.random()
        if r < 0.45:
            c = rng.choice(self.top)
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


def evaluate(E, opps, weights, bound=None):
    tot = lv = 0
    rem = sum(2 * w for w in weights)
    for O, w in zip(opps, weights):
        for f in (0, 1):
            o, l = play(E, O, f)
            tot += w * o; lv += w * l; rem -= w
            if bound is not None and tot + rem < bound:
                return None
    return tot, lv


def secondary(E):
    s = 0
    for k in range(3):
        v = sorted((e[k] for e in E), reverse=True); s += sum(v[:7])
    return s + sum(e[3] for e in E) / 10


def optimize(pool, seed, opps, weights, seconds, rng, log=None, label=""):
    cur = seed[:]
    E = pool.eff(cur)
    o, l = evaluate(E, opps, weights)
    ckey = (o, l, secondary(E)); best = (ckey, cur[:])
    t0 = time.time(); it = 0
    while time.time() - t0 < seconds:
        it += 1
        new = pool.propose(cur, rng)
        if new is None: continue
        if rng.random() < 0.3:
            n2 = pool.propose(new, rng)
            if n2 is not None: new = n2
        E2 = pool.eff(new)
        r = evaluate(E2, opps, weights, bound=ckey[0] - 1)
        if r is None: continue
        k2 = (r[0], r[1], secondary(E2))
        if k2 > ckey or (k2[:2] == ckey[:2] and rng.random() < 0.3) or \
                (k2[0] == ckey[0] and k2[1] >= ckey[1] - 1 and rng.random() < 0.05):
            cur = new; ckey = k2
            if k2 > best[0]:
                best = (k2, cur[:])
                if log: log(f"  [{label}] {time.time()-t0:.0f}s score={k2[0]} margin={k2[1]}")
        if ckey[0] < best[0][0] - 1:
            cur = best[1][:]; ckey = best[0]
    return best


def milp_seed(pool, rng=None, time_limit=60):
    """A strong, chem-valid starting team: maximise total in-game stats with full chem."""
    chosen = {}
    positions = {p for f in FORMATIONS.values() for p in f}
    for p in positions:
        el = [x for x in pool.cards if p in x["P"]]
        for key in ("T3", "bA", "bC", "bD"):
            for x in sorted(el, key=lambda x: -x[key])[:25]: chosen[x["id"]] = x
    for x in pool.auto: chosen[x["id"]] = x
    cards = []
    for i, c in enumerate(chosen.values()):
        c = dict(c); c["_i"] = i; cards.append(c)
    best = None
    for form in ("4-4-2", "4-3-3", "3-4-1-2", "4-2-3-1", "4-1-2-1-2", "3-5-2"):
        sq = build(cards, FORMATIONS[form], lambda c, s: c["T3"], chem_weight=lambda c, s: 6,
                   time_limit=time_limit)
        if sq:
            tot = sum(e[0] + e[1] + e[2] for e in pool.eff(sq))
            if best is None or tot > best[0]: best = (tot, sq)
    return best[1] if best else None


def build_myclub(series, owned_cards, all_cards, opponents=(), minutes=30, rounds=4, seed=1, log=print):
    """opponents: list of teams (lists of card dicts) to beat, e.g. reference teams.
    Returns dict with the team, formation and results against every opponent tested."""
    rng = random.Random(seed)
    me = Pool(series, owned_cards)
    field = Pool(series, all_cards)
    T = minutes * 60
    owned_ids = {c["id"]: c for c in me.cards}
    pool_opps = [field.eff(o) for o in opponents]
    weights = [3] * len(pool_opps)
    names = [f"reference {i+1}" for i in range(len(pool_opps))]
    seeds = []
    for o in opponents:
        v = [owned_ids.get(c["id"]) for c in o]
        if all(v) and fits(v): seeds.append(v)
    ms = milp_seed(me)
    if ms: seeds.append([owned_ids[c["id"]] for c in ms])
    if not pool_opps:          # nothing to beat yet: start from the seed's own mirror
        base = seeds[-1]
        pool_opps = [field.eff(base)]; weights = [1]; names = ["mirror"]
    cands = []
    for k, sd in enumerate(seeds):
        b = optimize(me, sd, pool_opps, weights, T * 0.45 / max(1, len(seeds)), rng, log, f"seed{k}")
        cands.append(b)
    best = max(cands, key=lambda b: b[0]); team = best[1]
    for rd in range(rounds):
        E = me.eff(team)
        start = rng.choice([o for o in opponents] + [team]) if opponents else team
        start = [next((y for y in field.cards if y["id"] == c["id"]), c) for c in start]
        br = optimize(field, start, [E], [1], T * 0.25 / rounds, rng, None, f"counter{rd}")
        log(f"  counter-team {rd+1}: result vs my team {br[0][0]:+d}")
        pool_opps.append(field.eff(br[1])); weights.append(1); names.append(f"counter {rd+1}")
        b = optimize(me, team, pool_opps, weights, T * 0.30 / rounds, rng, log, f"improve{rd}")
        team = b[1]
    E = me.eff(team)
    res = {}
    lab = {1: "WIN", 0: "DRAW", -1: "LOSS"}
    for n, O in zip(names, pool_opps):
        res[n] = {"you_lead_first": lab[play(E, O, 0)[0]], "they_lead_first": lab[play(E, O, 1)[0]]}
    out = describe(team, series)
    out["results"] = res
    return out
