import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
  GeoJSONPolygon,
} from "./types.js";
import { polygonCentroid, fetchTownship } from "./shared/township-lookup.js";
import { toEsriRings, assertNoArcgisError, fetchAllEsriPages } from "./shared/esri-geometry.js";

const PROXY_BASE = "https://app.fetchgis.com/proxy/ags/proxy.ashx?";
const PARCEL_FEATURESERVER_QUERY_URL =
  "https://app.fetchgis.com/geoservices/fgis/iosParcels/FeatureServer/0/query";
// The FetchGIS proxy 403s without a Referer matching its own app -- verified
// live; no other header is required.
const FETCHGIS_REFERER = "https://app.fetchgis.com/?currentMap=iosco";

interface EsriQueryResponse {
  features: Array<{
    attributes: Record<string, unknown>;
    geometry: { rings: number[][][] };
  }>;
  // Unlike Osceola/Roscommon's f=geojson responses (where this flag lives
  // nested at body.properties.exceededTransferLimit), Iosco's proxy is
  // queried with f=json and carries the flag at the top level -- verified
  // live 2026-08-29 against the FetchGIS proxy endpoint.
  exceededTransferLimit?: boolean;
}

/** Iosco PINs render canonically as "062-026-300-020-00" -- 5 segments,
 * unlike Osceola's 4-segment "10-003-013-20". The FeatureServer's TaxID
 * field already matches this canonical form, so no reformatting is needed
 * (unlike Osceola's space-separated raw PIN). */
function assertValidPin(pin: string): void {
  if (!/^\d{3}-\d{3}-\d{3}-\d{3}-\d{2}$/.test(pin)) {
    throw new Error(`Iosco adapter: "${pin}" is not a valid NNN-NNN-NNN-NNN-NN PIN`);
  }
}

/** Exact closed-form Web Mercator (EPSG:3857) -> WGS84 (EPSG:4326) conversion.
 * Verified bit-for-bit against DuckDB's ST_Transform. Used instead of the
 * FeatureServer's own outSR=4326 conversion, which truncates every
 * coordinate to 2 decimal degrees (~1km error) -- verified reproducible
 * across geometryPrecision values 2/6/10/15, so that param has no effect
 * on this service. Iosco's FeatureServer also doesn't support f=geojson
 * (older ArcGIS Server than Osceola's), so this conversion always runs. */
export function webMercatorToWgs84(x: number, y: number): [lng: number, lat: number] {
  const R = 6378137.0;
  const lng = (x / R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
  return [lng, lat];
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  assertValidPin(pin);
  const innerQuery =
    `f=json&where=${encodeURIComponent(`"TaxID" = '${pin}'`)}` +
    `&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=TaxID,Shape_Area`;
  const url = `${PROXY_BASE}${PARCEL_FEATURESERVER_QUERY_URL}?${innerQuery}`;
  const res = await fetch(url, { headers: { Referer: FETCHGIS_REFERER } });
  if (!res.ok) {
    throw new Error(
      `Iosco FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as EsriQueryResponse;
  if (body.features.length === 0) {
    throw new Error(`Iosco adapter: no parcel found for PIN "${pin}"`);
  }
  const feature = body.features[0];
  const ringWgs84 = feature.geometry.rings[0].map(
    ([x, y]) => webMercatorToWgs84(x, y)
  ) as [number, number][];
  const [centroidLng, centroidLat] = polygonCentroid(ringWgs84);
  const township = await fetchTownship(centroidLng, centroidLat);

  return {
    properties: {
      TaxID: feature.attributes.TaxID,
      Shape_Area: feature.attributes.Shape_Area,
      township,
    },
    geometry: {
      type: "Polygon",
      coordinates: [ringWgs84],
    },
  };
}

export async function fetchParcelsIntersecting(
  polygon: GeoJSONPolygon
): Promise<RawParcelFeature[]> {
  // toEsriRings flattens a MultiPolygon buffer (see Osceola's identical
  // fix) into the single flat `rings` array Esri's geometry model expects.
  const geometryParam = JSON.stringify({
    rings: toEsriRings(polygon),
    spatialReference: { wkid: 4326 },
  });

  async function fetchPage(
    resultOffset: number,
    resultRecordCount: number | undefined
  ): Promise<{ features: EsriQueryResponse["features"]; exceededTransferLimit: boolean }> {
    let innerQuery =
      `f=json&geometry=${encodeURIComponent(geometryParam)}&geometryType=esriGeometryPolygon` +
      `&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=TaxID,Shape_Area` +
      `&resultOffset=${resultOffset}`;
    if (resultRecordCount !== undefined) {
      innerQuery += `&resultRecordCount=${resultRecordCount}`;
    }
    const url = `${PROXY_BASE}${PARCEL_FEATURESERVER_QUERY_URL}?${innerQuery}`;
    const res = await fetch(url, { headers: { Referer: FETCHGIS_REFERER } });
    if (!res.ok) {
      throw new Error(
        `Iosco FeatureServer intersects request failed: ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json()) as EsriQueryResponse;
    // ArcGIS can respond 200 with an error payload instead of a non-2xx
    // status -- catch that before touching .features.
    assertNoArcgisError(body, "Iosco FeatureServer intersects request");
    return {
      features: body.features,
      exceededTransferLimit: body.exceededTransferLimit === true,
    };
  }

  const rawFeatures = await fetchAllEsriPages(fetchPage);
  const results: RawParcelFeature[] = [];
  for (const feature of rawFeatures) {
    const ringWgs84 = feature.geometry.rings[0].map(([x, y]) => webMercatorToWgs84(x, y)) as [
      number,
      number,
    ][];
    const [centroidLng, centroidLat] = polygonCentroid(ringWgs84);
    const township = await fetchTownship(centroidLng, centroidLat);
    results.push({
      properties: {
        TaxID: feature.attributes.TaxID,
        Shape_Area: feature.attributes.Shape_Area,
        township,
      },
      geometry: { type: "Polygon", coordinates: [ringWgs84] },
    });
  }
  return results;
}

export function normalize(raw: RawParcelFeature): NormalizedParcelRecord {
  const props = raw.properties;
  const pin = String(props.TaxID);
  assertValidPin(pin);

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Iosco adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  const shapeAreaSqFt = Number(props.Shape_Area);
  const acres = shapeAreaSqFt / 43560;

  return {
    pin,
    county: "Iosco",
    township: String(props.township),
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const ioscoAdapter: CountyParcelAdapter = {
  county: "Iosco",
  fetchParcel,
  normalize,
  fetchParcelsIntersecting,
};
