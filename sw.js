// Offline-Speicher der DTW Lernapp. Neue Version = neuer Cache (Version kommt aus META.version über ?v=…).
const V = new URL(self.location).searchParams.get("v") || "1";
const CACHE = "dtw-lernapp-" + V;
const SHELL = ["./", "index.html", "app.css", "app.js", "fragen.js", "dtw-logo.jpg", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "impressum.html", "datenschutz.html", "fonts/Inter-400.woff2", "fonts/Inter-700.woff2"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("dtw-lernapp-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Fragen immer zuerst frisch aus dem Netz (neue Videos!), sonst aus dem Cache. Rest: Cache zuerst.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("fragen.js")) {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  // Bilder (img/) beim ersten Laden mit in den Offline-Speicher legen
  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (url.pathname.includes("/img/") && r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); } return r; })));
});
