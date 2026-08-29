import { describe, it, expect, vi, afterEach } from "vitest";
import { normalize, fetchParcelsIntersecting } from "../../src/counties/osceola.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-85.1302116901917, 44.0682264905314],
          [-85.1297927773973, 44.0676977847693],
          [-85.1284158128495, 44.0676948301085],
          [-85.1302116901917, 44.0682264905314],
        ],
      ],
    },
    properties: {
      PIN: "10 003 008 00",
      OWNER: "SPRAGUE WILLIAM E",
      PROPCLASS: "RESIDENTIAL",
      UNIT: "MIDDLE BRANCH TOWNSHIP",
      Shape__Area: 453941.4482421875,
      ...propertyOverrides,
    },
  };
}

describe("osceola normalize", () => {
  it("converts a raw Osceola feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("10-003-008-00");
    expect(result.county).toBe("Osceola");
    expect(result.township).toBe("Middle Branch");
    expect(result.acres).toBeCloseTo(10.421, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(4);
  });

  it("throws a clear error for a malformed raw PIN", () => {
    const raw = makeRawFeature({ PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('cannot normalize PIN "not-a-pin"');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});

describe("osceola fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query and returns the raw features", async () => {
    const mockResponse = {
      features: [
        {
          type: "Feature",
          properties: { PIN: "10 003 023 00", OWNER: "X", PROPCLASS: "Y", UNIT: "MIDDLE BRANCH TOWNSHIP", Shape__Area: 1000 },
          geometry: { type: "Polygon", coordinates: [[[-85.13, 44.068], [-85.12, 44.068], [-85.12, 44.07], [-85.13, 44.068]]] },
        },
      ],
    };
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requestedUrl = url;
        return { ok: true, json: async () => mockResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-85.135, 44.066], [-85.125, 44.066], [-85.125, 44.07], [-85.135, 44.07], [-85.135, 44.066]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.PIN).toBe("10 003 023 00");
    expect(requestedUrl).toContain("geometryType=esriGeometryPolygon");
    expect(requestedUrl).toContain("spatialRel=esriSpatialRelIntersects");
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error" })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      "Osceola FeatureServer intersects request failed: 500 Internal Server Error"
    );
  });
});
