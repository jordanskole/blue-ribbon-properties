import { describe, it, expect, vi, afterEach } from "vitest";
import { normalize, fetchParcelsIntersecting } from "../../src/counties/manistee.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-86.11778, 44.29118],
          [-86.11651, 44.29118],
          [-86.11651, 44.29215],
          [-86.11778, 44.29215],
          [-86.11778, 44.29118],
        ],
      ],
    },
    properties: {
      BSA_PIN: "03-021-002-10",
      ACRES: 14.8644000786,
      township: "Manistee",
      ...propertyOverrides,
    },
  };
}

describe("manistee normalize", () => {
  it("converts a raw Manistee feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("03-021-002-10");
    expect(result.county).toBe("Manistee");
    expect(result.township).toBe("Manistee");
    expect(result.acres).toBeCloseTo(14.8644, 4);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(5);
  });

  it("throws a clear error for a malformed PIN", () => {
    const raw = makeRawFeature({ BSA_PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid NN-NNN-NNN-NN PIN');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});

describe("manistee fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query via POST, enriches each candidate with township, and returns raw features", async () => {
    const queryResponse = {
      features: [
        {
          type: "Feature",
          properties: { BSA_PIN: "03-021-002-10", ACRES: 14.8644000786 },
          geometry: {
            type: "Polygon",
            coordinates: [[[-86.1178, 44.2912], [-86.1165, 44.2912], [-86.1165, 44.2922], [-86.1178, 44.2912]]],
          },
        },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Manistee" } }] };
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
      coordinates: [[[-86.12, 44.29], [-86.11, 44.29], [-86.11, 44.3], [-86.12, 44.3], [-86.12, 44.29]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.BSA_PIN).toBe("03-021-002-10");
    expect(features[0].properties.ACRES).toBe(14.8644000786);
    expect(features[0].properties.township).toBe("Manistee");
    expect(callCount).toBe(2); // parcel query + one MCD lookup for the one candidate
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

  it("throws a clear error on an HTTP-200-with-in-body-error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: { code: 400, message: "Cannot perform query. Invalid query parameters." },
        }),
      }))
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      /ArcGIS error 400: Cannot perform query/
    );
  });

  it("flattens a MultiPolygon buffer into one flat rings array in the request geometry", async () => {
    let requestedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => ({ features: [] }) };
        }
        requestedInit = init;
        return { ok: true, json: async () => ({ features: [] }) };
      })
    );
    const multiPolygon = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[-86.12, 44.29], [-86.11, 44.29], [-86.11, 44.3], [-86.12, 44.29]]],
        [[[-86.0, 44.4], [-85.99, 44.4], [-85.99, 44.41], [-86.0, 44.4]]],
      ],
    };
    await fetchParcelsIntersecting(multiPolygon);
    const body = String(requestedInit?.body);
    const params = new URLSearchParams(body);
    const geometry = JSON.parse(params.get("geometry")!);
    expect(geometry.rings).toHaveLength(2);
  });

  it("pages through results when the server reports exceededTransferLimit", async () => {
    const ring = [[-86.117, 44.291], [-86.116, 44.291], [-86.116, 44.292], [-86.117, 44.291]];
    const page1 = {
      properties: { exceededTransferLimit: true },
      features: [
        { type: "Feature", properties: { BSA_PIN: "03-021-002-11", ACRES: 5 }, geometry: { type: "Polygon", coordinates: [ring] } },
        { type: "Feature", properties: { BSA_PIN: "03-021-002-12", ACRES: 5 }, geometry: { type: "Polygon", coordinates: [ring] } },
      ],
    };
    const page2 = {
      properties: { exceededTransferLimit: false },
      features: [
        { type: "Feature", properties: { BSA_PIN: "03-021-002-13", ACRES: 5 }, geometry: { type: "Polygon", coordinates: [ring] } },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Manistee" } }] };
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
