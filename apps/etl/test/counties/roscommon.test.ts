import { describe, it, expect, vi, afterEach } from "vitest";
import { normalize, fetchParcelsIntersecting } from "../../src/counties/roscommon.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-84.775504233674, 44.3280463336908],
          [-84.7755129036588, 44.3281802630799],
          [-84.7750613139315, 44.3281813328021],
          [-84.7750604027277, 44.328162963954],
          [-84.7750566910371, 44.328102653675],
          [-84.7750530742179, 44.3280474666252],
          [-84.775504233674, 44.3280463336908],
        ],
      ],
    },
    properties: {
      PIN: "011-430-045-0000",
      Shape__Area: 1046.7578125,
      township: "Roscommon",
      ...propertyOverrides,
    },
  };
}

describe("roscommon normalize", () => {
  it("converts a raw Roscommon feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("011-430-045-0000");
    expect(result.county).toBe("Roscommon");
    expect(result.township).toBe("Roscommon");
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(7);
  });

  it("throws a clear error for a malformed PIN", () => {
    const raw = makeRawFeature({ PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid NNN-NNN-NNN-NNNN PIN');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});

describe("roscommon fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query via POST, enriches each candidate with township, and returns raw features", async () => {
    // POST, not GET -- same fix as Osceola's identical pattern: a real
    // corridor buffer's geometry parameter overflows a GET URL's length
    // limit (live-verified 2026-08-29 against the same kind of
    // ArcGIS-Online-hosted FeatureServer Roscommon uses).
    const queryResponse = {
      features: [
        {
          type: "Feature",
          properties: { PIN: "011-430-045-0000", Shape__Area: 1046.76 },
          geometry: {
            type: "Polygon",
            coordinates: [[[-84.7755, 44.328], [-84.775, 44.328], [-84.775, 44.3282], [-84.7755, 44.328]]],
          },
        },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Roscommon" } }] };
    let callCount = 0;
    let parcelQueryInit: RequestInit | undefined;
    let parcelQueryUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        callCount += 1;
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        parcelQueryUrl = url;
        parcelQueryInit = init;
        return { ok: true, json: async () => queryResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-84.78, 44.32], [-84.77, 44.32], [-84.77, 44.33], [-84.78, 44.33], [-84.78, 44.32]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.PIN).toBe("011-430-045-0000");
    expect(features[0].properties.Shape__Area).toBe(1046.76);
    expect(features[0].properties.township).toBe("Roscommon");
    expect(callCount).toBe(2); // parcel query + one MCD lookup for the one candidate
    // No query string on the parcel query URL -- everything travels in the body.
    expect(parcelQueryUrl).not.toContain("?");
    expect(parcelQueryInit?.method).toBe("POST");
    const body = String(parcelQueryInit?.body);
    expect(body).toContain("geometryType=esriGeometryPolygon");
    expect(body).toContain("f=geojson");
  });

  it("returns an empty array when nothing intersects, without erroring", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toEqual([]);
  });
});
