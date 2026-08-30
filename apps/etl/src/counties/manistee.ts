import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
  GeoJSONPolygon,
} from "./types.js";
import { polygonCentroid, fetchTownship } from "./shared/township-lookup.js";
import { toEsriRings, assertNoArcgisError, fetchAllEsriPages } from "./shared/esri-geometry.js";

// A standard ArcGIS-Online-hosted FeatureServer -- same shape as Osceola and
// Roscommon: no proxy, no special headers, f=geojson works and returns
// full-precision WGS84 directly (native storage SR is Web Mercator, but the
// server reprojects on the way out). Found via the county's own published
// "Manistee County Parcel Search" ArcGIS Experience Builder app.
const PARCEL_FEATURESERVER_QUERY_URL =
  "https://services5.arcgis.com/QwUGi3frbpIwhPdx/arcgis/rest/services/6_16_26_BSA_Parcels_legals/FeatureServer/0/query";

interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

/** Manistee PINs render canonically as "03-021-002-10" -- the layer's own
 * BSA_PIN field (sourced from BS&A, the county's assessor software) already
 * matches this shape, verified against several real sampled parcels
 * ("01-400-026-00", "03-016-015-00", "03-021-002-10", 2026-08-30). */
function assertValidPin(pin: string): void {
  if (!/^\d{2}-\d{3}-\d{3}-\d{2}$/.test(pin)) {
    throw new Error(`Manistee adapter: "${pin}" is not a valid NN-NNN-NNN-NN PIN`);
  }
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  assertValidPin(pin);
  const url =
    `${PARCEL_FEATURESERVER_QUERY_URL}?f=geojson&where=${encodeURIComponent(`BSA_PIN='${pin}'`)}` +
    `&outFields=BSA_PIN,ACRES&returnGeometry=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Manistee FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as GeoJsonFeatureCollection;
  if (body.features.length === 0) {
    throw new Error(`Manistee adapter: no parcel found for PIN "${pin}"`);
  }
  const feature = body.features[0];
  if (feature.geometry.type !== "Polygon") {
    throw new Error(
      `Manistee adapter: expected Polygon geometry, got "${feature.geometry.type}"`
    );
  }
  // No per-parcel township field on this layer -- same gap as Iosco and
  // Roscommon, same fix: the statewide MinorCivilDivision spatial join.
  const ring = (feature.geometry.coordinates as number[][][])[0] as [number, number][];
  const [centroidLng, centroidLat] = polygonCentroid(ring);
  const township = await fetchTownship(centroidLng, centroidLat);

  return {
    properties: {
      BSA_PIN: feature.properties.BSA_PIN,
      ACRES: feature.properties.ACRES,
      township,
    },
    geometry: feature.geometry as RawParcelFeature["geometry"],
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
  ): Promise<{ features: GeoJsonFeature[]; exceededTransferLimit: boolean }> {
    const params: Record<string, string> = {
      f: "geojson",
      geometry: geometryParam,
      geometryType: "esriGeometryPolygon",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "BSA_PIN,ACRES",
      resultOffset: String(resultOffset),
    };
    if (resultRecordCount !== undefined) {
      params.resultRecordCount = String(resultRecordCount);
    }
    const requestBody = new URLSearchParams(params);
    // POST, not GET -- same fix as Osceola/Roscommon's identical
    // ArcGIS-Online-hosted shape: a real corridor buffer's geometry
    // parameter overflows a GET URL's length limit.
    const res = await fetch(PARCEL_FEATURESERVER_QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: requestBody.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Manistee FeatureServer intersects request failed: ${res.status} ${res.statusText}`
      );
    }
    const body = (await res.json()) as GeoJsonFeatureCollection & {
      properties?: { exceededTransferLimit?: boolean };
    };
    assertNoArcgisError(body, "Manistee FeatureServer intersects request");
    return {
      features: body.features,
      exceededTransferLimit: body.properties?.exceededTransferLimit === true,
    };
  }

  const rawFeatures = await fetchAllEsriPages(fetchPage);
  const results: RawParcelFeature[] = [];
  for (const feature of rawFeatures) {
    if (feature.geometry.type !== "Polygon") continue;
    const ring = (feature.geometry.coordinates as number[][][])[0] as [number, number][];
    const [centroidLng, centroidLat] = polygonCentroid(ring);
    const township = await fetchTownship(centroidLng, centroidLat);
    results.push({
      properties: {
        BSA_PIN: feature.properties.BSA_PIN,
        ACRES: feature.properties.ACRES,
        township,
      },
      geometry: feature.geometry as RawParcelFeature["geometry"],
    });
  }
  return results;
}

export function normalize(raw: RawParcelFeature): NormalizedParcelRecord {
  const props = raw.properties;
  const pin = String(props.BSA_PIN);
  assertValidPin(pin);

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Manistee adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  // Use the layer's own precomputed ACRES field directly. Live-verified
  // 2026-08-30 against PIN "03-016-015-00": Shape__Area (native Web Mercator
  // sq meters, not latitude-corrected) / 4046.8564224 gives ~19.0 acres --
  // nearly 2x the real 9.73-acre value in ACRES, consistent with Web
  // Mercator's area-inflation factor at Michigan's ~44N latitude
  // (1/cos^2(44 deg) ~= 1.93). ACRES is the trustworthy field here, unlike
  // Roscommon where no such precomputed field existed.
  const acres = Number(props.ACRES);

  return {
    pin,
    county: "Manistee",
    township: String(props.township),
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const manisteeAdapter: CountyParcelAdapter = {
  county: "Manistee",
  fetchParcel,
  normalize,
  fetchParcelsIntersecting,
};
