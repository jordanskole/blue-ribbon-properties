import { describe, it, expect, vi, afterEach } from "vitest";
import { normalize, fetchParcelsIntersecting } from "../../src/counties/otsego.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-84.66961, 45.02405],
          [-84.66940, 45.02405],
          [-84.66940, 45.02425],
          [-84.66961, 45.02425],
          [-84.66961, 45.02405],
        ],
      ],
    },
    properties: {
      parcelid: "045-000-001-001-00",
      Shape_Area: 17252.8194599,
      township: "Vanderbilt",
      ...propertyOverrides,
    },
  };
}

describe("otsego normalize", () => {
  it("converts a raw Otsego feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("045-000-001-001-00");
    expect(result.county).toBe("Otsego");
    expect(result.township).toBe("Vanderbilt");
    expect(result.acres).toBeCloseTo(0.396, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(5);
  });

  it("throws a clear error for a malformed parcelid", () => {
    const raw = makeRawFeature({ parcelid: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});

describe("otsego fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query, reprojects, and enriches each candidate with township", async () => {
    const queryResponse = {
      features: [
        {
          attributes: { parcelid: "045-000-001-001-00", Shape_Area: 17252.82 },
          geometry: {
            rings: [
              [
                [-9424112.5, 5644057.21],
                [-9424112.43, 5644000.16],
                [-9424141.04, 5644000.96],
                [-9424112.5, 5644057.21],
              ],
            ],
          },
        },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Vanderbilt" } }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        return { ok: true, json: async () => queryResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-84.67, 45.02], [-84.66, 45.02], [-84.66, 45.03], [-84.67, 45.03], [-84.67, 45.02]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.parcelid).toBe("045-000-001-001-00");
    expect(features[0].properties.township).toBe("Vanderbilt");
    expect(features[0].geometry.type).toBe("Polygon");
  });

  it("returns an empty array when nothing intersects, without erroring", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toEqual([]);
  });

  it("throws a clear error on an HTTP-200-with-in-body-error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: { code: 500, message: "Query failed: please check your parameters" },
        }),
      }))
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      /ArcGIS error 500: Query failed/
    );
  });

  it("pages through results when the server reports exceededTransferLimit at the top level", async () => {
    const page1 = {
      exceededTransferLimit: true,
      features: [
        { attributes: { parcelid: "045-000-001-001-01", Shape_Area: 1000 }, geometry: { rings: [[[-9424112.5, 5644057.21], [-9424112.43, 5644000.16], [-9424141.04, 5644000.96], [-9424112.5, 5644057.21]]] } },
        { attributes: { parcelid: "045-000-001-001-02", Shape_Area: 1000 }, geometry: { rings: [[[-9424112.5, 5644057.21], [-9424112.43, 5644000.16], [-9424141.04, 5644000.96], [-9424112.5, 5644057.21]]] } },
      ],
    };
    const page2 = {
      exceededTransferLimit: false,
      features: [
        { attributes: { parcelid: "045-000-001-001-03", Shape_Area: 1000 }, geometry: { rings: [[[-9424112.5, 5644057.21], [-9424112.43, 5644000.16], [-9424141.04, 5644000.96], [-9424112.5, 5644057.21]]] } },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Vanderbilt" } }] };
    const seenOffsets: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        const params = new URLSearchParams(String(init?.body));
        const offset = params.get("resultOffset")!;
        seenOffsets.push(offset);
        return { ok: true, json: async () => (offset === "0" ? page1 : page2) };
      })
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(3);
    expect(seenOffsets).toEqual(["0", "2"]);
  });
});
