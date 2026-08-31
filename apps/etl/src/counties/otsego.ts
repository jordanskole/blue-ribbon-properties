import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
  GeoJSONPolygon,
} from "./types.js";
import { polygonCentroid, fetchTownship } from "./shared/township-lookup.js";
import {
  webMercatorToWgs84,
  toEsriRings,
  assertNoArcgisError,
  fetchAllEsriPages,
} from "./shared/esri-geometry.js";

const PROXY_BASE = "https://app.fetchgis.com/proxy/ags/proxy.ashx?";
const PARCEL_FEATURESERVER_QUERY_URL =
  "https://app.fetchgis.com/geoservices/fgis/otsParcels/FeatureServer/0/query";
// Same FetchGIS vendor/proxy as Iosco -- the proxy 403s without a Referer
// matching its own app; no other header is required.
const FETCHGIS_REFERER = "https://app.fetchgis.com/?currentMap=otsego";

interface EsriQueryResponse {
  features: Array<{
    attributes: Record<string, unknown>;
    geometry: { rings: number[][][] };
  }>;
  // Same top-level (not nested under .properties) shape as Iosco's f=json
  // proxy responses -- verified live 2026-08-30 against Otsego's own
  // FeatureServer via the same proxy.
  exceededTransferLimit?: boolean;
}

/** Otsego PINs render canonically as "045-000-001-001-00" -- the same
 * 5-segment NNN-NNN-NNN-NNN-NN shape as Iosco's, verified live against
 * several real sampled parcels ("010-003-200-005-05", "045-000-001-001-00",
 * etc., 2026-08-30). The FeatureServer's own `parcelid` field (not "TaxID"
 * -- Otsego's schema uses a different field name than Iosco's, even though
 * the two share the same FetchGIS hosting) already matches this canonical
 * form, so no reformatting is needed. */
function assertValidPin(pin: string): void {
  if (!/^\d{3}-\d{3}-\d{3}-\d{3}-\d{2}$/.test(pin)) {
    throw new Error(`Otsego adapter: "${pin}" is not a valid NNN-NNN-NNN-NNN-NN PIN`);
  }
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  assertValidPin(pin);
  const innerQuery =
    `f=json&where=${encodeURIComponent(`parcelid = '${pin}'`)}` +
    `&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=parcelid,Shape_Area`;
  const url = `${PROXY_BASE}${PARCEL_FEATURESERVER_QUERY_URL}?${innerQuery}`;
  const res = await fetch(url, { headers: { Referer: FETCHGIS_REFERER } });
  if (!res.ok) {
    throw new Error(
      `Otsego FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as EsriQueryResponse;
  assertNoArcgisError(body, "Otsego FeatureServer request");
  if (body.features.length === 0) {
    throw new Error(`Otsego adapter: no parcel found for PIN "${pin}"`);
  }
  const feature = body.features[0];
  const ringWgs84 = feature.geometry.rings[0].map(
    ([x, y]) => webMercatorToWgs84(x, y)
  ) as [number, number][];
  const [centroidLng, centroidLat] = polygonCentroid(ringWgs84);
  const township = await fetchTownship(centroidLng, centroidLat);

  return {
    properties: {
      parcelid: feature.attributes.parcelid,
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
  const geometryParam = JSON.stringify({
    rings: toEsriRings(polygon),
    spatialReference: { wkid: 4326 },
  });

  async function fetchPage(
    resultOffset: number,
    resultRecordCount: number | undefined
  ): Promise<{ features: EsriQueryResponse["features"]; exceededTransferLimit: boolean }> {
    const params: Record<string, string> = {
      f: "json",
      geometry: geometryParam,
      geometryType: "esriGeometryPolygon",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "parcelid,Shape_Area",
      resultOffset: String(resultOffset),
    };
    if (resultRecordCount !== undefined) {
      params.resultRecordCount = String(resultRecordCount);
    }
    // POST, not GET -- same fix as Osceola/Roscommon's identical pattern: a
    // real corridor buffer's geometry parameter overflows a GET URL's length
    // limit (live-verified 2026-08-31 against this exact proxy+FeatureServer:
    // a full-run Otsego stream buffer produced "414 Request-URI Too Long"
    // through the FetchGIS proxy). The proxy forwards a POST body to the
    // target URL just like it forwards GET query params -- live-verified
    // 2026-08-31 with a small test polygon before relying on it here.
    const url = `${PROXY_BASE}${PARCEL_FEATURESERVER_QUERY_URL}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: FETCHGIS_REFERER,
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Otsego FeatureServer intersects request failed: ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json()) as EsriQueryResponse;
    assertNoArcgisError(body, "Otsego FeatureServer intersects request");
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
        parcelid: feature.attributes.parcelid,
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
  const pin = String(props.parcelid);
  assertValidPin(pin);

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Otsego adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  // Verified live 2026-08-30: Shape_Area is already in square feet (matches
  // the layer's own precomputed AtlasAcres field to within 0.2%), not
  // Web-Mercator square meters -- unlike some other FetchGIS-hosted layers.
  const shapeAreaSqFt = Number(props.Shape_Area);
  const acres = shapeAreaSqFt / 43560;

  return {
    pin,
    county: "Otsego",
    township: String(props.township),
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const otsegoAdapter: CountyParcelAdapter = {
  county: "Otsego",
  fetchParcel,
  normalize,
  fetchParcelsIntersecting,
};
