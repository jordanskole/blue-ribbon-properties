import type { DuckDbSession } from "./load.js";
import type { CountyBoundary } from "../fetch/county-boundaries.js";

// Michigan GeoRef -- the CRS the state's own County/MinorCivilDivision/Township
// layers already report natively (verified: their query responses carry
// spatialReference {wkid: 102123, latestWkid: 3078}). ST_Buffer needs a metric,
// planar CRS; buffering raw WGS84 degrees would be wrong the same way computing
// area in raw degrees was, before this project's verified equirectangular fix.
const BUFFER_CRS = "EPSG:3078";

/** ST_Buffer's actual output shape -- NOT always a Polygon. When the input
 * stream geometry is a MultiLineString whose segments are far apart, buffer
 * doesn't merge them into one blob and ST_Buffer returns a MultiPolygon
 * instead (live-verified 2026-08-29: Osceola's own Pine River, one of only
 * 2 Blue Ribbon streams in Osceola county, resolves to 23 segments and
 * buffers to a MultiPolygon). Every caller of `bufferGeometry` must handle
 * both shapes -- see counties/shared/esri-geometry.ts's toEsriRings for how
 * the county adapters do. */
export type BufferGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export async function bufferGeometry(
  session: DuckDbSession,
  geometry: { type: string; coordinates: unknown },
  bufferMeters: number
): Promise<BufferGeometry> {
  const geojson = JSON.stringify(geometry);
  const reader = await session.connection.runAndReadAll(
    `
    WITH g AS (SELECT ST_GeomFromGeoJSON($1::VARCHAR) AS geom),
    proj AS (
      SELECT ST_Transform(geom, 'EPSG:4326', '${BUFFER_CRS}', always_xy := true) AS geom FROM g
    ),
    buffered AS (SELECT ST_Buffer(geom, ${bufferMeters}) AS geom FROM proj),
    back AS (
      SELECT ST_Transform(geom, '${BUFFER_CRS}', 'EPSG:4326', always_xy := true) AS geom FROM buffered
    )
    SELECT ST_AsGeoJSON(geom) AS geojson FROM back
  `,
    [geojson]
  );
  const rows = reader.getRowObjectsJS();
  const parsed: unknown = JSON.parse(String(rows[0].geojson));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("type" in parsed) ||
    (parsed.type !== "Polygon" && parsed.type !== "MultiPolygon")
  ) {
    throw new Error(
      `bufferGeometry: unexpected ST_Buffer output type "${
        typeof parsed === "object" && parsed !== null && "type" in parsed
          ? String((parsed as { type: unknown }).type)
          : typeof parsed
      }"`
    );
  }
  return parsed as BufferGeometry;
}

/** Loads the supplied county boundaries into a scratch table used by
 * `computeIntersectingCounties`. Call this once per DuckDB session (e.g.
 * once per batch run, not once per stream) -- county boundaries don't
 * change within a run, and reloading all ~67 Lower Peninsula counties on
 * every `computeIntersectingCounties` call (once per stream) was up to
 * ~5,600 redundant inserts across a full run. */
export async function loadCountiesForIntersectionCheck(
  session: DuckDbSession,
  counties: CountyBoundary[]
): Promise<void> {
  await session.connection.run(`CREATE OR REPLACE TABLE _county_check (name VARCHAR, geom GEOMETRY)`);
  for (const county of counties) {
    await session.connection.run(
      `INSERT INTO _county_check VALUES ($1, ST_GeomFromGeoJSON($2::VARCHAR))`,
      [county.name, JSON.stringify(county.geometry)]
    );
  }
}

/** Which of the counties loaded via `loadCountiesForIntersectionCheck` the
 * buffer polygon intersects -- used to report the "todo list" of counties
 * beyond the 3 with adapters today. Requires `loadCountiesForIntersectionCheck`
 * to have been called first on this session. */
export async function computeIntersectingCounties(
  session: DuckDbSession,
  bufferPolygon: BufferGeometry
): Promise<string[]> {
  const bufferGeojson = JSON.stringify(bufferPolygon);
  const reader = await session.connection.runAndReadAll(`
    SELECT name FROM _county_check
    WHERE ST_Intersects(geom, ST_GeomFromGeoJSON('${bufferGeojson}'))
    ORDER BY name
  `);
  const rows = reader.getRowObjectsJS();
  return rows.map((r) => String(r.name));
}
