import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardDef } from "@brp/schema";

// Every network-touching dependency is mocked so this test runs fully
// offline and deterministically; the DuckDB-backed pieces (duckdb/load.js,
// duckdb/buffer.js, duckdb/store.js) run for real against simple in-memory
// geometries -- no network involved there either.

vi.mock("../src/fetch/county-boundaries.js", () => ({
  fetchLowerPeninsulaCounties: vi.fn(async () => [
    {
      name: "Osceola",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-85.3, 43.9], [-85.0, 43.9], [-85.0, 44.2], [-85.3, 44.2], [-85.3, 43.9]]],
      },
    },
  ]),
}));

vi.mock("../src/data/blue-ribbon-streams.js", () => ({
  BLUE_RIBBON_STREAMS_LP: [
    { name: "Bad Stream", counties: ["Osceola"] },
    { name: "Good Stream", counties: ["Osceola"] },
  ],
}));

vi.mock("../src/fetch/blue-ribbon-geometry.js", () => ({
  resolveStreamGeometry: vi.fn(async (record: { name: string }) => {
    if (record.name === "Bad Stream") {
      // Simulates the Critical-bug class of failure this fix wave
      // addresses: a per-stream operation (here, geometry resolution --
      // could equally be bufferGeometry or fetchParcelsIntersecting)
      // throwing an unhandled exception. Per-stream isolation must catch
      // this, record a failure, and continue to the next stream.
      throw new Error("simulated per-stream failure");
    }
    return {
      record,
      geometry: {
        type: "MultiLineString",
        coordinates: [[[-85.13, 44.068], [-85.12, 44.07]]],
      },
      matchedNames: [record.name],
    };
  }),
}));

const fakeAdapter = {
  county: "Osceola",
  fetchParcel: vi.fn(),
  normalize: vi.fn((raw: { properties: { PIN: string } }) => ({
    pin: raw.properties.PIN,
    county: "Osceola",
    township: "Middle Branch",
    acres: 3.755,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[-85.13, 44.068], [-85.12, 44.068], [-85.12, 44.07], [-85.13, 44.068]]],
    },
  })),
  fetchParcelsIntersecting: vi.fn(async () => [
    {
      properties: { PIN: "10-003-001-00" },
      geometry: {
        type: "Polygon",
        coordinates: [[[-85.13, 44.068], [-85.12, 44.068], [-85.12, 44.07], [-85.13, 44.068]]],
      },
    },
  ]),
};

vi.mock("../src/counties/registry.js", () => ({
  getCountyAdapter: vi.fn(() => fakeAdapter),
}));

function makeFakeCard(parcelId: string): CardDef {
  return {
    identity: {
      parcel_id: parcelId,
      county: "Osceola",
      township: "Middle Branch",
      acres: {
        value: 3.755,
        provenance: "verified",
        vintage: { as_of: "2026-08-29", source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: {
        value: null,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "continuous" },
      },
      designated_trout_stream: {
        value: false,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "continuous" },
      },
      flowing_wells_nearby: {
        value: null,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" },
      },
    },
    dry_wet_adjacency: {
      dry_acres: {
        value: 3.755,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic" },
      },
      wet_acres: {
        value: 0,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic" },
      },
      dominant_dry_soil: {
        value: { series: "Kalkaska", dwelling_rating: "Slight" },
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic" },
      },
      adjacent: {
        value: null,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" },
      },
    },
    relief_envelope_to_water_ft: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" },
    },
    wetland: {
      wetland_pct: {
        value: null,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" },
      },
      wetland_between_envelope_and_water: {
        value: null,
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" },
      },
    },
    prominence_ft: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" },
    },
  };
}

vi.mock("../src/index.js", () => ({
  deriveCardForParcel: vi.fn(async (parcel: { pin: string }) => makeFakeCard(parcel.pin)),
}));

// Imported after the mocks above so batch.ts picks up the mocked modules.
const { runBlueRibbonCorridorBatch } = await import("../src/batch.js");

describe("runBlueRibbonCorridorBatch per-stream error isolation (mocked network)", () => {
  it("records a failure for a stream that throws and still processes the remaining streams", async () => {
    const dir = mkdtempSync(join(tmpdir(), "brp-batch-unit-"));
    const storePath = join(dir, "corridor.duckdb");

    const summary = await runBlueRibbonCorridorBatch(storePath, { counties: ["Osceola"] });

    // "Bad Stream" threw inside resolveStreamGeometry -- must be recorded as
    // a failure, not propagate out of the whole batch run.
    expect(
      summary.failures.some((f) => f.error.includes("simulated per-stream failure"))
    ).toBe(true);

    // "Good Stream" (processed after the bad one) must still have run to
    // completion: its one candidate parcel found and written.
    expect(summary.candidatesFound).toBe(1);
    expect(summary.cardsWritten).toBe(1);
  });
});
