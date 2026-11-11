import { describe, expect, it } from "vitest";
import { Morpher, resample, align } from "../src/core/morph";

type Pt = [number, number];
const square = (x: number, y: number, s: number): Pt[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
const fc = (features: { name: string; ring: Pt[] }[]): GeoJSON.FeatureCollection => ({
  type: "FeatureCollection",
  features: features.map(f => ({ type: "Feature", properties: { NAME: f.name }, geometry: { type: "Polygon", coordinates: [f.ring] } }))
});

describe("frontières dynamiques", () => {
  it("rééchantillonne un anneau en points équidistants", () => {
    const r = resample(square(0, 0, 4), 16);
    expect(r).toHaveLength(16);
    expect(r[0]).toEqual([0, 0]);
    expect(r[4]).toEqual([4, 0]);
  });

  it("aligne le sens de parcours et le point de départ", () => {
    const a = resample(square(0, 0, 4), 16);
    const b = resample(square(0, 0, 4).slice().reverse(), 16);
    const al = align(a, b);
    const err = al.reduce((s, p, i) => s + Math.hypot(p[0] - a[i][0], p[1] - a[i][1]), 0);
    expect(err).toBeLessThan(1e-9);
  });

  it("interpole un État présent dans les deux états connus", () => {
    const m = new Morpher(fc([{ name: "A", ring: square(0, 0, 4) }]), fc([{ name: "A", ring: square(4, 0, 4) }]));
    const mid = m.at(0.5).features[0];
    const ring = (mid.geometry as GeoJSON.Polygon).coordinates[0];
    const cx = ring.slice(0, -1).reduce((s, p) => s + p[0], 0) / (ring.length - 1);
    expect(cx).toBeCloseTo(4, 1); // centre passé de 2 à 6 : 4 à mi-parcours
    expect(mid.properties!._op).toBe(1);
  });

  it("ne fait pas « voler » une partie trop éloignée : fondu à la place", () => {
    const m = new Morpher(fc([{ name: "A", ring: square(0, 0, 1) }]), fc([{ name: "A", ring: square(30, 0, 1) }]));
    const ops = m.at(0.5).features.map(x => x.properties!._op);
    expect(ops).toEqual([0.5, 0.5]);
  });

  it("fait apparaître et disparaître en fondu les États sans correspondance", () => {
    const m = new Morpher(fc([{ name: "Ancien", ring: square(0, 0, 1) }]), fc([{ name: "Nouveau", ring: square(5, 5, 1) }]));
    const f = m.at(0.5).features;
    const op = Object.fromEntries(f.map(x => [x.properties!.NAME, x.properties!._op]));
    expect(op.Ancien).toBeCloseTo(0.5);
    expect(op.Nouveau).toBeCloseTo(0.5);
    expect(m.at(1).features.map(x => x.properties!.NAME)).toEqual(["Nouveau"]);
  });
});
