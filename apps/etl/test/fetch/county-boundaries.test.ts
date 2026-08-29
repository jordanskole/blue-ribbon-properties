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
