import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bboxFromGeometry,
  fetchColdStreams,
  fetchDesignatedTroutStreams,
} from "../../src/fetch/mienviro.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bboxFromGeometry", () => {
  it("computes a buffered bbox from Polygon coordinates", () => {
    const geometry = {
      type: "Polygon",
      coordinates: [
        [
          [-85.13, 44.068],
          [-85.128, 44.068],
          [-85.128, 44.069],
          [-85.13, 44.069],
          [-85.13, 44.068],
        ],
      ],
    };
    const bbox = bboxFromGeometry(geometry, 0.01);
    expect(bbox[0]).toBeCloseTo(-85.14, 5);
    expect(bbox[1]).toBeCloseTo(44.058, 5);
    expect(bbox[2]).toBeCloseTo(-85.118, 5);
    expect(bbox[3]).toBeCloseTo(44.079, 5);
  });

  it("computes a buffered bbox spanning every polygon in a MultiPolygon", () => {
    // Two disjoint rectangles, e.g. a mainland county plus an island --
    // the bbox must span both, not just the first polygon's ring.
    const geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-85.13, 44.068],
            [-85.128, 44.068],
            [-85.128, 44.069],
            [-85.13, 44.069],
            [-85.13, 44.068],
          ],
        ],
        [
          [
            [-84.9, 44.2],
            [-84.89, 44.2],
            [-84.89, 44.21],
            [-84.9, 44.21],
            [-84.9, 44.2],
          ],
        ],
      ],
    };
    const bbox = bboxFromGeometry(geometry, 0.01);
    expect(bbox[0]).toBeCloseTo(-85.14, 5); // min lon from the first polygon
    expect(bbox[1]).toBeCloseTo(44.058, 5); // min lat from the first polygon
    expect(bbox[2]).toBeCloseTo(-84.88, 5); // max lon from the second polygon
    expect(bbox[3]).toBeCloseTo(44.22, 5); // max lat from the second polygon
  });
});

describe("fetchColdStreams", () => {
  it("returns features from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-85.17, 44.12],
              [-85.16, 44.12],
            ],
          },
          properties: {
            NHSStreamName: "Middle Branch River",
            ReachCode: "04060102000219",
            TemperatureGradient: "Cold stream",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockResponse }))
    );
    const features = await fetchColdStreams([-85.18, 44.11, -85.15, 44.13]);
    expect(features).toHaveLength(1);
    expect(features[0].properties.TemperatureGradient).toBe("Cold stream");
  });

  it("returns an empty array when nothing intersects (the real N 20th Ave case)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ type: "FeatureCollection", features: [] }),
      }))
    );
    const features = await fetchColdStreams([-85.14, 44.064, -85.125, 44.072]);
    expect(features).toEqual([]);
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }))
    );
    await expect(
      fetchColdStreams([-85.18, 44.11, -85.15, 44.13])
    ).rejects.toThrow("MiEnviro layer 1 request failed: 500 Internal Server Error");
  });
});

describe("fetchDesignatedTroutStreams", () => {
  it("returns features from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-85.134, 44.07],
              [-85.125, 44.056],
            ],
          },
          properties: {
            GNISName: "Middle Branch River",
            RegulationType: "Type 1",
            Designated: 1,
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockResponse }))
    );
    const features = await fetchDesignatedTroutStreams([
      -85.14, 44.064, -85.125, 44.072,
    ]);
    expect(features).toHaveLength(1);
    expect(features[0].properties.Designated).toBe(1);
  });
});
