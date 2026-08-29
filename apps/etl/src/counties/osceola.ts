import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
} from "./types.js";

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
};
