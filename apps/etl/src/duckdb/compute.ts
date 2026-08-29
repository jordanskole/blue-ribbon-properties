import type { DuckDbSession } from "./load.js";

const METERS_PER_DEGREE = 111320.0;
const SQUARE_METERS_PER_ACRE = 4046.8564224;

/** The verified area formula (see the design spec, decision 1) — NOT
 * ST_Area_Spheroid or an ST_Transform-based area, both proven wrong by ~8.4x
 * at this latitude during spec verification. Raw planar shoelace area in
 * degree^2, times meters-per-degree^2 at the equator, times a per-row
 * cos(centroid latitude) longitude-compression correction, divided by m^2
 * per acre. Valid at parcel scale (a few acres, sub-degree extent). */
const AREA_ACRES_SQL = `ST_Area(geom) * POWER(${METERS_PER_DEGREE}, 2) * COS(RADIANS(ST_Y(ST_Centroid(geom)))) / ${SQUARE_METERS_PER_ACRE}`;

export async function computeThermalClass(
  session: DuckDbSession
): Promise<string | null> {
  const reader = await session.connection.runAndReadAll(`
    SELECT m."TemperatureGradient" AS temperature_gradient
    FROM mienviro_1 m, parcel p
    WHERE ST_Intersects(m.geom, p.geom)
    LIMIT 1
  `);
  const rows = reader.getRowObjectsJS();
  return rows.length > 0 ? String(rows[0].temperature_gradient) : null;
}

export async function computeDesignatedTroutStream(
  session: DuckDbSession
): Promise<boolean> {
  const reader = await session.connection.runAndReadAll(`
    SELECT COUNT(*) AS n
    FROM mienviro_32 m, parcel p
    WHERE ST_Intersects(m.geom, p.geom) AND m."Designated" = '1'
  `);
  const rows = reader.getRowObjectsJS();
  return Number(rows[0].n) > 0;
}

export interface SoilPolygonArea {
  mukey: string;
  acres: number;
}

export async function computeSoilPolygonAreas(
  session: DuckDbSession
): Promise<SoilPolygonArea[]> {
  const reader = await session.connection.runAndReadAll(`
    SELECT mukey, ${AREA_ACRES_SQL} AS acres
    FROM soil_polygons
  `);
  const rows = reader.getRowObjectsJS();
  return rows.map((r) => ({ mukey: String(r.mukey), acres: Number(r.acres) }));
}
