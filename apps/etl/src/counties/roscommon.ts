import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
} from "./types.js";
import { polygonCentroid, fetchTownship } from "./shared/township-lookup.js";

// The live/visible parcel layer in the county's own webmap -- verified
// against a second, hidden "2027_Parcel_Layer2026826" layer with identical
// geometry/PIN/Township but fewer attribute fields, which is not referenced
// as visible anywhere in the county's published map. Unlike Iosco, this is
// a standard ArcGIS-Online-hosted FeatureServer: no proxy, no special
// headers, f=geojson works and returns full-precision WGS84 directly.
const PARCEL_FEATURESERVER_QUERY_URL =
  "https://services3.arcgis.com/rAGekBpQuVeYptc1/arcgis/rest/services/2027_Parcel_Layer2026515/FeatureServer/0/query";

interface GeoJsonFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

/** Roscommon PINs render canonically as "011-430-045-0000" -- 4 groups like
 * Osceola, but the last group is 4 digits, not 2 -- verified across 15
 * sampled real parcels, not a one-off. */
function assertValidPin(pin: string): void {
  if (!/^\d{3}-\d{3}-\d{3}-\d{4}$/.test(pin)) {
    throw new Error(`Roscommon adapter: "${pin}" is not a valid NNN-NNN-NNN-NNNN PIN`);
  }
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  assertValidPin(pin);
  const url =
    `${PARCEL_FEATURESERVER_QUERY_URL}?f=geojson&where=${encodeURIComponent(`PIN='${pin}'`)}` +
    `&outFields=PIN,Shape__Area&returnGeometry=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Roscommon FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as GeoJsonFeatureCollection;
  if (body.features.length === 0) {
    throw new Error(`Roscommon adapter: no parcel found for PIN "${pin}"`);
  }
  const feature = body.features[0];
  if (feature.geometry.type !== "Polygon") {
    throw new Error(
      `Roscommon adapter: expected Polygon geometry, got "${feature.geometry.type}"`
    );
  }
  // Already WGS84 -- this FeatureServer's f=geojson output needs no
  // reprojection, unlike Iosco's. Roscommon's own Township field is a
  // county-internal ID with a verified duplicate-mapping bug (ID 11 means
  // both "Roscommon Township" and "Nester Township" in its own Township
  // layer), so township comes from the same statewide MCD lookup as Iosco.
  const ring = (feature.geometry.coordinates as number[][][])[0] as [number, number][];
  const [centroidLng, centroidLat] = polygonCentroid(ring);
  const township = await fetchTownship(centroidLng, centroidLat);

  return {
    properties: {
      PIN: feature.properties.PIN,
      Shape__Area: feature.properties.Shape__Area,
      township,
    },
    geometry: feature.geometry as RawParcelFeature["geometry"],
  };
}

export function normalize(raw: RawParcelFeature): NormalizedParcelRecord {
  const props = raw.properties;
  const pin = String(props.PIN);
  assertValidPin(pin);

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Roscommon adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  // Roscommon's own Acres field is an integer (truncates small parcels to
  // 0), so this uses Shape__Area (sq meters, in the Web Mercator SR the
  // FeatureServer stores it in -- not latitude-corrected) instead. Either
  // way this is a rough passthrough only: index.ts overwrites identity.acres
  // with the DuckDB-verified formula downstream, same as the other adapters.
  const acres = Number(props.Shape__Area) / 4046.8564224;

  return {
    pin,
    county: "Roscommon",
    township: String(props.township),
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const roscommonAdapter: CountyParcelAdapter = {
  county: "Roscommon",
  fetchParcel,
  normalize,
};
