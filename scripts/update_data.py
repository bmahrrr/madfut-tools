"""Download the latest MadFut 27 card data from madfutdata.com and write data/cards.json.

Usage:
  python scripts/update_data.py                 # download using config/sources.json
  python scripts/update_data.py --realm FILE [--updates FILE]   # use local files instead

The output is a compact table used by both the Python builders and the website.
"""
import argparse, json, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIELDS = ["id", "name", "rating", "color", "position", "altPositions", "attack", "control",
          "defense", "nationId", "leagueId", "clubId", "specialChem", "baseId"]


def conv(v):
    """Convert a Firestore REST value into plain Python."""
    if not isinstance(v, dict):
        return v
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return v["doubleValue"]
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    if "arrayValue" in v: return [conv(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v: return {k: conv(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "timestampValue" in v: return v["timestampValue"]
    return v


def players_from(obj, prefix="27"):
    """Accept the several shapes madfutdata serves and return a list of player dicts."""
    if isinstance(obj, dict) and "players" in obj and isinstance(obj["players"], list):
        return obj["players"]
    if isinstance(obj, dict) and "fields" in obj:          # single Firestore document
        f = {k: conv(v) for k, v in obj["fields"].items()}
        return f.get("players", [])
    if isinstance(obj, dict) and "documents" in obj:        # Firestore list (updates)
        out = []
        for doc in obj["documents"]:
            name = doc.get("name", "").split("/")[-1]
            if not name.startswith(prefix + "_"):   # e.g. 27_1, 27_2 ... (plain numbers are older games)
                continue
            f = {k: conv(v) for k, v in doc.get("fields", {}).items()}
            pl = f.get("players", [])
            if isinstance(pl, dict):
                pl = list(pl.values())
            out.extend(pl)
        return out
    if isinstance(obj, list):
        return obj
    return []


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (madfut-tools updater)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--realm")
    ap.add_argument("--updates")
    a = ap.parse_args()
    src = json.load(open(os.path.join(ROOT, "config", "sources.json")))
    prefix = src.get("game_prefix", "27")

    if a.realm:
        realm = json.load(open(a.realm))
    else:
        realm = None
        for url in src["realm_urls"]:
            try:
                realm = fetch(url); print("downloaded", url); break
            except Exception as e:
                print("failed", url, e)
        if realm is None:
            sys.exit("Could not download the main card file. Check config/sources.json.")
    base = players_from(realm, prefix)
    print("base cards:", len(base))

    upd = []
    if a.updates:
        upd = players_from(json.load(open(a.updates)), prefix)
    elif not a.realm:
        for url in src.get("update_urls", []):
            try:
                upd = players_from(fetch(url), prefix); print("downloaded", url, len(upd)); break
            except Exception as e:
                print("failed", url, e)
    by_id = {p["id"]: p for p in base if "id" in p}
    for p in upd:
        if "id" in p:
            by_id[p["id"]] = p
    cards = [[p.get(k, "" if k in ("altPositions", "specialChem") else None) for k in FIELDS]
             for p in by_id.values() if p.get("rating") is not None and p.get("attack") is not None]
    cards.sort(key=lambda c: (-c[2], c[1]))
    out = {"fields": FIELDS, "updated": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), "count": len(cards), "cards": cards}
    path = os.path.join(ROOT, "data", "cards.json")
    old = None
    if os.path.exists(path):
        try:
            old = json.load(open(path)).get("cards")
        except Exception:
            pass
    if old == cards:
        print("no change in card data"); return
    json.dump(out, open(path, "w"), separators=(",", ":"), ensure_ascii=False)
    # the website reads a copy from docs/
    json.dump(out, open(os.path.join(ROOT, "docs", "cards.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    print("wrote", len(cards), "cards")


if __name__ == "__main__":
    main()
