const MIENVIRO_BASE =
  "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer";

export interface MiEnviroFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

interface MiEnviroFeatureCollection {
  type: "FeatureCollection";
  features: MiEnviroFeature[];
}

export type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

async function queryLayer(
  layerId: number,
  bbox: BBox,
  outFields: string[]
): Promise<MiEnviroFeature[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url =
    `${MIENVIRO_BASE}/${layerId}/query?geometry=${minLon},${minLat},${maxLon},${maxLat}` +
    `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326` +
    `&outFields=${outFields.join(",")}&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `MiEnviro layer ${layerId} request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as MiEnviroFeatureCollection;
  return body.features;
}

/** Layer 1: Cold/Cold Transitional Streams. */
export function fetchColdStreams(bbox: BBox): Promise<MiEnviroFeature[]> {
  return queryLayer(1, bbox, ["NHSStreamName", "ReachCode", "TemperatureGradient"]);
}

/** Layer 32: Designated Trout Stream. */
export function fetchDesignatedTroutStreams(bbox: BBox): Promise<MiEnviroFeature[]> {
  return queryLayer(32, bbox, ["GNISName", "RegulationType", "Designated"]);
}

export function bboxFromGeometry(
  geometry: { coordinates: number[][][] },
  bufferDeg: number
): BBox {
  const coords = geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    Math.min(...lons) - bufferDeg,
    Math.min(...lats) - bufferDeg,
    Math.max(...lons) + bufferDeg,
    Math.max(...lats) + bufferDeg,
  ];
}
