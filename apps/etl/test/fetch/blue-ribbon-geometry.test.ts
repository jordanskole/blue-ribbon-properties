import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveStreamGeometry } from "../../src/fetch/blue-ribbon-geometry.js";
import type { CountyBoundary } from "../../src/fetch/county-boundaries.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OSCEOLA_BOUNDARY: CountyBoundary = {
  name: "Osceola",
  peninsula: "Lower",
  geometry: {
    type: "Polygon",
    coordinates: [[[-85.56, 43.81], [-85.09, 43.81], [-85.09, 44.17], [-85.56, 44.17], [-85.56, 43.81]]],
  },
};

describe("resolveStreamGeometry", () => {
  it("matches by substring, collecting every segment under one base name", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-85.13, 44.068], [-85.12, 44.07]] },
          properties: { NHSStreamName: "Middle Branch River", ReachCode: "x", TemperatureGradient: null },
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-85.2, 44.0], [-85.19, 44.01]] },
          properties: { NHSStreamName: "Hersey Creek", ReachCode: "y", TemperatureGradient: null },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => mockResponse })));

    const result = await resolveStreamGeometry(
      { name: "Middle Branch River", counties: ["Osceola"] },
      [OSCEOLA_BOUNDARY]
    );

    expect(result).not.toBeNull();
    expect(result!.matchedNames).toEqual(["Middle Branch River"]);
    expect(result!.geometry.type).toBe("MultiLineString");
    expect(result!.geometry.coordinates).toEqual([[[-85.13, 44.068], [-85.12, 44.07]]]);
  });

  it("returns null when nothing matches in any listed county", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ type: "FeatureCollection", features: [] }) }))
    );
    const result = await resolveStreamGeometry(
      { name: "Nonexistent River", counties: ["Osceola"] },
      [OSCEOLA_BOUNDARY]
    );
    expect(result).toBeNull();
  });

  it("throws a clear error when a listed county has no boundary in the supplied list", async () => {
    await expect(
      resolveStreamGeometry({ name: "Middle Branch River", counties: ["Roscommon"] }, [OSCEOLA_BOUNDARY])
    ).rejects.toThrow('no county boundary found for "Roscommon"');
  });
});
