import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { CardDef } from "@brp/schema";
import { CARD_COLUMNS } from "@brp/schema";
import { openStore, hasCard, insertCard, exportParquet, type StoreSession } from "../../src/duckdb/store.js";

function makeCard(parcelId: string): CardDef {
  return {
    identity: {
      parcel_id: parcelId,
      county: "Osceola",
      township: "Middle Branch",
      acres: { value: 3.755, provenance: "verified", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      boundary: {
        value: {
          type: "Polygon",
          coordinates: [[[-85.1, 44.1], [-85.099, 44.1], [-85.099, 44.101], [-85.1, 44.1]]],
        },
        provenance: "verified",
        vintage: { as_of: "2026-08-29", source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      designated_trout_stream: { value: false, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      flowing_wells_nearby: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" } },
    },
    dry_wet_adjacency: {
      dry_acres: { value: 3.755, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic" } },
      wet_acres: { value: 0, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic" } },
      dominant_dry_soil: {
        value: { series: "Kalkaska", dwelling_rating: "Slight" },
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic" },
      },
      adjacent: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" } },
    },
    relief_envelope_to_water_ft: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
    wetland: {
      wetland_pct: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
      wetland_between_envelope_and_water: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
    },
    prominence_ft: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
  };
}

describe("duckdb store", () => {
  let dir: string;
  let session: StoreSession;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "brp-store-test-"));
    session = await openStore(join(dir, "test.duckdb"));
  });

  it("hasCard is false before insert and true after", async () => {
    expect(await hasCard(session, "10-003-013-20")).toBe(false);
    await insertCard(session, makeCard("10-003-013-20"));
    expect(await hasCard(session, "10-003-013-20")).toBe(true);
  });

  it("round-trips scalar, boolean, null, and JSON-object fields correctly", async () => {
    await insertCard(session, makeCard("10-003-013-20"));
    const reader = await session.connection.runAndReadAll(
      `SELECT identity_acres_value, identity_acres_vintage_source_type,
              groundwater_designated_trout_stream_value,
              groundwater_thermal_class_value,
              dry_wet_adjacency_dominant_dry_soil_value,
              identity_boundary_value
       FROM cards WHERE parcel_id = $1`,
      ["10-003-013-20"]
    );
    const rows = reader.getRowObjectsJS();
    expect(rows[0].identity_acres_value).toBe(3.755);
    expect(rows[0].identity_acres_vintage_source_type).toBe("continuous");
    expect(rows[0].groundwater_designated_trout_stream_value).toBe(false);
    expect(rows[0].groundwater_thermal_class_value).toBeNull();
    expect(JSON.parse(String(rows[0].dry_wet_adjacency_dominant_dry_soil_value))).toEqual({
      series: "Kalkaska",
      dwelling_rating: "Slight",
    });
    expect(JSON.parse(String(rows[0].identity_boundary_value))).toEqual({
      type: "Polygon",
      coordinates: [[[-85.1, 44.1], [-85.099, 44.1], [-85.099, 44.101], [-85.1, 44.1]]],
    });
  });

  it("the live table's column order matches @brp/schema's CARD_COLUMNS exactly", async () => {
    const reader = await session.connection.runAndReadAll(
      `SELECT column_name FROM duckdb_columns() WHERE table_name = 'cards' ORDER BY column_index`
    );
    const liveColumns = reader.getRowObjectsJS().map((r) => String(r.column_name));
    expect(liveColumns).toEqual(CARD_COLUMNS);
  });

  it("exports to Parquet and the export is independently readable", async () => {
    await insertCard(session, makeCard("10-003-013-20"));
    const parquetPath = join(dir, "test.parquet");
    await exportParquet(session, parquetPath);

    const readBack = await DuckDBInstance.create(":memory:");
    const readConn = await readBack.connect();
    const reader = await readConn.runAndReadAll(
      `SELECT parcel_id FROM read_parquet('${parquetPath}')`
    );
    expect(reader.getRowObjectsJS()).toEqual([{ parcel_id: "10-003-013-20" }]);
  });
});
