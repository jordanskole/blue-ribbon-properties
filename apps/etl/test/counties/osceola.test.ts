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

  it("requests a polygon-intersects query via POST and returns the raw features", async () => {
    // POST, not GET -- a real corridor buffer's geometry parameter is large
    // enough to overflow a GET URL's length limit (live-verified 2026-08-29
    // against Middle Branch River: IIS "400 Request Too Long"), so the
    // geometry/query params must travel in the request body instead.
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
    let requestedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedInit = init;
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
    // No query string on the URL itself -- everything travels in the body.
    expect(requestedUrl).not.toContain("?");
    expect(requestedInit?.method).toBe("POST");
    expect(requestedInit?.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const body = String(requestedInit?.body);
    expect(body).toContain("geometryType=esriGeometryPolygon");
    expect(body).toContain("spatialRel=esriSpatialRelIntersects");
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error" })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      "Osceola FeatureServer intersects request failed: 500 Internal Server Error"
    );
  });

  it("throws a clear error on an HTTP-200-with-in-body-error response", async () => {
    // Live-verified 2026-08-29: a malformed query to Osceola's FeatureServer
    // returns HTTP 200 with {"error":{"code":400,"message":"..."}}. The
    // res.ok check alone misses this, and reading body.features would
    // otherwise crash with an unrelated-looking TypeError.
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
      vi.fn(async (_url: string, init?: RequestInit) => {
        requestedInit = init;
        return { ok: true, json: async () => ({ features: [] }) };
      })
    );
    const multiPolygon = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[-85.13, 44.068], [-85.12, 44.068], [-85.12, 44.07], [-85.13, 44.068]]],
        [[[-85.0, 44.2], [-84.99, 44.2], [-84.99, 44.21], [-85.0, 44.2]]],
      ],
    };
    await fetchParcelsIntersecting(multiPolygon);
    const body = String(requestedInit?.body);
    const params = new URLSearchParams(body);
    const geometry = JSON.parse(params.get("geometry")!);
    // Two polygons' worth of rings (1 ring each here), flattened into one
    // array -- not nested per-polygon.
    expect(geometry.rings).toHaveLength(2);
  });

  it("pages through results when the server reports exceededTransferLimit", async () => {
    const page1 = {
      properties: { exceededTransferLimit: true },
      features: [
        { type: "Feature", properties: { PIN: "10 003 001 00", OWNER: "A", PROPCLASS: "X", UNIT: "MIDDLE BRANCH TOWNSHIP", Shape__Area: 1000 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] } },
        { type: "Feature", properties: { PIN: "10 003 002 00", OWNER: "B", PROPCLASS: "X", UNIT: "MIDDLE BRANCH TOWNSHIP", Shape__Area: 1000 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] } },
      ],
    };
    const page2 = {
      properties: { exceededTransferLimit: false },
      features: [
        { type: "Feature", properties: { PIN: "10 003 003 00", OWNER: "C", PROPCLASS: "X", UNIT: "MIDDLE BRANCH TOWNSHIP", Shape__Area: 1000 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] } },
      ],
    };
    const seenOffsets: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const params = new URLSearchParams(String(init?.body));
        seenOffsets.push(params.get("resultOffset")!);
        return { ok: true, json: async () => (params.get("resultOffset") === "0" ? page1 : page2) };
      })
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(3);
    expect(seenOffsets).toEqual(["0", "2"]);
  });
});
