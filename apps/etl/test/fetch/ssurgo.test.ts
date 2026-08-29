import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ringToWkt,
  fetchClippedSoilPolygons,
  fetchComponents,
  fetchDwellingRating,
} from "../../src/fetch/ssurgo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ringToWkt", () => {
  it("converts a coordinate ring to WKT POLYGON text", () => {
    const ring = [
      [-85.13, 44.068],
      [-85.128, 44.068],
      [-85.128, 44.069],
      [-85.13, 44.068],
    ];
    expect(ringToWkt(ring)).toBe(
      "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))"
    );
  });
});

describe("fetchClippedSoilPolygons", () => {
  it("parses SDA's Table rows into ClippedSoilPolygon objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Table: [
            [
              "190064",
              "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))",
            ],
            [
              "189980",
              "POLYGON((-85.132 44.068,-85.13 44.068,-85.13 44.069,-85.132 44.068))",
            ],
          ],
        }),
      }))
    );
    const polygons = await fetchClippedSoilPolygons("POLYGON((...))");
    expect(polygons).toEqual([
      {
        mukey: "190064",
        wkt: "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))",
      },
      {
        mukey: "189980",
        wkt: "POLYGON((-85.132 44.068,-85.13 44.068,-85.13 44.069,-85.132 44.068))",
      },
    ]);
  });

  it("returns an empty array when SDA's Table field is absent (no intersection)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    );
    const polygons = await fetchClippedSoilPolygons("POLYGON((...))");
    expect(polygons).toEqual([]);
  });
});

describe("fetchComponents", () => {
  it("parses component rows, converting numeric/nullable fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Table: [
            [
              "190064",
              "Kalkaska",
              "95",
              "Somewhat excessively drained",
              null,
              "27171875",
            ],
            [
              "189980",
              "Au Gres",
              "90",
              "Somewhat poorly drained",
              "12",
              "27171661",
            ],
          ],
        }),
      }))
    );
    const components = await fetchComponents(["190064", "189980"]);
    expect(components).toEqual([
      {
        mukey: "190064",
        compname: "Kalkaska",
        comppct_r: 95,
        drainagecl: "Somewhat excessively drained",
        wtdepannmin: null,
        cokey: "27171875",
      },
      {
        mukey: "189980",
        compname: "Au Gres",
        comppct_r: 90,
        drainagecl: "Somewhat poorly drained",
        wtdepannmin: 12,
        cokey: "27171661",
      },
    ]);
  });

  it("returns an empty array for an empty mukey list without making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const components = await fetchComponents([]);
    expect(components).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchDwellingRating", () => {
  it("returns the interphrc rating for a cokey", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ Table: [["Not limited"]] }),
      }))
    );
    const rating = await fetchDwellingRating("27171875");
    expect(rating).toBe("Not limited");
  });

  it("returns null when no rating row is found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ Table: [] }) }))
    );
    const rating = await fetchDwellingRating("00000000");
    expect(rating).toBeNull();
  });
});
