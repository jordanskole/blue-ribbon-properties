import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { NormalizedParcelRecord } from "../counties/types.js";
import type { MiEnviroFeature } from "../fetch/mienviro.js";
import type { ClippedSoilPolygon } from "../fetch/ssurgo.js";

export interface DuckDbSession {
  connection: DuckDBConnection;
}

export async function openSpatialSession(): Promise<DuckDbSession> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run("INSTALL spatial;");
  await connection.run("LOAD spatial;");
  return { connection };
}

export async function loadParcel(
  session: DuckDbSession,
  parcel: NormalizedParcelRecord
): Promise<void> {
  await session.connection.run("CREATE TABLE parcel (pin VARCHAR, geom GEOMETRY)");
  await session.connection.run(
    "INSERT INTO parcel VALUES ($1, ST_GeomFromGeoJSON($2::VARCHAR))",
    [parcel.pin, JSON.stringify(parcel.geometry)]
  );
}

/** Loads MiEnviro features into a named table with one VARCHAR column per
 * requested property (read off each feature's `properties`, missing values
 * become empty strings — callers only ever request properties they know are
 * present in the layer's schema). */
export async function loadMiEnviroFeatures(
  session: DuckDbSession,
  tableName: string,
  features: MiEnviroFeature[],
  propertyColumns: string[]
): Promise<void> {
  const colDefs = ["geom GEOMETRY", ...propertyColumns.map((c) => `"${c}" VARCHAR`)].join(
    ", "
  );
  await session.connection.run(`CREATE TABLE ${tableName} (${colDefs})`);
  for (const feature of features) {
    const geojson = JSON.stringify(feature.geometry);
    const values = propertyColumns.map((c) => String(feature.properties[c] ?? ""));
    const placeholders = values.map((_, i) => `$${i + 2}`).join(", ");
    const columnsClause = values.length > 0 ? `, ${placeholders}` : "";
    await session.connection.run(
      `INSERT INTO ${tableName} VALUES (ST_GeomFromGeoJSON($1::VARCHAR)${columnsClause})`,
      [geojson, ...values]
    );
  }
}

export async function loadSoilPolygons(
  session: DuckDbSession,
  polygons: ClippedSoilPolygon[]
): Promise<void> {
  await session.connection.run("CREATE TABLE soil_polygons (mukey VARCHAR, geom GEOMETRY)");
  for (const p of polygons) {
    await session.connection.run(
      "INSERT INTO soil_polygons VALUES ($1, ST_GeomFromText($2::VARCHAR))",
      [p.mukey, p.wkt]
    );
  }
}
