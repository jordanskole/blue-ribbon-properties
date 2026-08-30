export type CountyBoundaryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface CountyBoundary {
  name: string;
  peninsula: "Lower" | "Upper";
  geometry: CountyBoundaryGeometry;
}

const COUNTY_FEATURESERVER_QUERY_URL =
  "https://services3.arcgis.com/dxRQUfTDNtfqZ301/arcgis/rest/services/County/FeatureServer/0/query";

interface CountyGeoJsonResponse {
  features: Array<{
    type: "Feature";
    properties: { Name: string; Peninsula: string };
    geometry: CountyBoundaryGeometry;
  }>;
}

export async function fetchLowerPeninsulaCounties(): Promise<CountyBoundary[]> {
  const url =
    `${COUNTY_FEATURESERVER_QUERY_URL}?f=geojson&where=${encodeURIComponent("Peninsula='Lower'").replace(/'/g, "%27")}` +
    `&outFields=Name,Peninsula&returnGeometry=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`County FeatureServer request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as CountyGeoJsonResponse;
  return body.features.map((f) => ({
    name: f.properties.Name,
    peninsula: f.properties.Peninsula as "Lower" | "Upper",
    // Preserve the API's real geometry type/coordinate nesting instead of
    // stamping a fixed "Polygon" -- several Lower Peninsula counties with
    // islands or multi-part shorelines (Alpena, Antrim, Arenac, Bay,
    // Charlevoix, Emmet, Grand Traverse, Huron, Leelanau, Monroe, Presque
    // Isle, Sanilac, Tuscola, Wayne, live-verified 2026-08-29) are genuinely
    // MultiPolygon; mislabeling them broke ST_GeomFromGeoJSON downstream.
    geometry: f.geometry,
  }));
}
