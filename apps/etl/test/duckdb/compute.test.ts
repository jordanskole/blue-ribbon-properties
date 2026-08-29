import { describe, it, expect, beforeEach } from "vitest";
import {
  openSpatialSession,
  loadParcel,
  loadMiEnviroFeatures,
  loadSoilPolygons,
  type DuckDbSession,
} from "../../src/duckdb/load.js";
import {
  computeThermalClass,
  computeDesignatedTroutStream,
  computeSoilPolygonAreas,
} from "../../src/duckdb/compute.js";
import { ringToWkt } from "../../src/fetch/ssurgo.js";

// Real N 20th Ave parcel 013-20 ring, proven by the spike to be 3.755 acres,
// re-confirmed via the verified area formula during spec verification.
const PARCEL_013_20 = {
  pin: "10-003-013-20",
  county: "Osceola",
  township: "Middle Branch",
  acres: 3.755,
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-85.12735272620779, 44.068435572734145],
        [-85.1284002194097, 44.06850159006744],
        [-85.12994981750543, 44.06859923491718],
        [-85.12994658824186, 44.06917724044619],
        [-85.12734858168078, 44.0691716555711],
        [-85.12735272620779, 44.068435572734145],
      ],
    ],
  },
};

describe("duckdb compute", () => {
  let session: DuckDbSession;

  beforeEach(async () => {
    session = await openSpatialSession();
    await loadParcel(session, PARCEL_013_20);
  });

  it("computeThermalClass returns null when no stream reach intersects (the real N 20th Ave case)", async () => {
    await loadMiEnviroFeatures(session, "mienviro_1", [], ["TemperatureGradient"]);
    const result = await computeThermalClass(session);
    expect(result).toBeNull();
  });

  it("computeThermalClass returns the TemperatureGradient when a reach intersects", async () => {
    await loadMiEnviroFeatures(
      session,
      "mienviro_1",
      [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-85.13, 44.068],
                [-85.125, 44.068],
                [-85.125, 44.07],
                [-85.13, 44.07],
                [-85.13, 44.068],
              ],
            ],
          },
          properties: { TemperatureGradient: "Cold stream" },
        },
      ],
      ["TemperatureGradient"]
    );
    const result = await computeThermalClass(session);
    expect(result).toBe("Cold stream");
  });

  it("computeDesignatedTroutStream returns false with no intersecting Designated=1 feature", async () => {
    await loadMiEnviroFeatures(session, "mienviro_32", [], ["Designated"]);
    const result = await computeDesignatedTroutStream(session);
    expect(result).toBe(false);
  });

  it("computeDesignatedTroutStream returns true when an intersecting Designated=1 feature exists", async () => {
    await loadMiEnviroFeatures(
      session,
      "mienviro_32",
      [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-85.13, 44.068],
                [-85.125, 44.068],
                [-85.125, 44.07],
                [-85.13, 44.07],
                [-85.13, 44.068],
              ],
            ],
          },
          properties: { Designated: "1" },
        },
      ],
      ["Designated"]
    );
    const result = await computeDesignatedTroutStream(session);
    expect(result).toBe(true);
  });

  it("computeSoilPolygonAreas returns the verified acreage for the full parcel polygon itself", async () => {
    // Using the parcel's own polygon as a stand-in "soil polygon" proves the
    // area formula against a value independently known from the spike: 3.755 ac.
    await loadSoilPolygons(session, [
      { mukey: "TEST", wkt: ringToWkt(PARCEL_013_20.geometry.coordinates[0]) },
    ]);
    const results = await computeSoilPolygonAreas(session);
    expect(results).toHaveLength(1);
    expect(results[0].mukey).toBe("TEST");
    expect(results[0].acres).toBeCloseTo(3.755, 2);
  });
});
