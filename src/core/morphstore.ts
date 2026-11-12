/*
 * Service des frontières dynamiques :
 *   - calcul des transitions dans un Web Worker, une à la fois ; une demande immédiate (transition
 *     affichée) passe devant le calcul de fond, qui reprend ensuite ;
 *   - enregistrement local (IndexedDB) : une transition n'est jamais calculée deux fois ;
 *   - préparation en continu de toutes les transitions d'un sujet, pendant que l'utilisateur fait
 *     autre chose, avec suivi de l'avancement ;
 *   - export / import pour les paquets .histomap.
 */
import { Morpher, MORPH_VERSION, type MorphData } from "./morph";
import type { BordersFrame, FramePair } from "./borders";

type FC = GeoJSON.FeatureCollection;

/** Clé d'une transition : version de l'algorithme + empreintes des deux états de carte. */
export const morphKey = (A: BordersFrame, B: BordersFrame) => `m${MORPH_VERSION}|${A.key}→${B.key}`;

// ---------------- IndexedDB (base dédiée) ----------------
let dbP: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbP) dbP = new Promise(resolve => {
    try {
      const req = indexedDB.open("histomap-data", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("morphs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbP;
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise(resolve => {
    try {
      const r = fn(d.transaction("morphs", mode).objectStore("morphs"));
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}
const idbGet = (k: string) => idb<MorphData>("readonly", s => s.get(k));
const idbHas = async (k: string) => (await idb<IDBValidKey>("readonly", s => s.getKey(k))) !== undefined;
const idbPut = (k: string, v: MorphData) => idb("readwrite", s => s.put(v, k));

// ---------------- File de calcul ----------------
interface Job { key: string; A: FC; B: FC; timeout: number; background: boolean; resolve: (m: Morpher | null) => void }

export interface PlanProgress { total: number; done: number; failed: number; active: boolean }

export class MorphService {
  private mem = new Map<string, Morpher>();
  private worker: Worker | null = null;
  private running: { job: Job; id: number; timer: number } | null = null;
  private queue: Job[] = [];
  private seq = 0;
  private planId = 0;
  progress: PlanProgress = { total: 0, done: 0, failed: 0, active: false };
  onProgress?: (p: PlanProgress) => void;

  private remember(key: string, m: Morpher) {
    this.mem.delete(key);
    this.mem.set(key, m);
    if (this.mem.size > 40) this.mem.delete(this.mem.keys().next().value!);
  }

  /** Transition déjà connue (mémoire, puis enregistrement local). */
  async load(key: string, A: FC): Promise<Morpher | null> {
    const m = this.mem.get(key);
    if (m) return m;
    const d = await idbGet(key);
    if (!d || d.v !== MORPH_VERSION) return null;
    const mm = Morpher.fromData(d, A);
    this.remember(key, mm);
    return mm;
  }
  async has(key: string): Promise<boolean> { return this.mem.has(key) || idbHas(key); }

  /** Calcule une transition (ou la reprend si elle est déjà connue). Renvoie null si délai dépassé. */
  compute(key: string, A: FC, B: FC, opts: { timeout: number; background: boolean }): Promise<Morpher | null> {
    return new Promise(resolve => {
      const job: Job = { key, A, B, ...opts, resolve };
      if (opts.background) this.queue.push(job);
      else {
        this.queue.unshift(job);
        // Une demande immédiate interrompt le calcul de fond, qui sera repris plus tard
        if (this.running?.job.background) this.preempt();
      }
      this.pump();
    });
  }

  private preempt() {
    const r = this.running!;
    clearTimeout(r.timer);
    this.worker?.terminate();
    this.worker = null;
    this.running = null;
    this.queue.splice(this.queue.findIndex(j => !j.background) + 1, 0, r.job); // juste après la demande immédiate
  }

  private async pump() {
    if (this.running || !this.queue.length) return;
    const job = this.queue.shift()!;
    // Déjà calculée entre-temps (par une autre demande) ?
    const known = await this.load(job.key, job.A);
    if (known) { job.resolve(known); this.pump(); return; }
    if (this.running) { this.queue.unshift(job); return; }
    if (!this.worker) {
      try { this.worker = new Worker(new URL("./morph.worker.ts", import.meta.url), { type: "module" }); }
      catch { // navigateur sans workers modules : calcul direct
        const m = new Morpher(job.A, job.B);
        this.store(job.key, m.toData(), job.A); job.resolve(this.mem.get(job.key)!); this.pump(); return;
      }
    }
    const id = ++this.seq, w = this.worker;
    const timer = window.setTimeout(() => {
      if (this.running?.id !== id) return;
      w.terminate(); this.worker = null; this.running = null;
      job.resolve(null);
      this.pump();
    }, job.timeout);
    this.running = { job, id, timer };
    w.onmessage = (e: MessageEvent<{ id: number; data?: MorphData; error?: string }>) => {
      if (e.data.id !== id || this.running?.id !== id) return;
      clearTimeout(timer);
      this.running = null;
      if (e.data.data) { this.store(job.key, e.data.data, job.A); job.resolve(this.mem.get(job.key)!); }
      else job.resolve(null);
      this.pump();
    };
    w.onerror = () => { if (this.running?.id !== id) return; clearTimeout(timer); this.running = null; this.worker = null; job.resolve(null); this.pump(); };
    w.postMessage({ id, A: job.A, B: job.B });
  }

  private store(key: string, data: MorphData, A: FC) {
    this.remember(key, Morpher.fromData(data, A));
    idbPut(key, data);
  }

  // ---------------- Préparation en continu d'un sujet ----------------
  /** Prépare toutes les transitions données, en arrière-plan ; remplace la préparation précédente. */
  async startPlan(pairs: FramePair[], keyOf: (p: FramePair) => string): Promise<void> {
    const id = ++this.planId;
    // Les tâches de fond de l'ancienne préparation sont abandonnées
    this.queue = this.queue.filter(j => !j.background);
    this.progress = { total: pairs.length, done: 0, failed: 0, active: pairs.length > 0 };
    this.emit();
    for (const p of pairs) {
      if (id !== this.planId) return;
      const key = keyOf(p);
      if (await this.has(key)) this.progress.done++;
      else {
        const m = await this.compute(key, p.A.fc, p.B.fc, { timeout: 180000, background: true });
        if (id !== this.planId) return;
        if (m) this.progress.done++; else this.progress.failed++;
      }
      this.emit();
      await new Promise(r => setTimeout(r, 50)); // laisse respirer l'interface entre deux transitions
    }
    if (id === this.planId) { this.progress.active = false; this.emit(); }
  }
  cancelPlan() { this.planId++; this.queue = this.queue.filter(j => !j.background); this.progress = { total: 0, done: 0, failed: 0, active: false }; this.emit(); }
  private emit() { this.onProgress?.({ ...this.progress }); }

  // ---------------- Paquets ----------------
  async export(keys: string[]): Promise<Record<string, MorphData>> {
    const out: Record<string, MorphData> = {};
    for (const k of keys) { const d = await idbGet(k); if (d) out[k] = d; }
    return out;
  }
  async import(morphs: Record<string, MorphData>): Promise<number> {
    let n = 0;
    for (const [k, d] of Object.entries(morphs || {})) if (d?.v === MORPH_VERSION) { await idbPut(k, d); n++; }
    return n;
  }
}

export const morphService = new MorphService();
