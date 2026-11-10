"""Private preview of the site at /beta/ (not linked anywhere, hidden from search engines).

  python scripts/beta.py make      refresh docs/beta/ from the live site
  python scripts/beta.py release   publish docs/beta/ to the live site

The preview has its own scripts and page; the teams, cards and other data are the live site's.
"""
import json, os, re, shutil, sys

DOCS = os.path.join(os.path.dirname(__file__), "..", "docs")
BETA = os.path.join(DOCS, "beta")
FILES = ["app.js", "engine.js", "worker.js", "sbc-solver.js", "sbcworker.js"]
HEAD = ('<!--beta--><base href="../"><meta name="robots" content="noindex,nofollow">'
        '<script>window.APPDIR = "beta/";</script><!--/beta-->')


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


if __name__ == "__main__":
    {"make": make, "release": release}[sys.argv[1]]()
