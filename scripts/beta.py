"""Private preview of the site at /beta/ (not linked anywhere, hidden from search engines).

  python scripts/beta.py make      refresh docs/beta/ from the live site
  python scripts/beta.py release   publish docs/beta/ to the live site
  python scripts/beta.py test      refresh the private test copy docs/test/ from the preview
  python scripts/beta.py promote   publish docs/test/ to the preview

/test/ is a second, private preview (own address and home screen app) for changes not yet ready for the testers on /beta/.

The preview has its own scripts and page; the teams, cards and other data are the live site's.
"""
import json, os, re, shutil, sys

DOCS = os.path.join(os.path.dirname(__file__), "..", "docs")
BETA = os.path.join(DOCS, "beta")
FILES = ["app.js", "engine.js", "worker.js", "sbc-solver.js", "sbcworker.js", "puzzle-core.js", "game.wasm"]
HEAD = ('<!--beta--><base href="../"><meta name="robots" content="noindex,nofollow">'
        '<script>window.APPDIR = "beta/";</script>'
        '<link rel="manifest" href="beta/manifest.webmanifest"><meta name="apple-mobile-web-app-title" content="MT Preview">'   # its own home screen app
        '<!--/beta-->')


def make():
    os.makedirs(BETA, exist_ok=True)
    for f in FILES: shutil.copy(os.path.join(DOCS, f), os.path.join(BETA, f))
    shutil.copy(os.path.join(DOCS, "version.json"), os.path.join(BETA, "version.json"))
    s = open(os.path.join(DOCS, "index.html")).read()
    s = s.replace("<head>", "<head>\n" + HEAD, 1)
    s = re.sub(r'<script src="(engine|sbc-solver|app)\.js', r'<script src="beta/\1.js', s)
    s = s.replace("<title>MadFut Tools</title>", "<title>MadFut Tools (Preview)</title>", 1)
    open(os.path.join(BETA, "index.html"), "w").write(s)
    print("preview refreshed from the live site")


def release():
    for f in FILES: shutil.copy(os.path.join(BETA, f), os.path.join(DOCS, f))
    shutil.copy(os.path.join(BETA, "version.json"), os.path.join(DOCS, "version.json"))
    s = open(os.path.join(BETA, "index.html")).read()
    s = re.sub(r"\n?<!--beta-->.*?<!--/beta-->", "", s, flags=re.S)
    s = s.replace('<script src="beta/', '<script src="')
    s = s.replace("<title>MadFut Tools (Preview)</title>", "<title>MadFut Tools</title>", 1)
    open(os.path.join(DOCS, "index.html"), "w").write(s)
    print("preview released to the live site:", json.load(open(os.path.join(DOCS, "version.json")))["v"])


TEST = os.path.join(DOCS, "test")


def _copy(src, dst, a, b, title_a, title_b, app_a, app_b):
    """copy one preview folder to another, swapping its folder name, title and home screen app name"""
    os.makedirs(dst, exist_ok=True)
    for f in FILES + ["version.json"]: shutil.copy(os.path.join(src, f), os.path.join(dst, f))
    w = open(os.path.join(dst, "sbcworker.js")).read().replace("\\/" + a + "\\/", "\\/" + b + "\\/")
    open(os.path.join(dst, "sbcworker.js"), "w").write(w)
    s = open(os.path.join(src, "index.html")).read().replace(f'"{a}/', f'"{b}/').replace(f"{a}/manifest", f"{b}/manifest")
    s = s.replace(f"window.APPDIR = \"{a}/\"", f"window.APPDIR = \"{b}/\"").replace(f"<title>MadFut Tools ({title_a})</title>", f"<title>MadFut Tools ({title_b})</title>")
    s = s.replace(f'content="{app_a}"', f'content="{app_b}"')
    open(os.path.join(dst, "index.html"), "w").write(s)
    m = json.load(open(os.path.join(src, "manifest.webmanifest")))
    m.update(name=f"MadFut Tools {title_b}", short_name=app_b, description=f"{title_b} copy of MadFut Tools")
    json.dump(m, open(os.path.join(dst, "manifest.webmanifest"), "w"), indent=1)


def test():
    _copy(BETA, TEST, "beta", "test", "Preview", "Test", "MT Preview", "MT Test"); print("test copy refreshed from the preview")


def promote():
    _copy(TEST, BETA, "test", "beta", "Test", "Preview", "MT Test", "MT Preview"); print("test copy published to the preview")


if __name__ == "__main__":
    {"make": make, "release": release, "test": test, "promote": promote}[sys.argv[1]]()
