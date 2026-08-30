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

/** Accepts a Polygon's rings (`coordinates: number[][][]`) or a MultiPolygon's
 * per-polygon ring lists (`coordinates: number[][][][]`) -- callers include
 * county boundaries (Task 2), which can legitimately be either shape. Every
 * ring (including interior holes) is folded into the same min/max scan; holes
 * are always contained within their polygon's exterior ring, so including
 * them can't widen the bbox -- it just avoids having to pick out ring 0 of
 * each polygon separately. */
export function bboxFromGeometry(
  geometry: { type: string; coordinates: unknown },
  bufferDeg: number
): BBox {
  const rings: number[][][] =
    geometry.type === "MultiPolygon"
      ? (geometry.coordinates as number[][][][]).flat()
      : (geometry.coordinates as number[][][]);

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return [minLon - bufferDeg, minLat - bufferDeg, maxLon + bufferDeg, maxLat + bufferDeg];
}
