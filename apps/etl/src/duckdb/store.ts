import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from "@duckdb/node-api";
import type { CardDef } from "@brp/schema";

export interface StoreSession {
  connection: DuckDBConnection;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cards (
  parcel_id TEXT PRIMARY KEY,
  county TEXT NOT NULL,
  township TEXT NOT NULL,
  identity_acres_value DOUBLE,
  identity_acres_provenance TEXT NOT NULL,
  identity_acres_vintage_as_of TEXT NOT NULL,
  identity_acres_vintage_source_type TEXT NOT NULL,
  identity_acres_vintage_note TEXT,
  groundwater_thermal_class_value TEXT,
  groundwater_thermal_class_provenance TEXT NOT NULL,
  groundwater_thermal_class_vintage_as_of TEXT NOT NULL,
  groundwater_thermal_class_vintage_source_type TEXT NOT NULL,
  groundwater_thermal_class_vintage_note TEXT,
  groundwater_designated_trout_stream_value BOOLEAN,
  groundwater_designated_trout_stream_provenance TEXT NOT NULL,
  groundwater_designated_trout_stream_vintage_as_of TEXT NOT NULL,
  groundwater_designated_trout_stream_vintage_source_type TEXT NOT NULL,
  groundwater_designated_trout_stream_vintage_note TEXT,
  groundwater_flowing_wells_nearby_value JSON,
  groundwater_flowing_wells_nearby_provenance TEXT NOT NULL,
  groundwater_flowing_wells_nearby_vintage_as_of TEXT NOT NULL,
  groundwater_flowing_wells_nearby_vintage_source_type TEXT NOT NULL,
  groundwater_flowing_wells_nearby_vintage_note TEXT,
  dry_wet_adjacency_dry_acres_value DOUBLE,
  dry_wet_adjacency_dry_acres_provenance TEXT NOT NULL,
  dry_wet_adjacency_dry_acres_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_dry_acres_vintage_source_type TEXT NOT NULL,
  dry_wet_adjacency_dry_acres_vintage_note TEXT,
  dry_wet_adjacency_wet_acres_value DOUBLE,
  dry_wet_adjacency_wet_acres_provenance TEXT NOT NULL,
  dry_wet_adjacency_wet_acres_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_wet_acres_vintage_source_type TEXT NOT NULL,
  dry_wet_adjacency_wet_acres_vintage_note TEXT,
  dry_wet_adjacency_dominant_dry_soil_value JSON,
  dry_wet_adjacency_dominant_dry_soil_provenance TEXT NOT NULL,
  dry_wet_adjacency_dominant_dry_soil_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_dominant_dry_soil_vintage_source_type TEXT NOT NULL,
  dry_wet_adjacency_dominant_dry_soil_vintage_note TEXT,
  dry_wet_adjacency_adjacent_value BOOLEAN,
  dry_wet_adjacency_adjacent_provenance TEXT NOT NULL,
  dry_wet_adjacency_adjacent_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_adjacent_vintage_source_type TEXT NOT NULL,
  dry_wet_adjacency_adjacent_vintage_note TEXT,
  relief_envelope_to_water_ft_value DOUBLE,
  relief_envelope_to_water_ft_provenance TEXT NOT NULL,
  relief_envelope_to_water_ft_vintage_as_of TEXT NOT NULL,
  relief_envelope_to_water_ft_vintage_source_type TEXT NOT NULL,
  relief_envelope_to_water_ft_vintage_note TEXT,
  wetland_wetland_pct_value DOUBLE,
  wetland_wetland_pct_provenance TEXT NOT NULL,
  wetland_wetland_pct_vintage_as_of TEXT NOT NULL,
  wetland_wetland_pct_vintage_source_type TEXT NOT NULL,
  wetland_wetland_pct_vintage_note TEXT,
  wetland_wetland_between_envelope_and_water_value BOOLEAN,
  wetland_wetland_between_envelope_and_water_provenance TEXT NOT NULL,
  wetland_wetland_between_envelope_and_water_vintage_as_of TEXT NOT NULL,
  wetland_wetland_between_envelope_and_water_vintage_source_type TEXT NOT NULL,
  wetland_wetland_between_envelope_and_water_vintage_note TEXT,
  prominence_ft_value DOUBLE,
  prominence_ft_provenance TEXT NOT NULL,
  prominence_ft_vintage_as_of TEXT NOT NULL,
  prominence_ft_vintage_source_type TEXT NOT NULL,
  prominence_ft_vintage_note TEXT
)`;

export async function openStore(path: string): Promise<StoreSession> {
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  await connection.run("INSTALL json;");
  await connection.run("LOAD json;");
  await connection.run(CREATE_TABLE_SQL);
  return { connection };
}

export async function hasCard(session: StoreSession, parcelId: string): Promise<boolean> {
  const reader = await session.connection.runAndReadAll(
    `SELECT COUNT(*) AS n FROM cards WHERE parcel_id = $1`,
    [parcelId]
  );
  const rows = reader.getRowObjectsJS();
  return Number(rows[0].n) > 0;
}

export async function insertCard(session: StoreSession, card: CardDef): Promise<void> {
  const params: DuckDBValue[] = [
    card.identity.parcel_id,
    card.identity.county,
    card.identity.township,
    card.identity.acres.value,
    card.identity.acres.provenance,
    card.identity.acres.vintage.as_of,
    card.identity.acres.vintage.source_type,
    card.identity.acres.vintage.note ?? null,
    card.groundwater.thermal_class.value,
    card.groundwater.thermal_class.provenance,
    card.groundwater.thermal_class.vintage.as_of,
    card.groundwater.thermal_class.vintage.source_type,
    card.groundwater.thermal_class.vintage.note ?? null,
    card.groundwater.designated_trout_stream.value,
    card.groundwater.designated_trout_stream.provenance,
    card.groundwater.designated_trout_stream.vintage.as_of,
    card.groundwater.designated_trout_stream.vintage.source_type,
    card.groundwater.designated_trout_stream.vintage.note ?? null,
    card.groundwater.flowing_wells_nearby.value === null
      ? null
      : JSON.stringify(card.groundwater.flowing_wells_nearby.value),
    card.groundwater.flowing_wells_nearby.provenance,
    card.groundwater.flowing_wells_nearby.vintage.as_of,
    card.groundwater.flowing_wells_nearby.vintage.source_type,
    card.groundwater.flowing_wells_nearby.vintage.note ?? null,
    card.dry_wet_adjacency.dry_acres.value,
    card.dry_wet_adjacency.dry_acres.provenance,
    card.dry_wet_adjacency.dry_acres.vintage.as_of,
    card.dry_wet_adjacency.dry_acres.vintage.source_type,
    card.dry_wet_adjacency.dry_acres.vintage.note ?? null,
    card.dry_wet_adjacency.wet_acres.value,
    card.dry_wet_adjacency.wet_acres.provenance,
    card.dry_wet_adjacency.wet_acres.vintage.as_of,
    card.dry_wet_adjacency.wet_acres.vintage.source_type,
    card.dry_wet_adjacency.wet_acres.vintage.note ?? null,
    card.dry_wet_adjacency.dominant_dry_soil.value === null
      ? null
      : JSON.stringify(card.dry_wet_adjacency.dominant_dry_soil.value),
    card.dry_wet_adjacency.dominant_dry_soil.provenance,
    card.dry_wet_adjacency.dominant_dry_soil.vintage.as_of,
    card.dry_wet_adjacency.dominant_dry_soil.vintage.source_type,
    card.dry_wet_adjacency.dominant_dry_soil.vintage.note ?? null,
    card.dry_wet_adjacency.adjacent.value,
    card.dry_wet_adjacency.adjacent.provenance,
    card.dry_wet_adjacency.adjacent.vintage.as_of,
    card.dry_wet_adjacency.adjacent.vintage.source_type,
    card.dry_wet_adjacency.adjacent.vintage.note ?? null,
    card.relief_envelope_to_water_ft.value,
    card.relief_envelope_to_water_ft.provenance,
    card.relief_envelope_to_water_ft.vintage.as_of,
    card.relief_envelope_to_water_ft.vintage.source_type,
    card.relief_envelope_to_water_ft.vintage.note ?? null,
    card.wetland.wetland_pct.value,
    card.wetland.wetland_pct.provenance,
    card.wetland.wetland_pct.vintage.as_of,
    card.wetland.wetland_pct.vintage.source_type,
    card.wetland.wetland_pct.vintage.note ?? null,
    card.wetland.wetland_between_envelope_and_water.value,
    card.wetland.wetland_between_envelope_and_water.provenance,
    card.wetland.wetland_between_envelope_and_water.vintage.as_of,
    card.wetland.wetland_between_envelope_and_water.vintage.source_type,
    card.wetland.wetland_between_envelope_and_water.vintage.note ?? null,
    card.prominence_ft.value,
    card.prominence_ft.provenance,
    card.prominence_ft.vintage.as_of,
    card.prominence_ft.vintage.source_type,
    card.prominence_ft.vintage.note ?? null,
  ];
  // Explicit column list, in the same order as CREATE_TABLE_SQL and the
  // params array above -- 63 positional columns of mostly-interchangeable
  // types (many DOUBLE/TEXT/BOOLEAN columns in a row) meant a future DDL
  // reordering could silently corrupt data with no type error to catch it.
  const columns = [
    "parcel_id",
    "county",
    "township",
    "identity_acres_value",
    "identity_acres_provenance",
    "identity_acres_vintage_as_of",
    "identity_acres_vintage_source_type",
    "identity_acres_vintage_note",
    "groundwater_thermal_class_value",
    "groundwater_thermal_class_provenance",
    "groundwater_thermal_class_vintage_as_of",
    "groundwater_thermal_class_vintage_source_type",
    "groundwater_thermal_class_vintage_note",
    "groundwater_designated_trout_stream_value",
    "groundwater_designated_trout_stream_provenance",
    "groundwater_designated_trout_stream_vintage_as_of",
    "groundwater_designated_trout_stream_vintage_source_type",
    "groundwater_designated_trout_stream_vintage_note",
    "groundwater_flowing_wells_nearby_value",
    "groundwater_flowing_wells_nearby_provenance",
    "groundwater_flowing_wells_nearby_vintage_as_of",
    "groundwater_flowing_wells_nearby_vintage_source_type",
    "groundwater_flowing_wells_nearby_vintage_note",
    "dry_wet_adjacency_dry_acres_value",
    "dry_wet_adjacency_dry_acres_provenance",
    "dry_wet_adjacency_dry_acres_vintage_as_of",
    "dry_wet_adjacency_dry_acres_vintage_source_type",
    "dry_wet_adjacency_dry_acres_vintage_note",
    "dry_wet_adjacency_wet_acres_value",
    "dry_wet_adjacency_wet_acres_provenance",
    "dry_wet_adjacency_wet_acres_vintage_as_of",
    "dry_wet_adjacency_wet_acres_vintage_source_type",
    "dry_wet_adjacency_wet_acres_vintage_note",
    "dry_wet_adjacency_dominant_dry_soil_value",
    "dry_wet_adjacency_dominant_dry_soil_provenance",
    "dry_wet_adjacency_dominant_dry_soil_vintage_as_of",
    "dry_wet_adjacency_dominant_dry_soil_vintage_source_type",
    "dry_wet_adjacency_dominant_dry_soil_vintage_note",
    "dry_wet_adjacency_adjacent_value",
    "dry_wet_adjacency_adjacent_provenance",
    "dry_wet_adjacency_adjacent_vintage_as_of",
    "dry_wet_adjacency_adjacent_vintage_source_type",
    "dry_wet_adjacency_adjacent_vintage_note",
    "relief_envelope_to_water_ft_value",
    "relief_envelope_to_water_ft_provenance",
    "relief_envelope_to_water_ft_vintage_as_of",
    "relief_envelope_to_water_ft_vintage_source_type",
    "relief_envelope_to_water_ft_vintage_note",
    "wetland_wetland_pct_value",
    "wetland_wetland_pct_provenance",
    "wetland_wetland_pct_vintage_as_of",
    "wetland_wetland_pct_vintage_source_type",
    "wetland_wetland_pct_vintage_note",
    "wetland_wetland_between_envelope_and_water_value",
    "wetland_wetland_between_envelope_and_water_provenance",
    "wetland_wetland_between_envelope_and_water_vintage_as_of",
    "wetland_wetland_between_envelope_and_water_vintage_source_type",
    "wetland_wetland_between_envelope_and_water_vintage_note",
    "prominence_ft_value",
    "prominence_ft_provenance",
    "prominence_ft_vintage_as_of",
    "prominence_ft_vintage_source_type",
    "prominence_ft_vintage_note",
  ];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  await session.connection.run(
    `INSERT INTO cards (${columns.join(", ")}) VALUES (${placeholders})`,
    params
  );
}

export async function exportParquet(session: StoreSession, parquetPath: string): Promise<void> {
  await session.connection.run(`COPY cards TO '${parquetPath}' (FORMAT PARQUET)`);
}

/** Releases the store's connection. Every `openStore()` caller should close
 * it (ideally in a `finally`) once done -- see `closeSpatialSession` in
 * `load.ts` for why this matters. */
export function closeStore(session: StoreSession): void {
  session.connection.closeSync();
}
