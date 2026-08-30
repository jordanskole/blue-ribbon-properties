import { describe, it, expect } from "vitest";
import { openSpatialSession } from "../../src/duckdb/load.js";
import {
  bufferGeometry,
  computeIntersectingCounties,
  loadCountiesForIntersectionCheck,
} from "../../src/duckdb/buffer.js";
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

  it("returns a MultiPolygon when buffering disjoint segments that don't merge into one blob", async () => {
    // The critical bug this fix wave addresses: when the input geometry's
    // segments are far enough apart, ST_Buffer doesn't merge them into one
    // Polygon and returns a MultiPolygon instead -- live-verified 2026-08-29
    // against Osceola's own Pine River (23 segments). This constructs the
    // same shape deterministically offline with two segments ~17km apart, a
    // 1000m buffer between them.
    const session = await openSpatialSession();
    const multiLine = {
      type: "MultiLineString",
      coordinates: [
        [
          [-85.13, 44.068],
          [-85.12, 44.07],
        ],
        [
          [-85.0, 44.2],
          [-84.99, 44.21],
        ],
      ],
    };
    const buffer = await bufferGeometry(session, multiLine, 1000);
    expect(buffer.type).toBe("MultiPolygon");
    expect(buffer.coordinates.length).toBeGreaterThanOrEqual(2);
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

    await loadCountiesForIntersectionCheck(session, [overlapping, disjoint]);
    const result = await computeIntersectingCounties(session, bufferPolygon);
    expect(result).toEqual(["Overlapping"]);
  });

  it("handles a MultiPolygon county boundary (e.g. islands/multi-part shoreline) without erroring", async () => {
    const session = await openSpatialSession();
    // A MultiPolygon county: one part overlaps the buffer, a second disjoint
    // part (like an island far from shore) does not. Confirms
    // ST_GeomFromGeoJSON accepts a correctly-typed MultiPolygon end to end
    // (this is exactly the shape that broke when geometry.type was
    // incorrectly hardcoded to "Polygon" -- see county-boundaries.ts).
    const multiPolygonCounty: CountyBoundary = {
      name: "Multi",
      peninsula: "Lower",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[-85.2, 44.0], [-85.0, 44.0], [-85.0, 44.2], [-85.2, 44.2], [-85.2, 44.0]]],
          [[[-83.0, 44.0], [-82.8, 44.0], [-82.8, 44.2], [-83.0, 44.2], [-83.0, 44.0]]],
        ],
      },
    };
    const bufferPolygon: { type: "Polygon"; coordinates: number[][][] } = {
      type: "Polygon",
      coordinates: [[[-85.15, 44.05], [-85.05, 44.05], [-85.05, 44.15], [-85.15, 44.15], [-85.15, 44.05]]],
    };

    await loadCountiesForIntersectionCheck(session, [multiPolygonCounty]);
    const result = await computeIntersectingCounties(session, bufferPolygon);
    expect(result).toEqual(["Multi"]);
  });

  it("accepts a MultiPolygon buffer as the query geometry, not just as a county boundary", async () => {
    // The buffer polygon itself (bufferGeometry's own output) can be a
    // MultiPolygon too -- see bufferGeometry's own test below for how that
    // arises. computeIntersectingCounties must accept that shape as
    // `bufferPolygon`, not just as a county boundary.
    const session = await openSpatialSession();
    const county: CountyBoundary = {
      name: "Touched",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-85.2, 44.0], [-85.0, 44.0], [-85.0, 44.2], [-85.2, 44.2], [-85.2, 44.0]]],
      },
    };
    const multiPolygonBuffer: { type: "MultiPolygon"; coordinates: number[][][][] } = {
      type: "MultiPolygon",
      coordinates: [
        [[[-85.15, 44.05], [-85.05, 44.05], [-85.05, 44.15], [-85.15, 44.15], [-85.15, 44.05]]],
        [[[-83.0, 44.0], [-82.8, 44.0], [-82.8, 44.2], [-83.0, 44.2], [-83.0, 44.0]]],
      ],
    };

    await loadCountiesForIntersectionCheck(session, [county]);
    const result = await computeIntersectingCounties(session, multiPolygonBuffer);
    expect(result).toEqual(["Touched"]);
  });
});
