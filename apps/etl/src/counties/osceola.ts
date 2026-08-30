import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
  GeoJSONPolygon,
} from "./types.js";
import { toEsriRings, assertNoArcgisError, fetchAllEsriPages } from "./shared/esri-geometry.js";

const FEATURE_SERVER_URL =
  "https://services8.arcgis.com/FmKMwUEmDSC75SQm/arcgis/rest/services/OsceolaCountyParcels_view/FeatureServer/0/query";

/** Osceola PINs render canonically as "10-003-013-20", but the county's own
 * FeatureServer splits them into separate Twp/Sec/ID fields to query by. */
function parsePin(pin: string): { twp: string; sec: string; id: string } {
  const match = pin.match(/^(\d{2})-(\d{3})-(\d{3})-(\d{2})$/);
  if (!match) {
    throw new Error(`Osceola adapter: "${pin}" is not a valid NN-NNN-NNN-NN PIN`);
  }
  const [, twp, sec, idPart1, idPart2] = match;
  return { twp, sec, id: `${idPart1} ${idPart2}` };
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  const { twp, sec, id } = parsePin(pin);
  const where = `Twp='${twp}' AND Sec='${sec}' AND ID='${id}'`;
  const url =
    `${FEATURE_SERVER_URL}?where=${encodeURIComponent(where)}` +
    `&outFields=PIN,OWNER,PROPCLASS,UNIT,Shape__Area&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Osceola FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { features: RawParcelFeature[] };
  if (body.features.length === 0) {
    throw new Error(`Osceola adapter: no parcel found for PIN "${pin}"`);
  }
  return body.features[0];
}

export async function fetchParcelsIntersecting(
  polygon: GeoJSONPolygon
): Promise<RawParcelFeature[]> {
  // toEsriRings flattens a MultiPolygon (e.g. Pine River's buffer, whose
  // disjoint segments ST_Buffer doesn't merge into one blob -- live-verified
  // 2026-08-29) into the single flat `rings` array Esri's geometry model
  // expects; a plain Polygon passes through unchanged.
  const geometryParam = JSON.stringify({
    rings: toEsriRings(polygon),
    spatialReference: { wkid: 4326 },
  });

  async function fetchPage(
    resultOffset: number,
    resultRecordCount: number | undefined
  ): Promise<{ features: RawParcelFeature[]; exceededTransferLimit: boolean }> {
    const params: Record<string, string> = {
      geometry: geometryParam,
      geometryType: "esriGeometryPolygon",
      spatialRel: "esriSpatialRelIntersects",
      inSR: "4326",
      outFields: "PIN,OWNER,PROPCLASS,UNIT,Shape__Area",
      f: "geojson",
      resultOffset: String(resultOffset),
    };
    if (resultRecordCount !== undefined) {
      params.resultRecordCount = String(resultRecordCount);
    }
    const body = new URLSearchParams(params);
    // POST, not GET -- a real Blue Ribbon corridor buffer (a whole river's
    // segments within a county, 1000m buffer) produces a geometry parameter
    // far larger than a single parcel's, and embedding it in a GET query
    // string overflowed IIS's request-line limit ("400 Bad Request - Request
    // Too Long", live-verified 2026-08-29 against Middle Branch River). The
    // ArcGIS REST query endpoint accepts the identical parameter set as a
    // POST body instead.
    const res = await fetch(FEATURE_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new Error(
        `Osceola FeatureServer intersects request failed: ${res.status} ${res.statusText}`
      );
    }
    const responseBody = (await res.json()) as {
      features: RawParcelFeature[];
      properties?: { exceededTransferLimit?: boolean };
    };
    // ArcGIS can respond 200 with an error payload instead of a non-2xx
    // status (live-verified 2026-08-29) -- catch that before touching
    // .features, which would otherwise be undefined.
    assertNoArcgisError(responseBody, "Osceola FeatureServer intersects request");
    return {
      features: responseBody.features,
      exceededTransferLimit: responseBody.properties?.exceededTransferLimit === true,
    };
  }

  // Osceola's FeatureServer caps at maxRecordCount: 2000 -- a single 6-mile
  // stream already returns 839 real candidates, and Pine River (57 miles)
  // returns far more, so this must page through the full result set rather
  // than silently truncating at the server's cap.
  return fetchAllEsriPages(fetchPage);
}

export function normalize(raw: RawParcelFeature): NormalizedParcelRecord {
  const props = raw.properties;
  const rawPin = String(props.PIN); // e.g. "10 003 008 00"
  const pinMatch = rawPin.match(/^(\d{2})\s+(\d{3})\s+(\d{3})\s+(\d{2})$/);
  if (!pinMatch) {
    throw new Error(`Osceola adapter: cannot normalize PIN "${rawPin}"`);
  }
  const [, twp, sec, idPart1, idPart2] = pinMatch;
  const canonicalPin = `${twp}-${sec}-${idPart1}-${idPart2}`;

  const unit = String(props.UNIT ?? ""); // e.g. "MIDDLE BRANCH TOWNSHIP"
  const townshipRaw = unit.replace(/\s+TOWNSHIP$/i, "").trim();
  const township = townshipRaw
    .split(" ")
    .map((w) => (w.length > 0 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");

  const shapeAreaSqFt = Number(props.Shape__Area);
  const acres = shapeAreaSqFt / 43560;

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Osceola adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  return {
    pin: canonicalPin,
    county: "Osceola",
    township,
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const osceolaAdapter: CountyParcelAdapter = {
  county: "Osceola",
  fetchParcel,
  normalize,
  fetchParcelsIntersecting,
};
