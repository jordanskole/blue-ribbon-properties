// Michigan's statewide Minor Civil Division (city/township) layer -- used by
// any county adapter whose own parcel data has no reliable township field.
// Verified live to correctly resolve Iosco's target parcel (no township
// field at all) and to correctly disambiguate a real duplicate-ID bug found
// in Roscommon's own Township layer (its ID field maps 11 to both
// "Roscommon Township" and "Nester Township" -- a point-in-polygon query
// against this statewide layer isn't affected by that county-local bug).
const MCD_QUERY_URL =
  "https://services3.arcgis.com/dxRQUfTDNtfqZ301/arcgis/rest/services/MinorCivilDivision/FeatureServer/6/query";

interface EsriQueryResponse {
  features: Array<{ attributes: Record<string, unknown> }>;
}

/** Shoelace-formula polygon centroid (area-weighted, not a naive vertex
 * average). Verified against DuckDB's ST_Centroid to sub-meter agreement.
 * Used only to find a point inside a parcel for the MCD township lookup. */
export function polygonCentroid(ring: [number, number][]): [lng: number, lat: number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

export async function fetchTownship(lng: number, lat: number): Promise<string> {
  const url =
    `${MCD_QUERY_URL}?f=json&geometry=${lng},${lat}&geometryType=esriGeometryPoint` +
    `&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Name&returnGeometry=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `MinorCivilDivision request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as EsriQueryResponse;
  if (body.features.length === 0) {
    throw new Error(`No Minor Civil Division found at (${lng}, ${lat})`);
  }
  return String(body.features[0].attributes.Name);
}
