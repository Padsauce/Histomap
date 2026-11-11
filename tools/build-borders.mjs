#!/usr/bin/env node
/*
 * Prépare les données cartographiques du « mode précis » (F-23, F-24, F-21).
 *
 * 1. Cliopatria (Seshat Global History Databank) : frontières de ≈ 1 600 entités politiques,
 *    de 3400 av. J.-C. à 2024, avec une résolution de quelques années. Chaque ligne donne un nom,
 *    une période [FromYear, ToYear], un identifiant Wikidata et, pour les membres d'un ensemble
 *    composite (« (Kingdom of France) »), le nom de cet ensemble (MemberOf).
 *    → tracés simplifiés, découpés en tranches de temps : public/borders/clio/
 * 2. Natural Earth, bathymétrie 200 m (domaine public) : contour des plateaux continentaux,
 *    en grande partie émergés au dernier maximum glaciaire. → public/paleo/shelf.json
 *
 * Usage :
 *   node tools/build-borders.mjs --clio chemin/cliopatria.geojson [--shelf chemin/ne_10m_bathymetry_K_200.geojson]
 *        [--out public] [--tolerance 0.01]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = arg("--out", "public");
const TOL = +arg("--tolerance", "0.02"); // degrés (≈ 1 km à l'équateur)

// ---------------------------------------------------------------------------
// Simplification (Douglas-Peucker itératif) et nettoyage des anneaux
// ---------------------------------------------------------------------------
function sqSegDist(p, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = p[0] - x; dy = p[1] - y;
  return dx * dx + dy * dy;
}
function simplifyRing(ring, tol, k = 1000) {
  if (ring.length <= 4) return ring;
  const sq = tol * tol, keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let max = 0, idx = -1;
    for (let i = first + 1; i < last; i++) {
      const d = sqSegDist(ring[i], ring[first], ring[last]);
      if (d > max) { max = d; idx = i; }
    }
    if (max > sq) { keep[idx] = 1; stack.push([first, idx], [idx, last]); }
  }
  const out = ring.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * k) / k, Math.round(y * k) / k]);
  return out;
}
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
/** Simplifie une géométrie ; supprime les anneaux devenus dégénérés ou minuscules. */
function simplifyGeometry(g, tol, k = 1000) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const out = [];
  for (const poly of polys) {
    const outer = simplifyRing(poly[0], tol, k);
    if (outer.length < 4 || ringArea(outer) < tol * tol * 2) continue;
    const holes = poly.slice(1).map(r => simplifyRing(r, tol, k)).filter(r => r.length >= 4 && ringArea(r) >= tol * tol * 2);
    out.push([outer, ...holes]);
  }
  if (!out.length) return null;
  return out.length === 1 ? { type: "Polygon", coordinates: out[0] } : { type: "MultiPolygon", coordinates: out };
}
const countPts = g => (g.type === "Polygon" ? [g.coordinates] : g.coordinates).reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);

// ---------------------------------------------------------------------------
async function buildClio(file) {
  const d = JSON.parse(await readFile(file, "utf8"));
  // Tranches (années historiques) : larges dans l'Antiquité, fines à l'époque moderne
  const edges = [];
  for (let y = -3400; y < -1000; y += 400) edges.push(y);
  for (let y = -1000; y < 0; y += 200) edges.push(y);
  for (let y = 0; y < 1500; y += 100) edges.push(y);
  for (let y = 1500; y < 1800; y += 50) edges.push(y);
  for (let y = 1800; y <= 2050; y += 25) edges.push(y);
  const buckets = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1] - 1, features: [] }));
  let inPts = 0, outPts = 0, kept = 0;
  for (const f of d.features) {
    const p = f.properties;
    if (p.Type && p.Type !== "POLITY") continue;
    inPts += countPts(f.geometry);
    const g = simplifyGeometry(f.geometry, TOL, 100); // 2 décimales (≈ 1 km) : les tracés sources sont espacés de ≈ 25 km
    if (!g) continue;
    outPts += countPts(g);
    kept++;
    const feat = {
      type: "Feature",
      geometry: g,
      properties: {
        NAME: p.Name, FROM: p.FromYear, TO: p.ToYear,
        QID: p.Wikidata || "", WIKI: p.Wikipedia || "",
        MEMBEROF: p.MemberOf || "", COMPOSITE: p.Name.startsWith("(") ? 1 : 0
      }
    };
    for (const b of buckets) if (p.FromYear <= b.to && p.ToYear >= b.from) b.features.push(feat);
  }
  const dir = path.join(OUT, "borders", "clio");
  await mkdir(dir, { recursive: true });
  const manifest = { source: "Cliopatria (Seshat Global History Databank)", version: path.basename(file), built: new Date().toISOString(), tolerance: TOL, buckets: [] };
  let bytes = 0;
  for (const b of buckets) {
    if (!b.features.length) continue;
    const name = `b${b.from}_${b.to}.json`;
    const json = JSON.stringify({ type: "FeatureCollection", features: b.features });
    bytes += json.length;
    await writeFile(path.join(dir, name), json);
    manifest.buckets.push({ from: b.from, to: b.to, file: name, count: b.features.length });
  }
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`Cliopatria : ${kept} entités-périodes, ${inPts} → ${outPts} points, ${manifest.buckets.length} tranches, ${(bytes / 1e6).toFixed(1)} Mo`);
}

async function buildShelf(file) {
  const d = JSON.parse(await readFile(file, "utf8"));
  const features = [];
  let pts = 0;
  for (const f of d.features) {
    const g = simplifyGeometry(f.geometry, TOL * 3);
    if (!g) continue;
    pts += countPts(g);
    features.push({ type: "Feature", geometry: g, properties: {} });
  }
  const dir = path.join(OUT, "paleo");
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(path.join(dir, "deep-sea.json"), json);
  console.log(`Plateaux continentaux : ${features.length} polygones, ${pts} points, ${(json.length / 1e6).toFixed(1)} Mo`);
}

const clio = arg("--clio"), shelf = arg("--shelf");
if (!clio && !shelf) { console.error("Indiquez --clio et/ou --shelf"); process.exit(1); }
if (clio) await buildClio(clio);
if (shelf) await buildShelf(shelf);
