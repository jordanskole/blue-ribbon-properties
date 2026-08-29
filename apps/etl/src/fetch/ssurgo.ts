const SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

export interface ClippedSoilPolygon {
  mukey: string;
  wkt: string;
}

export interface ComponentInfo {
  mukey: string;
  compname: string;
  comppct_r: number;
  drainagecl: string | null;
  wtdepannmin: number | null;
  cokey: string;
}

async function sdaQuery(query: string): Promise<string[][]> {
  const res = await fetch(SDA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, format: "JSON" }),
  });
  if (!res.ok) {
    throw new Error(`SDA request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { Table?: string[][] };
  return body.Table ?? [];
}

/** Converts a GeoJSON polygon ring to WKT POLYGON text. */
export function ringToWkt(ring: number[][]): string {
  const points = ring.map(([lon, lat]) => `${lon} ${lat}`).join(",");
  return `POLYGON((${points}))`;
}

/** SDA's own server-side clip — used to scope what gets fetched, not to
 * compute area. Returns clipped soil-polygon geometry per mukey/segment;
 * DuckDB (duckdb/compute.ts) computes the actual acreage. */
export async function fetchClippedSoilPolygons(
  parcelWkt: string
): Promise<ClippedSoilPolygon[]> {
  const escapedWkt = parcelWkt.replace(/'/g, "''");
  const query = `
WITH geom_data (geom, mukey) AS (
  SELECT mupolygongeo.STIntersection(geometry::STGeomFromText('${escapedWkt}', 4326)) AS geom, mukey
  FROM mupolygon
  WHERE mupolygongeo.STIntersects(geometry::STGeomFromText('${escapedWkt}', 4326)) = 1
)
SELECT mukey, geom.STAsText() AS wkt
FROM geom_data
`;
  const rows = await sdaQuery(query);
  return rows.map(([mukey, wkt]) => ({ mukey, wkt }));
}

export async function fetchComponents(mukeys: string[]): Promise<ComponentInfo[]> {
  if (mukeys.length === 0) return [];
  const mukeyList = mukeys.map((m) => `'${m}'`).join(",");
  const query = `
SELECT c.mukey, c.compname, c.comppct_r, c.drainagecl, m.wtdepannmin, c.cokey
FROM component c
LEFT JOIN muaggatt m ON m.mukey = c.mukey
WHERE c.mukey IN (${mukeyList}) AND c.majcompflag = 'Yes'
`;
  const rows = await sdaQuery(query);
  return rows.map(([mukey, compname, comppct_r, drainagecl, wtdepannmin, cokey]) => ({
    mukey,
    compname,
    comppct_r: Number(comppct_r),
    drainagecl: drainagecl || null,
    wtdepannmin: wtdepannmin ? Number(wtdepannmin) : null,
    cokey,
  }));
}

/** The interpretation rating for "dwellings without basements" — 'ruledepth = 0'
 * selects the top-level rating row and excludes the sub-rule "reason" rows
 * (e.g. "Depth to saturated zone") that share the same mrulename. */
export async function fetchDwellingRating(cokey: string): Promise<string | null> {
  const query = `
SELECT interphrc
FROM cointerp
WHERE cokey = '${cokey}' AND mrulename = 'ENG - Dwellings W/O Basements' AND ruledepth = 0
`;
  const rows = await sdaQuery(query);
  return rows.length > 0 ? rows[0][0] : null;
}
