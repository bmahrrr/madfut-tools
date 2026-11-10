"""Run independent searches on every CPU core (GitHub build machines have 4).

pmap(fn, n) returns [fn(0), ..., fn(n-1)], computed in forked worker processes. fn can be any function or closure:
the workers are forked after it is set, so nothing needs pickling except the results. Inside a worker (or with one
core, or one job) it simply runs in order, so nesting is safe.
"""
import multiprocessing as mp
import os

_FN = None
_CHILD = False


def cores():
    n = int(os.environ.get("BUILD_CORES") or 0)
    if not n:
        n = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else (os.cpu_count() or 1)
    return max(1, n)


def _init():
    global _CHILD
    _CHILD = True


def _run(i):
    return _FN(i)


def pmap(fn, n, workers=None):
    global _FN
    w = min(n, workers or cores())
    if _CHILD or w <= 1:
        return [fn(i) for i in range(n)]
    _FN = fn
    try:
        with mp.get_context("fork").Pool(w, initializer=_init) as p:
            return p.map(_run, range(n), chunksize=1)
    finally:
        _FN = None
