import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLowerPeninsulaCounties } from "../../src/fetch/county-boundaries.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLowerPeninsulaCounties", () => {
  it("returns parsed county boundaries from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { Name: "Osceola", Peninsula: "Lower" },
          geometry: { type: "Polygon", coordinates: [[[-85.5, 43.8], [-85.1, 43.8], [-85.1, 44.2], [-85.5, 44.2], [-85.5, 43.8]]] },
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
    const counties = await fetchLowerPeninsulaCounties();
    expect(counties).toHaveLength(1);
    expect(counties[0]).toEqual({
      name: "Osceola",
      peninsula: "Lower",
      geometry: { type: "Polygon", coordinates: mockResponse.features[0].geometry.coordinates },
    });
    expect(requestedUrl).toContain("Peninsula%3D%27Lower%27");
    expect(requestedUrl).toContain("f=geojson");
  });

  it("preserves a real MultiPolygon geometry type/coordinates instead of stamping Polygon", async () => {
    // Live-verified 2026-08-29: several Lower Peninsula counties with islands
    // or multi-part shorelines (e.g. Alpena) are genuinely MultiPolygon in the
    // County FeatureServer's response -- this must round-trip untouched.
    const multiPolygonCoords = [
      [[[-83.4, 45.0], [-83.3, 45.0], [-83.3, 45.1], [-83.4, 45.1], [-83.4, 45.0]]],
      [[[-83.2, 45.2], [-83.1, 45.2], [-83.1, 45.3], [-83.2, 45.3], [-83.2, 45.2]]],
    ];
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { Name: "Alpena", Peninsula: "Lower" },
          geometry: { type: "MultiPolygon", coordinates: multiPolygonCoords },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockResponse }))
    );
    const counties = await fetchLowerPeninsulaCounties();
    expect(counties).toHaveLength(1);
    expect(counties[0]).toEqual({
      name: "Alpena",
      peninsula: "Lower",
      geometry: { type: "MultiPolygon", coordinates: multiPolygonCoords },
    });
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable" }))
    );
    await expect(fetchLowerPeninsulaCounties()).rejects.toThrow(
      "County FeatureServer request failed: 503 Service Unavailable"
    );
  });
});
