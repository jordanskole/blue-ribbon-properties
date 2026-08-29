import type { DuckDbSession } from "./load.js";
import type { CountyBoundary } from "../fetch/county-boundaries.js";

// Michigan GeoRef -- the CRS the state's own County/MinorCivilDivision/Township
// layers already report natively (verified: their query responses carry
// spatialReference {wkid: 102123, latestWkid: 3078}). ST_Buffer needs a metric,
// planar CRS; buffering raw WGS84 degrees would be wrong the same way computing
// area in raw degrees was, before this project's verified equirectangular fix.
const BUFFER_CRS = "EPSG:3078";

export async function bufferGeometry(
  session: DuckDbSession,
  geometry: { type: string; coordinates: unknown },
  bufferMeters: number
): Promise<{ type: "Polygon"; coordinates: number[][][] }> {
  const geojson = JSON.stringify(geometry);
  const reader = await session.connection.runAndReadAll(`
    WITH g AS (SELECT ST_GeomFromGeoJSON('${geojson}') AS geom),
    proj AS (
      SELECT ST_Transform(geom, 'EPSG:4326', '${BUFFER_CRS}', always_xy := true) AS geom FROM g
    ),
    buffered AS (SELECT ST_Buffer(geom, ${bufferMeters}) AS geom FROM proj),
    back AS (
      SELECT ST_Transform(geom, '${BUFFER_CRS}', 'EPSG:4326', always_xy := true) AS geom FROM buffered
    )
    SELECT ST_AsGeoJSON(geom) AS geojson FROM back
  `);
  const rows = reader.getRowObjectsJS();
  return JSON.parse(String(rows[0].geojson));
}

/** Which of the supplied county boundaries the buffer polygon intersects --
 * used to report the "todo list" of counties beyond the 3 with adapters today. */
export async function computeIntersectingCounties(
  session: DuckDbSession,
  bufferPolygon: { type: "Polygon"; coordinates: number[][][] },
  counties: CountyBoundary[]
): Promise<string[]> {
  await session.connection.run(`CREATE OR REPLACE TABLE _county_check (name VARCHAR, geom GEOMETRY)`);
  for (const county of counties) {
    await session.connection.run(
      `INSERT INTO _county_check VALUES ($1, ST_GeomFromGeoJSON($2::VARCHAR))`,
      [county.name, JSON.stringify(county.geometry)]
    );
  }
  const bufferGeojson = JSON.stringify(bufferPolygon);
  const reader = await session.connection.runAndReadAll(`
    SELECT name FROM _county_check
    WHERE ST_Intersects(geom, ST_GeomFromGeoJSON('${bufferGeojson}'))
    ORDER BY name
  `);
  const rows = reader.getRowObjectsJS();
  return rows.map((r) => String(r.name));
}
