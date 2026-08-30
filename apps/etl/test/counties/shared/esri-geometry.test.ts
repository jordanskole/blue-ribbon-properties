import { describe, it, expect } from "vitest";
import {
  webMercatorToWgs84,
  toEsriRings,
  assertNoArcgisError,
  fetchAllEsriPages,
} from "../../../src/counties/shared/esri-geometry.js";

describe("webMercatorToWgs84", () => {
  it("matches DuckDB's ST_Transform for a known EPSG:3857 point", () => {
    // Verified live against DuckDB ST_Transform('EPSG:3857' -> 'EPSG:4326')
    // for the target parcel's first vertex (PIN 062-026-300-020-00).
    const [lng, lat] = webMercatorToWgs84(-9287826.28, 5533738.12);
    expect(lng).toBeCloseTo(-83.43396303570957, 9);
    expect(lat).toBeCloseTo(44.4396825950131, 9);
  });
});

describe("toEsriRings", () => {
  it("passes a Polygon's coordinates through unchanged", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-83.44, 44.43], [-83.43, 44.43], [-83.43, 44.44], [-83.44, 44.43]]],
    };
    expect(toEsriRings(polygon)).toBe(polygon.coordinates);
  });

  it("flattens a MultiPolygon's per-polygon ring lists into one flat rings array", () => {
    const multiPolygon = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[-83.44, 44.43], [-83.43, 44.43], [-83.43, 44.44], [-83.44, 44.43]]],
        [[[-83.2, 44.6], [-83.19, 44.6], [-83.19, 44.61], [-83.2, 44.6]]],
      ],
    };
    const rings = toEsriRings(multiPolygon);
    expect(rings).toHaveLength(2);
    expect(rings[0]).toEqual(multiPolygon.coordinates[0][0]);
    expect(rings[1]).toEqual(multiPolygon.coordinates[1][0]);
  });
});

describe("assertNoArcgisError", () => {
  it("does not throw for a normal response body", () => {
    expect(() => assertNoArcgisError({ features: [] }, "test")).not.toThrow();
  });

  it("throws a clear error for an HTTP-200-with-in-body-error response", () => {
    const body = { error: { code: 400, message: "Cannot perform query." } };
    expect(() => assertNoArcgisError(body, "test context")).toThrow(
      "test context: ArcGIS error 400: Cannot perform query."
    );
  });
});

describe("fetchAllEsriPages", () => {
  it("stops after one page when exceededTransferLimit is false", async () => {
    const fetchPage = async () => ({ features: [1, 2, 3], exceededTransferLimit: false });
    const results = await fetchAllEsriPages(fetchPage);
    expect(results).toEqual([1, 2, 3]);
  });

  it("pages through results, incrementing resultOffset by the prior page's size", async () => {
    const seenOffsets: number[] = [];
    const fetchPage = async (resultOffset: number) => {
      seenOffsets.push(resultOffset);
      if (resultOffset === 0) return { features: [1, 2], exceededTransferLimit: true };
      return { features: [3], exceededTransferLimit: false };
    };
    const results = await fetchAllEsriPages(fetchPage);
    expect(results).toEqual([1, 2, 3]);
    expect(seenOffsets).toEqual([0, 2]);
  });

  it("stops when a page returns zero features even if exceededTransferLimit is true", async () => {
    const fetchPage = async () => ({ features: [], exceededTransferLimit: true });
    const results = await fetchAllEsriPages(fetchPage);
    expect(results).toEqual([]);
  });
});
