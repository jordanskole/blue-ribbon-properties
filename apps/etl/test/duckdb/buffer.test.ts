import { describe, it, expect } from "vitest";
import { openSpatialSession } from "../../src/duckdb/load.js";
import { bufferGeometry, computeIntersectingCounties } from "../../src/duckdb/buffer.js";
import type { CountyBoundary } from "../../src/fetch/county-boundaries.js";

describe("bufferGeometry", () => {
  it("produces a Polygon whose area matches the verified reference computation", async () => {
    const session = await openSpatialSession();
    const line = {
      type: "LineString",
      coordinates: [
        [-85.13, 44.068],
        [-85.1, 44.075],
      ],
    };
    const buffer = await bufferGeometry(session, line, 1000);
    expect(buffer.type).toBe("Polygon");

    // Cross-check the buffer's own area with the project's verified area
    // formula, against the value confirmed live during planning (~2021 acres).
    const reader = await session.connection.runAndReadAll(`
      SELECT ST_Area(ST_GeomFromGeoJSON('${JSON.stringify(buffer)}'))
        * POWER(111320.0, 2)
        * COS(RADIANS(ST_Y(ST_Centroid(ST_GeomFromGeoJSON('${JSON.stringify(buffer)}')))))
        / 4046.8564224 AS acres
    `);
    const rows = reader.getRowObjectsJS();
    expect(Number(rows[0].acres)).toBeCloseTo(2021, -2); // within ~100 acres
  });
});

describe("computeIntersectingCounties", () => {
  it("returns only the counties whose boundary actually intersects the buffer", async () => {
    const session = await openSpatialSession();
    const overlapping: CountyBoundary = {
      name: "Overlapping",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-85.2, 44.0], [-85.0, 44.0], [-85.0, 44.2], [-85.2, 44.2], [-85.2, 44.0]]],
      },
    };
    const disjoint: CountyBoundary = {
      name: "Disjoint",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-83.0, 44.0], [-82.8, 44.0], [-82.8, 44.2], [-83.0, 44.2], [-83.0, 44.0]]],
      },
    };
    const bufferPolygon: { type: "Polygon"; coordinates: number[][][] } = {
      type: "Polygon",
      coordinates: [[[-85.15, 44.05], [-85.05, 44.05], [-85.05, 44.15], [-85.15, 44.15], [-85.15, 44.05]]],
    };

    const result = await computeIntersectingCounties(session, bufferPolygon, [overlapping, disjoint]);
    expect(result).toEqual(["Overlapping"]);
  });
});
