"""Python wrapper around the C My Club game solver (compiled automatically on first use)."""
import array, ctypes, os, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(HERE, "_game.so")


def _lib():
    src = os.path.join(HERE, "game.c")
    if not os.path.exists(SO) or os.path.getmtime(SO) < os.path.getmtime(src):
        subprocess.check_call(["gcc", "-O3", "-march=native", "-shared", "-fPIC", "-o", SO, src])
    L = ctypes.CDLL(SO)
    P = ctypes.POINTER(ctypes.c_int)
    L.setup.argtypes = [ctypes.c_int, P, P, P, P]
    L.game.argtypes = [ctypes.c_int, P, P, P, P]
    L.level.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    L.duelres.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int]
    L.outcome.argtypes = [ctypes.c_int, P, P, P, P]
    L.margin.argtypes = [ctypes.c_int, P, P, P, P]
    return L


L = _lib()
_cache = {}
OUTCOME = {0: "LOSS", 1: "LOSS", 2: "DRAW", 3: "WIN", 4: "WIN"}


def _arrs(a, b):
    fa = [v for t in a for v in t[:3]]; fb = [v for t in b for v in t[:3]]
    ta = [t[3] for t in a]; tb = [t[3] for t in b]
    I33 = ctypes.c_int * 33; I11 = ctypes.c_int * 11
    return fa, fb, ta, tb, I33(*fa), I33(*fb), I11(*ta), I11(*tb)


def play(a, b, first):
    """a, b: lists of 11 (attack, control, defence, tiebreak_total). first: 0 = a leads first.
    Returns (outcome -1/0/1 for a, level 0..4)."""
    fa, fb, ta, tb, A, B, TA, TB = _arrs(a, b)
    key = bytes(array.array("h", fa + fb + ta + tb + [first]))
    v = _cache.get(key)
    if v is None:
        # the builders only need win/draw/loss; the margin (level) is approximated from it
        o = L.outcome(first, A, B, TA, TB)
        v = (o, o + 2)
        if len(_cache) > 400000:
            _cache.clear()
        _cache[key] = v
    return v


_mcache = {}


def margin(a, b, first):
    """Exact final score difference for a (perfect play both sides). Finer than play(): a search signal."""
    fa, fb, ta, tb, A, B, TA, TB = _arrs(a, b)
    key = bytes(array.array("h", fa + fb + ta + tb + [first]))
    v = _mcache.get(key)
    if v is None:
        v = L.margin(first, A, B, TA, TB)
        if len(_mcache) > 400000:
            _mcache.clear()
        _mcache[key] = v
    return v


class Match:
    """Stateful helper for move-by-move advice."""

    def __init__(self, a, b, first):
        self.a, self.b, self.first = a, b, first
        _, _, _, _, A, B, TA, TB = _arrs(a, b)
        L.setup(first, A, B, TA, TB)
        self.ma = self.mb = (1 << 11) - 1
        self.d = 0
        self.n = 0

    def my_turn(self):
        return (self.n % 2 == 0) == (self.first == 0)

    def value(self):
        return L.level(self.ma, self.mb, self.d)

    def best_lead(self):
        opts = []
        for i in range(11):
            if not self.ma >> i & 1: continue
            for s in range(3):
                w = min(L.level(self.ma & ~(1 << i), self.mb & ~(1 << k), self.d + L.duelres(i, k, s, 1))
                        for k in range(11) if self.mb >> k & 1)
                opts.append((w, -self.a[i][3], i, s))
        opts.sort(reverse=True)
        return opts

    def best_answer(self, j, s):
        opts = []
        for i in range(11):
            if not self.ma >> i & 1: continue
            r = L.duelres(i, j, s, 0)
            opts.append((L.level(self.ma & ~(1 << i), self.mb & ~(1 << j), self.d + r), r, -self.a[i][3], i))
        opts.sort(reverse=True)
        return opts

    def apply(self, i, j, r):
        self.ma &= ~(1 << i); self.mb &= ~(1 << j); self.d += r; self.n += 1
