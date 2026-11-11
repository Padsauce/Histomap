/*
 * Index mondial léger (F-72) : éléments datés, localisés et notables du monde entier,
 * produits par tools/build-index.mjs et servis comme fichiers statiques (public/index/).
 * Les tranches de temps sont chargées à la demande ; les libellés viennent de Wikidata en direct.
 */
import { getJSON } from "./net";
import { getEntities, type EntityInfo } from "./wikidata";
import type { CategoryId, Precision } from "./types";

type Pt = [number, number];

export type RegionId = "europe" | "afrique" | "moyen-orient" | "asie-sud" | "asie-est" | "asie-nord" | "ameriques" | "oceanie";
export const REGIONS: RegionId[] = ["europe", "afrique", "moyen-orient", "asie-sud", "asie-est", "asie-nord", "ameriques", "oceanie"];

/** Grande région d'un point (découpage volontairement simple, à des fins de comparaison). */
export function regionOf([lon, lat]: Pt): RegionId {
  if (lon < -25) return "ameriques";
  if (lat < -10 && lon > 110) return "oceanie";
  if (lon > 140 && lat < 0) return "oceanie";
  if (lon >= 34 && lon < 63 && lat >= 12 && lat < 42) return "moyen-orient";
  if (lon >= 26 && lon < 45 && lat >= 35 && lat < 42) return "moyen-orient"; // Anatolie
  if (lat < 37 && lon >= -25 && lon < 52) return "afrique";
  if (lat >= 35 && lon >= -25 && lon < 45) return "europe";
  if (lat >= 45 && lon >= 45 && lon < 60) return "europe"; // Oural
  if (lon >= 60 && lon < 92 && lat >= 5 && lat < 37) return "asie-sud";
  if (lat >= 37 && lon >= 45 && (lon < 92 || lat >= 50)) return "asie-nord";
  return "asie-est";
}

const PRECISIONS: Precision[] = ["day", "month", "year", "decade", "century", "millennium", "1e4y", "1e5y"];

export interface WorldItem {
  qid: string;
  coords: Pt;
  t0: number;
  t1: number;
  precision: Precision;
  category: CategoryId;
  sitelinks: number;
  /** 0 événement, 1 naissance, 2 fondation/création, 3 fin/dissolution */
  kind: number;
  placePrecision: "exact" | "city" | "country";
  region: RegionId;
}

interface Manifest {
  built: string;
  categories: CategoryId[];
  buckets: { from: number; to: number; file: string; count: number }[];
}

const base = () => (import.meta.env?.BASE_URL ?? "./") + "index/";
let manifestP: Promise<Manifest | null> | null = null;
const loaded = new Map<string, WorldItem[]>();
const loading = new Map<string, Promise<void>>();

export function manifest(): Promise<Manifest | null> {
  if (!manifestP) manifestP = getJSON<Manifest>(base() + "manifest.json").catch(() => null);
  return manifestP;
}

/** Charge les tranches qui recouvrent [t0, t1]. Résout quand elles sont disponibles. */
export async function ensure(t0: number, t1: number): Promise<void> {
  const m = await manifest();
  if (!m) return;
  const wanted = m.buckets.filter(b => b.to > t0 && b.from <= t1);
  await Promise.all(wanted.map(b => {
    if (loaded.has(b.file)) return Promise.resolve();
    if (!loading.has(b.file)) {
      loading.set(b.file, getJSON<number[][]>(base() + b.file, { persist: true }).then(rows => {
        loaded.set(b.file, rows.map(r => {
          const coords: Pt = [r[1], r[2]];
          return {
            qid: "Q" + r[0], coords, t0: r[3], t1: r[4], precision: PRECISIONS[r[5]] || "year",
            category: m.categories[r[6]], sitelinks: r[7], kind: r[8],
            placePrecision: (["exact", "city", "country"] as const)[r[9]] || "exact",
            region: regionOf(coords)
          };
        }));
      }).catch(() => { /* tranche indisponible : ignorée */ }).finally(() => loading.delete(b.file)));
    }
    return loading.get(b.file)!;
  }));
}

/** Éléments chargés dont l'intervalle recoupe [t0, t1], triés par notoriété décroissante. */
export function query(t0: number, t1: number, filter?: (it: WorldItem) => boolean): WorldItem[] {
  const out: WorldItem[] = [];
  for (const items of loaded.values()) {
    for (const it of items) if (it.t0 <= t1 && it.t1 >= t0 && (!filter || filter(it))) out.push(it);
  }
  return out.sort((a, b) => b.sitelinks - a.sitelinks);
}

// ---------------- Libellés (en direct, dans la langue de l'interface) ----------------
const labels = new Map<string, EntityInfo>();
const pending = new Map<string, Promise<void>>();

export function labelOf(qid: string): EntityInfo | undefined { return labels.get(qid); }

/** Charge les libellés manquants ; résout quand ils sont disponibles. */
export async function loadLabels(qids: string[], lang: string): Promise<void> {
  const key = (q: string) => lang + ":" + q;
  const missing = [...new Set(qids)].filter(q => !labels.has(key(q)) && !pending.has(key(q)));
  if (missing.length) {
    const p = getEntities(missing, lang).then(info => {
      for (const q of missing) labels.set(key(q), info[q] || {});
    }).catch(() => { /* réessai au prochain affichage */ }).finally(() => missing.forEach(q => pending.delete(key(q))));
    missing.forEach(q => pending.set(key(q), p));
  }
  await Promise.all(qids.map(q => pending.get(key(q))).filter(Boolean));
  for (const q of qids) if (labels.has(key(q))) labels.set(q, labels.get(key(q))!);
}

export const builtAt = async () => (await manifest())?.built;
