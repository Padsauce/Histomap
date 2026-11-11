/*
 * Fournisseurs de frontières (F-23, F-24).
 *
 * Un « cadre » (BordersFrame) est l'état des frontières à afficher pour une date :
 *   - mode rapide : instantanés de historical-basemaps (≈ 50 dates, monde entier, tracés approximatifs) ;
 *   - mode précis : Cliopatria (Seshat), résolution de quelques années de 3400 av. J.-C. à 2024,
 *     avec identifiants Wikidata ; repli sur le mode rapide hors de sa couverture ou s'il est indisponible.
 * Les deux produisent des entités au même schéma (NAME, SUBJECTO…) pour le reste de l'application.
 */
import { getJSON } from "./net";
import { fromHistYear, histYear } from "./time";

type FC = GeoJSON.FeatureCollection;
export type BordersMode = "fast" | "precise";

export interface BordersFrame {
  key: string;
  source: "hb" | "clio";
  /** Année historique de référence (instantané ou année exacte). */
  year: number;
  fc: FC;
  /** Ensembles composites (empires, alliances) : contours seulement (F-27). */
  composites: FC;
}

// ---------------- Mode rapide : historical-basemaps ----------------
const BASEMAPS_COMMIT = "4b5039e50d8d2464b065bd76ad6086cd4597108d";
const BASEMAPS_URL = (y: number) =>
  `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAPS_COMMIT}/geojson/world_${y < 0 ? "bc" + (-y) : y}.geojson`;
export const SNAPSHOTS = [
  -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300,
  -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400,
  1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938,
  1945, 1960, 1994, 2000, 2010
].map(y => ({ year: y, t: fromHistYear(y) }));

export const snapshotFor = (t: number) => { let s = SNAPSHOTS[0]; for (const x of SNAPSHOTS) if (x.t <= t + 1e-9) s = x; return s; };
const EMPTY: FC = { type: "FeatureCollection", features: [] };
const hbCache = new Map<number, FC>();

async function fastFrame(t: number): Promise<BordersFrame> {
  const snap = snapshotFor(t);
  let fc = hbCache.get(snap.year);
  if (!fc) { fc = await getJSON<FC>(BASEMAPS_URL(snap.year), { persist: true }); hbCache.set(snap.year, fc); }
  return { key: "hb:" + snap.year, source: "hb", year: snap.year, fc, composites: EMPTY };
}

/** Clé du cadre rapide pour une date (sans chargement) : permet de savoir si le cadre change. */
export const fastKey = (t: number) => "hb:" + snapshotFor(t).year;

// ---------------- Mode précis : Cliopatria ----------------
interface ClioManifest { source: string; built: string; buckets: { from: number; to: number; file: string; count: number }[] }
const clioBase = () => (import.meta.env?.BASE_URL ?? "./") + "borders/clio/";
let clioManifestP: Promise<ClioManifest | null> | null = null;
const clioBuckets = new Map<string, FC>();
const clioFrames = new Map<number, BordersFrame>();

export function clioManifest(): Promise<ClioManifest | null> {
  if (!clioManifestP) clioManifestP = getJSON<ClioManifest>(clioBase() + "manifest.json").catch(() => null);
  return clioManifestP;
}
export const CLIO_RANGE: [number, number] = [-3400, 2024];

// Frontières d'un paquet hors ligne (prioritaires sur le réseau pour leur période)
let pkgClio: { from: number; to: number; fc: FC } | null = null;
export function installPackage(b: { hb: { year: number; fc: FC }[]; clio?: { from: number; to: number; fc: FC } }): void {
  for (const x of b.hb) hbCache.set(x.year, x.fc);
  if (b.clio) { pkgClio = b.clio; clioFrames.clear(); }
}

/** Tracés Cliopatria valables pendant [fromY, toY] (toutes tranches confondues). */
export async function clioRecords(fromY: number, toY: number): Promise<FC | null> {
  const m = await clioManifest();
  if (!m) return pkgClio && pkgClio.from <= fromY && pkgClio.to >= toY ? pkgClio.fc : null;
  const seen = new Set<string>();
  const features: GeoJSON.Feature[] = [];
  for (const b of m.buckets.filter(x => x.to >= fromY && x.from <= toY)) {
    let fc = clioBuckets.get(b.file);
    if (!fc) { fc = await getJSON<FC>(clioBase() + b.file, { persist: true }); clioBuckets.set(b.file, fc); }
    for (const f of fc.features) {
      const p = f.properties!;
      const id = `${p.NAME}|${p.FROM}|${p.TO}`;
      if (p.TO < fromY || p.FROM > toY || seen.has(id)) continue;
      seen.add(id);
      features.push(f);
    }
  }
  return { type: "FeatureCollection", features };
}

async function clioFrame(Y: number): Promise<BordersFrame | null> {
  if (clioFrames.has(Y)) return clioFrames.get(Y)!;
  let fc: FC | undefined, fileKey: string;
  if (pkgClio && Y >= pkgClio.from && Y <= pkgClio.to) { fc = pkgClio.fc; fileKey = "pkg"; }
  else {
    const m = await clioManifest();
    const b = m?.buckets.find(x => Y >= x.from && Y <= x.to);
    if (!b) return null;
    fileKey = b.file;
    fc = clioBuckets.get(b.file);
    if (!fc) { fc = await getJSON<FC>(clioBase() + b.file, { persist: true }); clioBuckets.set(b.file, fc); }
  }
  const b = { file: fileKey };
  const fills: GeoJSON.Feature[] = [], comps: GeoJSON.Feature[] = [];
  const ids: string[] = [];
  fc.features.forEach((f, i) => {
    const p = f.properties!;
    if (p.FROM > Y || p.TO < Y) return;
    ids.push(String(i));
    // Normalisation vers le schéma commun : le membre d'un ensemble « (X) » dépend de X
    const member = String(p.MEMBEROF || "").split(";")[0];
    const props = { ...p, SUBJECTO: member.startsWith("(") ? member.slice(1, -1) : "", PARTOF: member, BORDERPRECISION: 2 };
    (p.COMPOSITE ? comps : fills).push({ type: "Feature", geometry: f.geometry, properties: props });
  });
  // Deux années consécutives avec les mêmes tracés partagent le même cadre (même clé)
  const key = "clio:" + b.file + ":" + ids.join(",");
  const same = [...clioFrames.values()].find(fr => fr.key === key);
  const frame: BordersFrame = same ? { ...same, year: Y } :
    { key, source: "clio", year: Y, fc: { type: "FeatureCollection", features: fills }, composites: { type: "FeatureCollection", features: comps } };
  if (same) frame.key = same.key;
  clioFrames.set(Y, frame);
  if (clioFrames.size > 400) clioFrames.delete(clioFrames.keys().next().value!);
  return frame;
}

/** Cadre de frontières pour une date et un mode ; repli sur le mode rapide si nécessaire. */
export async function frameFor(t: number, mode: BordersMode): Promise<BordersFrame> {
  if (mode === "precise") {
    const Y = histYear(t);
    if (Y >= CLIO_RANGE[0] && Y <= CLIO_RANGE[1]) {
      try {
        const f = await clioFrame(Y);
        if (f) return f;
      } catch { /* repli ci-dessous */ }
    }
  }
  return fastFrame(t);
}

/** Précharge le cadre suivant (lecture fluide). */
export function prefetch(t: number, mode: BordersMode): void {
  if (mode === "precise") clioManifest().then(m => {
    const Y = histYear(t);
    const b = m?.buckets.find(x => Y >= x.from && Y <= x.to);
    if (b && !clioBuckets.has(b.file)) getJSON<FC>(clioBase() + b.file, { persist: true }).then(fc => clioBuckets.set(b.file, fc)).catch(() => {});
  });
  else {
    const i = SNAPSHOTS.indexOf(snapshotFor(t));
    const next = SNAPSHOTS[i + 1];
    if (next && !hbCache.has(next.year)) getJSON<FC>(BASEMAPS_URL(next.year), { persist: true }).then(fc => hbCache.set(next.year, fc)).catch(() => {});
  }
}

/**
 * État connu suivant (pour les frontières dynamiques) : prochain instantané en mode rapide,
 * prochaine année où un tracé change en mode précis. Renvoie aussi les dates des deux états.
 */
export async function nextFrame(frame: BordersFrame, mode: BordersMode): Promise<{ next: BordersFrame; tA: number; tB: number } | null> {
  if (frame.source === "hb") {
    const i = SNAPSHOTS.findIndex(s => s.year === frame.year);
    const nx = SNAPSHOTS[i + 1];
    if (i < 0 || !nx) return null;
    const next = await fastFrame(nx.t);
    return { next, tA: SNAPSHOTS[i].t, tB: nx.t };
  }
  if (mode !== "precise") return null;
  let start = -Infinity, change = Infinity;
  for (const f of [...frame.fc.features, ...frame.composites.features]) {
    const p = f.properties!;
    if (p.FROM > start) start = p.FROM;
    if (p.TO < change) change = p.TO;
  }
  const nextY = change + 1;
  if (!Number.isFinite(nextY) || nextY > CLIO_RANGE[1]) return null;
  const next = await clioFrame(nextY);
  if (!next) return null;
  return { next, tA: fromHistYear(Math.max(start, CLIO_RANGE[0])), tB: fromHistYear(nextY) };
}
