/*
 * Frontières dynamiques (F-28) — transferts de territoire.
 *
 * Entre deux états connus A et B, on ne déforme pas les contours : on calcule, pour chaque État,
 *   - la partie conservée            garde = A ∩ B           (immobile, coordonnées d'origine) ;
 *   - les portions transférées       Pxy  = (A_x − B_x) ∩ (B_y − A_y)   (de l'État x vers l'État y) ;
 *   - les portions perdues ou gagnées sans contrepartie (terres qui deviennent ou cessent d'être
 *     revendiquées) : elles apparaissent ou disparaissent en fondu.
 * Pendant la transition, un front rectiligne traverse chaque portion transférée depuis le côté de
 * l'État qui la gagne : la partie déjà franchie appartient à y, le reste encore à x. Les deux morceaux
 * sont découpés par la même droite : ils se complètent exactement (ni vide, ni chevauchement), et tout
 * ce qui ne change pas de mains reste fixe.
 */
import pc from "polygon-clipping";

type Pt = [number, number];
type Ring = Pt[];
type Poly = Ring[];
type MP = Poly[];
type Props = Record<string, any>;
type FC = GeoJSON.FeatureCollection;

const EPS_AREA = 1e-4; // ≈ 1 km² : en dessous, écarts de numérisation ignorés

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------
function toMP(g: GeoJSON.Geometry | null | undefined): MP {
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates as Poly];
  if (g.type === "MultiPolygon") return g.coordinates as MP;
  return [];
}
function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return a / 2;
}
export function mpArea(mp: MP): number {
  let s = 0;
  for (const p of mp) { s += Math.abs(ringArea(p[0])); for (let k = 1; k < p.length; k++) s -= Math.abs(ringArea(p[k])); }
  return s;
}
function mpCentroid(mp: MP): Pt {
  let x = 0, y = 0, w = 0;
  for (const p of mp) {
    const r = p[0], a = Math.abs(ringArea(r)) || 1e-12;
    let cx = 0, cy = 0;
    for (const q of r) { cx += q[0]; cy += q[1]; }
    x += (cx / r.length) * a; y += (cy / r.length) * a; w += a;
  }
  return w ? [x / w, y / w] : [0, 0];
}
type BBox = [number, number, number, number];
function bboxOf(mp: MP): BBox {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of mp) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}
const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const clean = (mp: MP): MP => mp.filter(p => p[0] && p[0].length >= 4 && Math.abs(ringArea(p[0])) > 1e-9);
const safe = (fn: () => MP): MP => { try { return clean(fn()); } catch { return []; } };
const inter = (a: MP, b: MP) => (a.length && b.length ? safe(() => pc.intersection(a as any, b as any) as MP) : []);
const diff = (a: MP, ...b: MP[]) => (!a.length ? [] : b.every(x => !x.length) ? a : safe(() => pc.difference(a as any, ...(b.filter(x => x.length) as any)) as MP));
const union = (...a: MP[]) => { const xs = a.filter(x => x.length); return xs.length <= 1 ? (xs[0] || []) : safe(() => pc.union(...(xs as [any, ...any[]])) as MP); };

/** Découpe un anneau par le demi-plan { p : p·d ≤ s } (ou ≥ s) — algorithme de Sutherland-Hodgman. */
function clipRing(r: Ring, d: Pt, s: number, keepBelow: boolean): Ring {
  const out: Ring = [];
  const pts = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r;
  const val = (p: Pt) => (p[0] * d[0] + p[1] * d[1] - s) * (keepBelow ? 1 : -1);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const va = val(a), vb = val(b);
    if (va <= 0) out.push(a);
    if ((va <= 0) !== (vb <= 0)) {
      const t = va / (va - vb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (out.length >= 3) out.push(out[0]);
  return out;
}
function clipMP(mp: MP, d: Pt, s: number, keepBelow: boolean): MP {
  const res: MP = [];
  for (const p of mp) {
    const outer = clipRing(p[0], d, s, keepBelow);
    if (outer.length < 4) continue;
    const holes = p.slice(1).map(h => clipRing(h, d, s, keepBelow)).filter(h => h.length >= 4);
    res.push([outer, ...holes]);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Préparation des transferts
// ---------------------------------------------------------------------------
interface Entity { key: string; propsA?: Props; propsB?: Props; a: MP; b: MP; changed: boolean; keep: MP; lost: MP; gained: MP; bbB: BBox; bbLost: BBox }
interface Patch { from: string; to: string; geom: MP; d: Pt; s0: number; s1: number }

const keyOf = (p: Props) => (p.QID ? "q:" + p.QID + ":" + p.NAME : "n:" + p.NAME);

function sameGeom(a: MP, b: MP): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class Morpher {
  private ents = new Map<string, Entity>();
  private patches: Patch[] = [];
  private fadeOut = new Map<string, MP>(); // perdu sans successeur
  private fadeIn = new Map<string, MP>();  // gagné sans prédécesseur
  /** Durée de préparation (ms), pour le diagnostic. */
  buildMs = 0;

  constructor(A: FC, B: FC) {
    const t0 = performance.now();
    const collect = (fc: FC, side: "a" | "b") => {
      for (const f of fc.features) {
        const p = f.properties || {};
        const k = keyOf(p);
        let e = this.ents.get(k);
        if (!e) { e = { key: k, a: [], b: [], changed: false, keep: [], lost: [], gained: [], bbB: [0, 0, 0, 0], bbLost: [0, 0, 0, 0] }; this.ents.set(k, e); }
        const mp = toMP(f.geometry);
        if (side === "a") { e.propsA = e.propsA || p; e.a = e.a.length ? e.a.concat(mp) : mp; }
        else { e.propsB = e.propsB || p; e.b = e.b.length ? e.b.concat(mp) : mp; }
      }
    };
    collect(A, "a");
    collect(B, "b");

    // Parties conservées, perdues, gagnées (États dont le tracé change seulement)
    const changed: Entity[] = [];
    for (const e of this.ents.values()) {
      if (sameGeom(e.a, e.b)) { e.keep = e.a; continue; }
      e.changed = true;
      e.keep = inter(e.a, e.b);
      e.lost = mpArea(e.a) ? diff(e.a, e.b) : [];
      e.gained = mpArea(e.b) ? diff(e.b, e.a) : [];
      e.bbB = bboxOf(e.gained);
      e.bbLost = bboxOf(e.lost);
      changed.push(e);
    }

    // Transferts x → y entre États voisins
    const toY = new Map<string, MP[]>(), fromX = new Map<string, MP[]>();
    for (const x of changed) {
      if (mpArea(x.lost) < EPS_AREA) continue;
      for (const y of changed) {
        if (y === x || mpArea(y.gained) < EPS_AREA || !overlaps(x.bbLost, y.bbB)) continue;
        const P = inter(x.lost, y.gained);
        if (mpArea(P) < EPS_AREA) continue;
        // Le front part du côté de y : direction de y (partie conservée) vers la portion
        const from = y.keep.length ? mpCentroid(y.keep) : null;
        const cP = mpCentroid(P);
        let d: Pt = from ? [cP[0] - from[0], cP[1] - from[1]] : (() => { const cx = mpCentroid(x.keep.length ? x.keep : x.a); return [cx[0] - cP[0], cx[1] - cP[1]] as Pt; })();
        const n = Math.hypot(d[0], d[1]) || 1;
        d = [d[0] / n, d[1] / n];
        let s0 = Infinity, s1 = -Infinity;
        for (const poly of P) for (const q of poly[0]) { const v = q[0] * d[0] + q[1] * d[1]; if (v < s0) s0 = v; if (v > s1) s1 = v; }
        this.patches.push({ from: x.key, to: y.key, geom: P, d, s0, s1 });
        (fromX.get(x.key) || fromX.set(x.key, []).get(x.key)!).push(P);
        (toY.get(y.key) || toY.set(y.key, []).get(y.key)!).push(P);
      }
    }
    // Ce qui reste perdu ou gagné sans contrepartie : fondu
    for (const e of changed) {
      const out = diff(e.lost, union(...(fromX.get(e.key) || [])));
      if (mpArea(out) >= EPS_AREA) this.fadeOut.set(e.key, out);
      const inn = diff(e.gained, union(...(toY.get(e.key) || [])));
      if (mpArea(inn) >= EPS_AREA) this.fadeIn.set(e.key, inn);
    }
    this.buildMs = performance.now() - t0;
  }

  /** Données sérialisables (préparation dans un Web Worker, puis utilisation sur le fil principal). */
  /**
   * Données compactes : seuls les États dont le tracé change sont enregistrés ; les autres sont
   * reconstitués à partir de l'état de départ (fromData(d, A)).
   */
  toData(): MorphData {
    return {
      v: MORPH_VERSION,
      ents: [...this.ents.values()].filter(e => e.changed).map(e => ({ key: e.key, propsA: e.propsA, propsB: e.propsB, keep: e.keep, changed: true })),
      patches: this.patches, fadeOut: [...this.fadeOut], fadeIn: [...this.fadeIn], buildMs: this.buildMs
    };
  }
  static fromData(d: MorphData, A: FC): Morpher {
    const m = Object.create(Morpher.prototype) as Morpher;
    const blank = { a: [] as MP, b: [] as MP, lost: [] as MP, gained: [] as MP, bbB: [0, 0, 0, 0] as BBox, bbLost: [0, 0, 0, 0] as BBox };
    m.ents = new Map();
    for (const f of A.features) {
      const p = f.properties || {};
      const k = keyOf(p);
      const cur = m.ents.get(k);
      const mp = toMP(f.geometry);
      if (cur) cur.keep = cur.keep.concat(mp);
      else m.ents.set(k, { key: k, propsA: p, propsB: p, keep: mp, changed: false, ...blank });
    }
    for (const e of d.ents) m.ents.set(e.key, { ...e, ...blank });
    m.patches = d.patches;
    m.fadeOut = new Map(d.fadeOut);
    m.fadeIn = new Map(d.fadeIn);
    m.buildMs = d.buildMs;
    return m;
  }

  /** Nombre d'États dont le tracé change et de portions transférées (diagnostic). */
  get stats() { return { changed: [...this.ents.values()].filter(e => e.changed).length, patches: this.patches.length }; }

  /** Collection pour f ∈ [0, 1]. Propriété _op : opacité relative (fondus). */
  at(f: number): FC {
    f = Math.max(0, Math.min(1, f));
    const e = f * f * (3 - 2 * f); // adoucissement (smoothstep)
    const pieces = new Map<string, MP>(); // parties pleinement opaques de chaque État
    const moving = new Set<string>();       // États dont un morceau est en transit (à fusionner)
    const add = (k: string, mp: MP) => { if (mp.length) { const cur = pieces.get(k); pieces.set(k, cur ? cur.concat(mp) : mp); } };
    for (const ent of this.ents.values()) add(ent.key, ent.keep);
    for (const p of this.patches) {
      const s = p.s0 + (p.s1 - p.s0) * e;
      if (e <= 0) { add(p.from, p.geom); continue; }
      if (e >= 1) { add(p.to, p.geom); continue; }
      add(p.to, clipMP(p.geom, p.d, s, true));    // déjà franchi par le front
      add(p.from, clipMP(p.geom, p.d, s, false)); // encore à l'État d'origine
      moving.add(p.to); moving.add(p.from);
    }
    // Fusion : pas de trait parasite entre la partie conservée et les morceaux en transit
    for (const k of moving) {
      const mp = pieces.get(k);
      if (mp && mp.length > 1) { const u = safe(() => pc.union(mp as any) as MP); if (u.length) pieces.set(k, u); }
    }
    const features: GeoJSON.Feature[] = [];
    for (const ent of this.ents.values()) {
      const props = { ...((e < 0.5 ? ent.propsA : ent.propsB) || ent.propsA || ent.propsB) };
      const mp = pieces.get(ent.key);
      if (mp && mp.length) features.push(feat(mp, { ...props, _op: 1 }));
      const out = this.fadeOut.get(ent.key);
      if (out && e < 1) features.push(feat(out, { ...props, _op: 1 - e, _fade: 1 }));
      const inn = this.fadeIn.get(ent.key);
      if (inn && e > 0) features.push(feat(inn, { ...props, _op: e, _fade: 1 }));
    }
    return { type: "FeatureCollection", features };
  }
}

/** Version de l'algorithme : les transitions enregistrées d'une autre version sont recalculées. */
export const MORPH_VERSION = 2;

export interface MorphData {
  v: number;
  ents: { key: string; propsA?: Props; propsB?: Props; keep: MP; changed: boolean }[];
  patches: Patch[];
  fadeOut: [string, MP][];
  fadeIn: [string, MP][];
  buildMs: number;
}

/** Repli quand la préparation est trop longue : fondu enchaîné entre les deux états. */
export class CrossFade {
  constructor(private A: FC, private B: FC) {}
  at(f: number): FC {
    const e = Math.max(0, Math.min(1, f));
    return {
      type: "FeatureCollection",
      features: [
        ...(e < 1 ? this.A.features.map(x => ({ ...x, properties: { ...x.properties, _op: 1 - e } })) : []),
        ...(e > 0 ? this.B.features.map(x => ({ ...x, properties: { ...x.properties, _op: e } })) : [])
      ]
    };
  }
}

function feat(mp: MP, props: Props): GeoJSON.Feature {
  return { type: "Feature", properties: props, geometry: mp.length === 1 ? { type: "Polygon", coordinates: mp[0] } : { type: "MultiPolygon", coordinates: mp } };
}
