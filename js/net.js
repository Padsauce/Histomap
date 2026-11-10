/*
 * Couche d'accès réseau (F-70, F-71).
 * - Limite le nombre de requêtes simultanées.
 * - Déduplique les requêtes identiques en cours.
 * - Cache mémoire + cache persistant IndexedDB (option `persist`).
 * - Mode dégradé : si le réseau échoue, on sert la copie en cache et on le signale.
 */
(function () {
  const MAX_CONCURRENT = 4;
  const memory = new Map();       // url -> données
  const inflight = new Map();     // url -> Promise
  const queue = [];
  let active = 0;
  const listeners = new Set();

  // ---------------- IndexedDB minimaliste (clé/valeur) ----------------
  let dbPromise = null;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(resolve => {
      try {
        const req = indexedDB.open("histomap-cache", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("http");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    return dbPromise;
  }
  async function idbGet(key) {
    const d = await db();
    if (!d) return undefined;
    return new Promise(resolve => {
      try {
        const r = d.transaction("http").objectStore("http").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(undefined);
      } catch (_) { resolve(undefined); }
    });
  }
  async function idbSet(key, value) {
    const d = await db();
    if (!d) return;
    try { d.transaction("http", "readwrite").objectStore("http").put({ value, time: Date.now() }, key); } catch (_) { /* quota, etc. */ }
  }

  // ---------------- File d'attente ----------------
  function schedule(task) {
    return new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (active < MAX_CONCURRENT && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active++;
      task().then(resolve, reject).finally(() => { active--; pump(); });
    }
  }

  function emit(status) { listeners.forEach(fn => { try { fn(status); } catch (_) { /* écouteur fautif */ } }); }

  /**
   * Récupère une ressource (JSON par défaut, ou texte avec { as: "text" }).
   * @param {string} url
   * @param {{ persist?: boolean, as?: "json" | "text" }} opts
   */
  function get(url, opts = {}) {
    if (memory.has(url)) return Promise.resolve(memory.get(url));
    if (inflight.has(url)) return inflight.get(url);
    const p = schedule(async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const err = new Error(`HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const data = opts.as === "text" ? await res.text() : await res.json();
        memory.set(url, data);
        if (opts.persist) idbSet(url, data);
        emit({ online: true });
        return data;
      } catch (err) {
        if (err.status) throw err;          // réponse HTTP explicite : pas de repli
        const cached = await idbGet(url);   // erreur réseau : repli sur le cache persistant
        if (cached) {
          memory.set(url, cached.value);
          emit({ online: false, cachedAt: cached.time });
          return cached.value;
        }
        emit({ online: false });
        throw err;
      }
    }).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  window.Net = {
    get,
    getJSON: (url, opts) => get(url, { ...opts, as: "json" }),
    getText: (url, opts) => get(url, { ...opts, as: "text" }),
    onStatus: fn => listeners.add(fn)
  };
})();
