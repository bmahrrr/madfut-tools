// Lets the site install as an app and keep working with poor or no signal.
// Network first for everything on this site (so new teams and new versions always show when online); the last
// copy is kept and used when the network fails. Google Fonts are kept too. Nothing else is touched.
const CACHE = "madfut-tools-v1";
const CORE = ["./", "index.html", "app.js", "engine.js", "worker.js", "sbc-solver.js", "sbcworker.js", "cards.json", "names.json",
  "formations.json", "objectives.json", "results/index.json", "results/week.json", "results/extras.json", "manifest.webmanifest", "icon-192.png"];
const key = url => { const u = new URL(url); return u.origin + u.pathname; };     // ?v= / ?t= don't make new copies
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(p => fetch(p, { cache: "no-store" }).then(r => r.ok && c.put(key(new URL(p, self.registration.scope)), r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  const mine = u.origin === location.origin && u.pathname.startsWith(new URL(self.registration.scope).pathname);
  const font = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if (!mine && !font) return;
  const k = req.mode === "navigate" ? key(new URL("./", self.registration.scope)) : key(req.url);
  e.respondWith(fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(CACHE).then(c => c.put(k, copy)); }
    return r;
  }).catch(() => caches.match(k).then(r => r || (req.mode === "navigate" ? caches.match(key(new URL("index.html", self.registration.scope))) : Response.error()))));
});
