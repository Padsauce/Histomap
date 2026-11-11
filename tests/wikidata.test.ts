import { describe, expect, it } from "vitest";
import { parsePoint, parseTime } from "../src/core/wikidata";

describe("conversion des valeurs Wikidata", () => {
  it("lit les coordonnées WKT", () => {
    expect(parsePoint("Point(2.352222222 48.856666666)")).toEqual([2.352222222, 48.856666666]);
    expect(parsePoint("pas un point")).toBeNull();
    expect(parsePoint(undefined)).toBeNull();
  });

  it("convertit les dates selon leur précision", () => {
    expect(parseTime("1643-05-14T00:00:00Z", "11")).toEqual({ date: "1643-05-14", precision: "day" });
    expect(parseTime("1713-01-01T00:00:00Z", "9")).toEqual({ date: "1713", precision: "year" });
    expect(parseTime("1700-01-01T00:00:00Z", "7")).toEqual({ date: "1700", precision: "century" });
  });

  it("gère la numérotation astronomique des années avant notre ère", () => {
    // Bataille des Thermopyles : 480 av. J.-C., renvoyée « -0479 » par WDQS
    expect(parseTime("-0479-08-06T00:00:00Z", "11")).toEqual({ date: "-480-08-06", precision: "day" });
  });

  it("devine la précision des qualificatifs sans précision", () => {
    expect(parseTime("1848-01-01T00:00:00Z")?.precision).toBe("year");
    expect(parseTime("1848-06-04T00:00:00Z")?.precision).toBe("day");
  });
});
