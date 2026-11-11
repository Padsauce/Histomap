/*
 * Couche d'accès réseau (F-70, F-71).
 * - Limite le nombre de requêtes simultanées et déduplique les requêtes identiques en cours.
 * - Cache mémoire + cache persistant IndexedDB (option `persist`).
 * - Mode dégradé : si le réseau échoue, on sert la copie en cache et on le signale.
 * - Réessaie une fois après un délai en cas de limitation de débit (HTTP 429).
 */
const MAX_CONCURRENT = 4;
const memory = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();
const queue: { task: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];
let active = 0;

export interface NetStatus { online: boolean; cachedAt?: number }
const listeners = new Set<(s: NetStatus) => void>();

// ---------------- IndexedDB minimaliste (clé/valeur) ----------------
let dbPromise: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open("histomap-cache", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("http");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbPromise;
}
async function idbGet(key: string): Promise<{ value: unknown; time: number } | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise(resolve => {
    try {
      const r = d.transaction("http").objectStore("http").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await db();
  if (!d) return;
  try { d.transaction("http", "readwrite").objectStore("http").put({ value, time: Date.now() }, key); } catch { /* quota, etc. */ }
}

// ---------------- File d'attente ----------------
function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ task, resolve: resolve as (v: unknown) => void, reject });
    pump();
  });
}
function pump(): void {
  while (active < MAX_CONCURRENT && queue.length) {
    const { task, resolve, reject } = queue.shift()!;
    active++;
    task().then(resolve, reject).finally(() => { active--; pump(); });
  }
}
function emit(status: NetStatus): void {
  listeners.forEach(fn => { try { fn(status); } catch { /* écouteur fautif */ } });
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public status: number) { super(`HTTP ${status}`); }
}

interface GetOptions { persist?: boolean; as?: "json" | "text"; init?: RequestInit; cacheKey?: string }

/** Récupère une ressource (JSON par défaut). */
export function get<T = unknown>(url: string, opts: GetOptions = {}): Promise<T> {
  const key = opts.cacheKey || url;
  if (memory.has(key)) return Promise.resolve(memory.get(key) as T);
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const p = schedule(async () => {
    try {
      let res = await fetch(url, opts.init);
      for (let attempt = 0; (res.status === 429 || res.status >= 502) && attempt < 2; attempt++) {
        // Limitation de débit ou erreur passagère du serveur : on respecte Retry-After (plafonné à 10 s) avant de réessayer
        const ra = parseFloat(res.headers.get("Retry-After") || "");
        await sleep(Math.min(10, Number.isFinite(ra) ? ra : 2 + attempt * 3) * 1000 + Math.random() * 500);
        res = await fetch(url, opts.init);
      }
      if (!res.ok) throw new HttpError(res.status);
      const data = opts.as === "text" ? await res.text() : await res.json();
      memory.set(key, data);
      if (opts.persist) idbSet(key, data);
      emit({ online: true });
      return data as T;
    } catch (err) {
      const cached = await idbGet(key);       // repli sur le cache persistant
      if (cached) {
        memory.set(key, cached.value);
        if (!(err instanceof HttpError)) emit({ online: false, cachedAt: cached.time });
        return cached.value as T;
      }
      if (!(err instanceof HttpError)) emit({ online: false });
      throw err;
    }
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const getJSON = <T = unknown>(url: string, opts: GetOptions = {}) => get<T>(url, { ...opts, as: "json" });
export const getText = (url: string, opts: GetOptions = {}) => get<string>(url, { ...opts, as: "text" });
/** Place une réponse en cache (paquets hors ligne : textes servis sans réseau). */
export const prime = (url: string, data: unknown) => { memory.set(url, data); };
export const onStatus = (fn: (s: NetStatus) => void) => { listeners.add(fn); };
