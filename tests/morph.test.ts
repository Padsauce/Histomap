import { describe, expect, it } from "vitest";
import pc from "polygon-clipping";
import { Morpher, mpArea } from "../src/core/morph";

type Pt = [number, number];
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const fc = (features: { name: string; ring: Pt[] }[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: features.map(f => ({ type: "Feature", properties: { NAME: f.name }, geometry: { type: "Polygon", coordinates: [f.ring] } }))
});
const mpOf = (f: GeoJSON.Feature) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : (f.geometry as GeoJSON.MultiPolygon).coordinates) as Pt[][][];
const byName = (c: GeoJSON.FeatureCollection, n: string) => c.features.filter(f => f.properties!.NAME === n && f.properties!._op === 1);
const vertices = (c: GeoJSON.FeatureCollection, n: string) => new Set(byName(c, n).flatMap(f => mpOf(f).flatMap(p => p.flatMap(r => r.map(q => q.join(","))))));

// X (0..4) et Y (4..8) côte à côte ; Z au nord, inchangé. Entre A et B, X cède la bande 3..4 à Y.
const A = fc([{ name: "X", ring: rect(0, 0, 4, 4) }, { name: "Y", ring: rect(4, 0, 8, 4) }, { name: "Z", ring: rect(0, 4, 8, 6) }]);
const B = fc([{ name: "X", ring: rect(0, 0, 3, 4) }, { name: "Y", ring: rect(3, 0, 8, 4) }, { name: "Z", ring: rect(0, 4, 8, 6) }]);

describe("frontières dynamiques par transfert de territoire", () => {
  const m = new Morpher(A, B);

  it("ne déplace que la portion qui change de mains", () => {
    expect(m.stats).toEqual({ changed: 2, patches: 1 });
    const mid = m.at(0.5);
    // Les sommets des frontières qui ne changent pas restent exactement en place
    const vx = vertices(mid, "X");
    for (const v of ["0,0", "0,4"]) expect(vx.has(v)).toBe(true);
    const vy = vertices(mid, "Y");
    for (const v of ["8,0", "8,4"]) expect(vy.has(v)).toBe(true);
  });

  it("laisse les États non concernés strictement immobiles", () => {
    for (const f of [0.2, 0.5, 0.8]) {
      const z = byName(m.at(f), "Z");
      expect(z).toHaveLength(1);
      expect(mpOf(z[0])).toEqual([[rect(0, 4, 8, 6)]]);
    }
  });

  it("ne crée ni vide ni chevauchement entre voisins pendant la transition", () => {
    for (const f of [0.1, 0.35, 0.5, 0.9]) {
      const c = m.at(f);
      const x = byName(c, "X").flatMap(mpOf), y = byName(c, "Y").flatMap(mpOf);
      expect(mpArea(x) + mpArea(y)).toBeCloseTo(32, 6);                 // surface totale conservée
      expect(mpArea(pc.intersection(x as any, y as any) as any)).toBeCloseTo(0, 6); // aucun chevauchement
    }
    // La portion progresse : X perd peu à peu sa bande
    expect(mpArea(byName(m.at(0.25), "X").flatMap(mpOf))).toBeGreaterThan(mpArea(byName(m.at(0.75), "X").flatMap(mpOf)));
  });

  it("aboutit exactement aux deux états connus", () => {
    expect(mpArea(byName(m.at(0), "X").flatMap(mpOf))).toBeCloseTo(16, 6);
    expect(mpArea(byName(m.at(1), "X").flatMap(mpOf))).toBeCloseTo(12, 6);
    expect(mpArea(byName(m.at(1), "Y").flatMap(mpOf))).toBeCloseTo(20, 6);
  });

  it("fait apparaître et disparaître en fondu les territoires sans contrepartie", () => {
    const m2 = new Morpher(fc([{ name: "Ancien", ring: rect(0, 0, 1, 1) }]), fc([{ name: "Nouveau", ring: rect(5, 5, 6, 6) }]));
    const op = Object.fromEntries(m2.at(0.5).features.map(x => [x.properties!.NAME, x.properties!._op]));
    expect(op.Ancien).toBeCloseTo(0.5);
    expect(op.Nouveau).toBeCloseTo(0.5);
    expect(m2.at(1).features.map(x => x.properties!.NAME)).toEqual(["Nouveau"]);
  });

  it("se prépare hors du fil principal sans perte (sérialisation)", () => {
    const copy = Morpher.fromData(JSON.parse(JSON.stringify(m.toData())));
    expect(JSON.stringify(copy.at(0.4))).toEqual(JSON.stringify(m.at(0.4)));
  });
});
