import json, asyncio, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
        seen = []
        async def on_resp(r):
            u = r.url; ct = r.headers.get("content-type", "")
            if any(x in u for x in ("json", "firestore", "api", ".js")) or "json" in ct:
                body = b""
                try: body = await r.body()
                except Exception: pass
                seen.append((r.status, u, ct, len(body), body[:1500]))
        pg.on("response", on_resp)
        for url in ["https://madfutdata.com/27/Evo-Chains", "https://madfutdata.com/27/Upgrade-Hub"]:
            try:
                await pg.goto(url, wait_until="networkidle", timeout=90000); await pg.wait_for_timeout(5000)
                txt = await pg.inner_text("body"); print("PAGE", url, "text:", txt[:3000].replace("\n", " | "))
            except Exception as e: print("PAGE FAIL", url, e)
        for st, u, ct, n, b0 in seen:
            print("REQ", st, u, ct, n)
            if ("evo" in u.lower() or "chain" in u.lower() or "upgrade" in u.lower()) and n: print("   BODY", b0.decode("utf8", "replace")[:1500])
        await b.close()
asyncio.run(main())
