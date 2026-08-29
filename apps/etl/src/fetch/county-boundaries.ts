export interface CountyBoundary {
  name: string;
  peninsula: "Lower" | "Upper";
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

const COUNTY_FEATURESERVER_QUERY_URL =
  "https://services3.arcgis.com/dxRQUfTDNtfqZ301/arcgis/rest/services/County/FeatureServer/0/query";

interface CountyGeoJsonResponse {
  features: Array<{
    type: "Feature";
    properties: { Name: string; Peninsula: string };
    geometry: { type: string; coordinates: number[][][] };
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
    geometry: { type: "Polygon", coordinates: f.geometry.coordinates },
  }));
}
