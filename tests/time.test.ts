import { describe, expect, it } from "vitest";
import * as Time from "../src/core/time";

describe("modèle temporel", () => {
  it("convertit les années historiques (pas d'an 0)", () => {
    expect(Time.fromHistYear(1)).toBe(1);
    expect(Time.fromHistYear(-1)).toBe(0);
    expect(Time.fromHistYear(-480)).toBe(-479);
    expect(Time.histYear(Time.fromHistYear(-480))).toBe(-480);
  });

  it("analyse les dates et déduit la précision", () => {
    expect(Time.parse("1643").precision).toBe("year");
    expect(Time.parse("1643-05").precision).toBe("month");
    expect(Time.parse("1643-05-19").precision).toBe("day");
    expect(Time.parse("1805-12-02T09:00").precision).toBe("hour");
    expect(Time.parse("1805-12-02T09:30").precision).toBe("minute");
    expect(Time.parse("~-15000").circa).toBe(true);
    expect(() => Time.parse("bientôt")).toThrow();
  });

  it("aller-retour composantes ↔ temps", () => {
    const t = Time.parse("1805-12-02T09:30").t;
    expect(Time.fromT(t)).toMatchObject({ Y: 1805, mo: 12, d: 2, h: 9, mi: 30 });
    const leap = Time.parse("2000-02-29").t;
    expect(Time.fromT(leap)).toMatchObject({ Y: 2000, mo: 2, d: 29 });
  });

  it("calcule les intervalles (fin incluse selon la précision)", () => {
    const iv = Time.interval({ date: "1648-08-26", end: "1653" });
    expect(Time.fromT(iv.t0)).toMatchObject({ Y: 1648, mo: 8, d: 26 });
    expect(iv.t1).toBe(1654);
    const one = Time.interval({ date: "1643" });
    expect(one.t1 - one.t0).toBe(1);
  });

  it("formate en français", () => {
    expect(Time.format(Time.parse("1643-05-01").t, "day")).toBe("1er mai 1643");
    expect(Time.format(Time.parse("-50").t)).toBe("50 av. J.-C.");
    expect(Time.format(Time.parse("-313000").t, "1e4y")).toMatch(/vers 310.000 av\. J\.-C\./);
  });

  it("produit des graduations cohérentes", () => {
    const hours = Time.UNITS.find(u => u.id === "1h")!;
    const d = Time.parse("1805-12-02").t;
    const tk = Time.ticks(hours, d + 0.0001, d + 0.0012);
    expect(tk.map(x => x.label)).toContain("09:00");
    const centuries = Time.UNITS.find(u => u.id === "100y")!;
    expect(Time.ticks(centuries, -250, 150).map(x => x.label)).toEqual(
      ["300 av. J.-C.", "200 av. J.-C.", "100 av. J.-C.", "1", "100", "200"]);
  });
});
