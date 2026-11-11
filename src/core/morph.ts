/*
 * Frontières dynamiques (F-28) : interpolation des contours entre deux états connus de la carte.
 *
 * Pour chaque État présent dans les deux états (même identifiant Wikidata ou même nom), ses parties
 * principales sont rééchantillonnées avec le même nombre de points, alignées (sens et point de départ),
 * puis interpolées linéairement selon la date. Les États qui n'existent que d'un côté apparaissent ou
 * disparaissent en fondu (propriété _op). Il s'agit d'une visualisation : les frontières réelles
 * changent souvent d'un coup (traité, conquête), ce que l'interface signale.
 */
type Pt = [number, number];
type FC = GeoJSON.FeatureCollection;
type Props = Record<string, any>;

const MAX_PARTS = 4;      // parties interpolées par État (les plus grandes)
const MIN_PTS = 24, MAX_PTS = 160;

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2; // signée : > 0 sens antihoraire
}
function centroid(r: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of r) { x += p[0]; y += p[1]; }
  return [x / r.length, y / r.length];
}
const d2 = (a: Pt, b: Pt) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Rééchantillonne un anneau fermé en n points équidistants (le long du contour). */
export function resample(ring: Pt[], n: number): Pt[] {
  const pts = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  const m = pts.length;
  if (m === 0) return [];
  const cum = [0];
  for (let i = 0; i < m; i++) cum.push(cum[i] + Math.sqrt(d2(pts[i], pts[(i + 1) % m])));
  const total = cum[m] || 1;
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (seg < m - 1 && cum[seg + 1] < target) seg++;
    const a = pts[seg], b = pts[(seg + 1) % m];
    const len = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / len;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Aligne B sur A (même sens de parcours, décalage minimisant les distances). */
export function align(A: Pt[], B: Pt[]): Pt[] {
  let b = B;
  if (Math.sign(ringArea(A)) !== Math.sign(ringArea(B))) b = B.slice().reverse();
  const n = A.length;
  let best = 0, bestCost = Infinity;
  const step = n > 96 ? 2 : 1; // recherche du décalage (approchée pour les grands anneaux)
  for (let s = 0; s < n; s += step) {
    let c = 0;
    for (let i = 0; i < n && c < bestCost; i += 3) c += d2(A[i], b[(i + s) % n]);
    if (c < bestCost) { bestCost = c; best = s; }
  }
  return A.map((_, i) => b[(i + best) % n]);
}

interface Part { ring: Pt[]; area: number; c: Pt }
function partsOf(g: GeoJSON.Geometry | null): Part[] {
  if (!g) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  return polys.map(p => { const r = p[0] as Pt[]; return { ring: r, area: Math.abs(ringArea(r)), c: centroid(r) }; })
    .filter(p => p.ring.length >= 4).sort((a, b) => b.area - a.area);
}
function ringPerimeter(r: Pt[]): number { let s = 0; for (let i = 1; i < r.length; i++) s += Math.sqrt(d2(r[i - 1], r[i])); return s; }

interface MorphPair { a: Pt[]; b: Pt[] }
interface Entity {
  props: Props;          // propriétés de l'état de départ (ou d'arrivée pour un État naissant)
  propsB?: Props;
  pairs: MorphPair[];    // parties interpolées
  staticA: Pt[][][];     // parties non appariées de A (disparaissent)
  staticB: Pt[][][];     // parties non appariées de B (apparaissent)
  kind: "both" | "out" | "in";
}

const keyOf = (p: Props) => (p.QID ? "q:" + p.QID + ":" + p.NAME : "n:" + p.NAME);

/** Prépare l'interpolation entre deux collections d'États (une fois par couple d'états connus). */
export class Morpher {
  private entities: Entity[] = [];
  constructor(A: FC, B: FC) {
    const byKey = new Map<string, GeoJSON.Feature>();
    const byName = new Map<string, GeoJSON.Feature>();
    for (const f of B.features) { byKey.set(keyOf(f.properties || {}), f); if (f.properties?.NAME) byName.set(f.properties.NAME, f); }
    const usedB = new Set<GeoJSON.Feature>();
    for (const fa of A.features) {
      const pa = fa.properties || {};
      const fb = byKey.get(keyOf(pa)) || (pa.NAME ? byName.get(pa.NAME) : undefined);
      if (!fb || usedB.has(fb)) { this.entities.push({ props: pa, pairs: [], staticA: polysOf(fa.geometry), staticB: [], kind: "out" }); continue; }
      usedB.add(fb);
      this.entities.push(this.pairEntity(fa, fb));
    }
    for (const fb of B.features) if (!usedB.has(fb)) this.entities.push({ props: fb.properties || {}, pairs: [], staticA: [], staticB: polysOf(fb.geometry), kind: "in" });
  }

  private pairEntity(fa: GeoJSON.Feature, fb: GeoJSON.Feature): Entity {
    const A = partsOf(fa.geometry), B = partsOf(fb.geometry);
    const usedB = new Set<number>();
    const pairs: MorphPair[] = [];
    const staticA: Pt[][][] = [];
    A.forEach((pa, i) => {
      if (i >= MAX_PARTS) { staticA.push([pa.ring]); return; }
      let bi = -1, bd = Infinity;
      B.forEach((pb, j) => {
        if (usedB.has(j)) return;
        // Distance entre centres rapportée à la taille de la partie (sans unité)
        const d = Math.sqrt(d2(pa.c, pb.c)) / Math.max(1e-6, Math.sqrt(Math.max(pa.area, pb.area)));
        if (d < bd) { bd = d; bi = j; }
      });
      // Parties trop éloignées ou de tailles trop différentes : fondu plutôt qu'un déplacement absurde
      if (bi < 0 || bd > 3 || B[bi].area / Math.max(pa.area, 1e-9) > 25 || pa.area / Math.max(B[bi].area, 1e-9) > 25) { staticA.push([pa.ring]); return; }
      usedB.add(bi);
      const n = Math.max(MIN_PTS, Math.min(MAX_PTS, Math.round(Math.max(ringPerimeter(pa.ring), ringPerimeter(B[bi].ring)) * 6)));
      const ra = resample(pa.ring, n);
      pairs.push({ a: ra, b: align(ra, resample(B[bi].ring, n)) });
    });
    const staticB = B.filter((_, j) => !usedB.has(j)).map(p => [p.ring]);
    return { props: fa.properties || {}, propsB: fb.properties || {}, pairs, staticA, staticB, kind: "both" };
  }

  /** Collection interpolée pour f ∈ [0, 1]. Propriété _op : opacité relative (fondus). */
  at(f: number): FC {
    f = Math.max(0, Math.min(1, f));
    const e = f * f * (3 - 2 * f); // adoucissement (smoothstep)
    const features: GeoJSON.Feature[] = [];
    for (const ent of this.entities) {
      const props = { ...(e < 0.5 || !ent.propsB ? ent.props : ent.propsB) };
      if (ent.kind === "out") { if (e < 1) features.push(feat(ent.staticA, { ...props, _op: 1 - e })); continue; }
      if (ent.kind === "in") { if (e > 0) features.push(feat(ent.staticB, { ...props, _op: e })); continue; }
      const polys: Pt[][][] = ent.pairs.map(p => {
        const ring = p.a.map((pa, i) => [pa[0] + (p.b[i][0] - pa[0]) * e, pa[1] + (p.b[i][1] - pa[1]) * e] as Pt);
        ring.push(ring[0]);
        return [ring];
      });
      if (polys.length) features.push(feat(polys, { ...props, _op: 1 }));
      if (ent.staticA.length && e < 1) features.push(feat(ent.staticA, { ...props, _op: 1 - e }));
      if (ent.staticB.length && e > 0) features.push(feat(ent.staticB, { ...props, _op: e }));
    }
    return { type: "FeatureCollection", features };
  }
}

function polysOf(g: GeoJSON.Geometry | null): Pt[][][] {
  if (!g) return [];
  return (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []) as Pt[][][];
}
function feat(polys: Pt[][][], props: Props): GeoJSON.Feature {
  return { type: "Feature", properties: props, geometry: polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys } };
}
