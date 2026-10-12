"""Download the latest MadFut 27 card data from madfutdata.com and write data/cards.json.

Usage:
  python scripts/update_data.py                 # download using config/sources.json
  python scripts/update_data.py --realm FILE [--updates FILE]   # use local files instead

The output is a compact table used by both the Python builders and the website.
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

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


def doc_players(f, kind):
    """Cards inside one Firestore document (fields already converted), the same way madfutdata reads them."""
    pl = f.get("players", [])
    if isinstance(pl, dict):
        pl = list(pl.values())
    if kind == "draftCups" and isinstance(f.get("rewardPlayer"), dict):
        pl = [f["rewardPlayer"]]
    evos = f.get("evos")
    if isinstance(evos, list) and evos:
        top = max(evos, key=lambda e: int((e or {}).get("id") or 0))
        pl = list((top or {}).get("players") or [])[1:]     # final stage of the highest evo
    return [p for p in pl if isinstance(p, dict)]


def collection_players(obj, prefix, kind):
    """All FC-<prefix> cards in a Firestore collection listing (documents named <prefix>_<n>)."""
    out = []
    for doc in (obj or {}).get("documents", []):
        name = doc.get("name", "").split("/")[-1]
        if not name.startswith(prefix + "_"):
            continue
        f = {k: conv(v) for k, v in doc.get("fields", {}).items()}
        for i, p in enumerate(doc_players(f, kind)):
            p = dict(p)
            if not p.get("id") or p.get("id") in ("id001", "id002", "id003"):
                p["id"] = f"{kind}_{name}_{i}"
            p["_src"] = kind
            out.append(p)
    return out


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


def build_names(cards, loc, year):
    """Club / nation / league names from EA's FC web-app text file, for the ids that appear in the cards."""
    import re
    def grab(pats):
        out = {}
        for pat in pats:
            rx = re.compile(pat)
            for k, v in loc.items():
                m = rx.fullmatch(k)
                if m and int(m.group(1)) not in out:
                    out[int(m.group(1))] = v
        return out
    clubs = grab([rf"global\.teamabbr15\.{year}\.team(\d+)", rf"global\.teamabbr10\.{year}\.team(\d+)", r"clubAbbrvByID_(\d+)"])
    nations = grab([r"search\.nationName\.nation(\d+)", r"nationAbbrvByID_(\d+)"])
    leagues = grab([rf"global\.leagueFull\.{year}\.league(\d+)", rf"global\.leagueabbr15\.{year}\.league(\d+)"])
    ci, ni, li = FIELDS.index("clubId"), FIELDS.index("nationId"), FIELDS.index("leagueId")
    used = lambda i: {c[i] for c in cards if isinstance(c[i], int)}
    pick = lambda M, ids: {str(k): M[k] for k in sorted(ids) if k in M}
    return {"clubs": pick(clubs, used(ci)), "nations": pick(nations, used(ni)), "leagues": pick(leagues, used(li))}


def update_names(cards, src, loc_file=None):
    path = os.path.join(ROOT, "docs", "names.json")
    try:
        loc = json.load(open(loc_file)) if loc_file else fetch(src["names_url"])
    except Exception as e:
        print("names: could not download, keeping the old file", e); return
    names = build_names(cards, loc, src.get("names_year", "20" + src.get("game_prefix", "27")))
    if not names["clubs"]:
        print("names: nothing found, keeping the old file"); return
    json.dump(names, open(path, "w"), ensure_ascii=False, separators=(",", ":"))
    print("names:", {k: len(v) for k, v in names.items()})


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (madfut-tools updater)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    # Firestore lists come in pages: follow nextPageToken and merge the documents
    while isinstance(data, dict) and data.get("nextPageToken") and "firestore.googleapis.com" in url:
        sep = "&" if "?" in url else "?"
        more = fetch(url + sep + "pageToken=" + urllib.parse.quote(data.pop("nextPageToken")))
        data.setdefault("documents", []).extend(more.get("documents", []))
        data["nextPageToken"] = more.get("nextPageToken")
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--realm")
    ap.add_argument("--updates")
    ap.add_argument("--loc", help="local copy of EA's web-app text file (for club / nation / league names)")
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
        got = False
        for url in src.get("update_urls", []):
            try:
                upd = players_from(fetch(url), prefix); print("downloaded", url, len(upd)); got = True; break
            except Exception as e:
                print("failed", url, e)
        if src.get("update_urls") and not got:
            # never replace good data with data that is missing the newest releases
            sys.exit("Could not download the new-release cards; keeping the existing card data.")
    by_id = {p["id"]: p for p in base if "id" in p}
    for p in upd:
        if "id" in p:
            by_id[p["id"]] = p
    # reward cards: SBC rewards (POTMs, SBC Premium...), objectives, draft cups, Elite Evos.
    # They only add cards that aren't already known; a failed download just skips that source.
    if not a.realm:
        fs = src.get("firestore_base")
        for kind in src.get("extra_collections", []):
            try:
                got = collection_players(fetch(f"{fs}/{kind}?pageSize=300"), prefix, kind)
            except Exception as e:
                print("failed", kind, e); got = []
            if kind == "sbcGroups":
                # madfutdata keeps some SBC files on its own site; those replace Firestore's file with the same number
                for n in range(1, 41):
                    try:
                        loc = collection_players({"documents": [dict(d, name=f"x/{prefix}_{n}") for d in (lambda j: j if isinstance(j, list) else j.get("documents", [j]))(fetch(src["sbc_local"].format(n=n))) if d.get("fields")]}, prefix, kind)
                    except Exception:
                        continue
                    got = [p for p in got if not p["id"].startswith(f"sbcGroups_{prefix}_{n}_")] + loc
                    print("local sbc file", n, len(loc))
            new = 0
            for p in got:
                if p.get("rating") is None:
                    continue
                if p["id"] not in by_id:
                    by_id[p["id"]] = p; new += 1
            print(kind, "cards:", len(got), "new:", new)
    cards = [[p.get(k, "" if k in ("altPositions", "specialChem") else None) for k in FIELDS]
             for p in by_id.values() if p.get("rating") is not None and p.get("attack") is not None]
    cards.sort(key=lambda c: (-c[2], c[1]))
    if src.get("names_url") or a.loc:
        update_names(cards, src, a.loc)
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
