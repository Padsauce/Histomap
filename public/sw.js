/*
 * Service worker d'Histomap (F-83) : l'application elle-même (page, scripts, styles), l'index mondial
 * et la paléogéographie restent disponibles sans réseau une fois visités.
 * Les données externes (Wikidata, Wikipédia, frontières) passent par le cache IndexedDB de l'application ;
 * les tuiles du fond de carte ne sont pas mises en cache (conditions d'usage des fournisseurs).
 */
const CACHE = "histomap-app-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Gros fichiers de frontières : laissés au cache IndexedDB de l'application
  if (url.pathname.includes("/borders/")) return;
  // Réseau d'abord (version à jour), cache en secours ; la page d'accueil sert de repli de navigation
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
