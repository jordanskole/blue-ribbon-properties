import type { CardDef } from "@brp/schema";
import type { NormalizedParcelRecord } from "./counties/types.js";
import { fetchParcel } from "./fetch/parcels.js";
import {
  fetchColdStreams,
  fetchDesignatedTroutStreams,
  bboxFromGeometry,
} from "./fetch/mienviro.js";
import {
  ringToWkt,
  fetchClippedSoilPolygons,
  fetchComponents,
  fetchDwellingRating,
} from "./fetch/ssurgo.js";
import {
  openSpatialSession,
  closeSpatialSession,
  loadParcel,
  loadMiEnviroFeatures,
  loadSoilPolygons,
} from "./duckdb/load.js";
import {
  computeThermalClass,
  computeDesignatedTroutStream,
  computeSoilPolygonAreas,
  computeParcelAcres,
} from "./duckdb/compute.js";
import { summarizeSoil, deriveCard } from "./derive.js";

// ~0.01 deg is roughly 1.1 km at Michigan's latitude -- generous margin
// around the parcel bbox for the MiEnviro fetch; the precise test is the
// DuckDB ST_Intersects against the parcel's exact geometry, not this bbox.
const MIENVIRO_BBOX_BUFFER_DEG = 0.01;

export async function deriveCardForParcel(parcel: NormalizedParcelRecord): Promise<CardDef> {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const parcelWkt = ringToWkt(parcel.geometry.coordinates[0]);
  const bbox = bboxFromGeometry(parcel.geometry, MIENVIRO_BBOX_BUFFER_DEG);

  const [coldStreams, troutStreams, soilPolygons] = await Promise.all([
    fetchColdStreams(bbox),
    fetchDesignatedTroutStreams(bbox),
    fetchClippedSoilPolygons(parcelWkt),
  ]);

  const mukeys = [...new Set(soilPolygons.map((p) => p.mukey))];
  const components = await fetchComponents(mukeys);

  // Called once per candidate parcel from the batch runner, so an unclosed
  // session here compounds into many leaked in-memory DuckDB instances
  // across a real batch run -- see closeSpatialSession's doc comment.
  const session = await openSpatialSession();
  let thermalClass: string | null;
  let designatedTroutStream: boolean;
  let soilAreas: Awaited<ReturnType<typeof computeSoilPolygonAreas>>;
  let verifiedAcres: number;
  try {
    await loadParcel(session, parcel);
    await loadMiEnviroFeatures(session, "mienviro_1", coldStreams, ["TemperatureGradient"]);
    await loadMiEnviroFeatures(session, "mienviro_32", troutStreams, ["Designated"]);
    await loadSoilPolygons(session, soilPolygons);

    [thermalClass, designatedTroutStream, soilAreas, verifiedAcres] = await Promise.all([
      computeThermalClass(session),
      computeDesignatedTroutStream(session),
      computeSoilPolygonAreas(session),
      computeParcelAcres(session),
    ]);
  } finally {
    closeSpatialSession(session);
  }

  const { dominantDry } = summarizeSoil(soilAreas, components);
  const dominantDrySoilRating = dominantDry
    ? await fetchDwellingRating(dominantDry.cokey)
    : null;

  return deriveCard({
    // identity.acres must come from the same verified DuckDB area formula as
    // every other acreage on the card, not from the county FeatureServer's
    // own Shape__Area attribute (parcel.acres) -- see Finding 2.
    parcel: { ...parcel, acres: verifiedAcres },
    thermalClass,
    designatedTroutStream,
    soilAreas,
    components,
    dominantDrySoilRating,
    fetchedAt,
  });
}

export async function runParcelEtl(pin: string, county: string): Promise<CardDef> {
  const parcel = await fetchParcel(pin, county);
  return deriveCardForParcel(parcel);
}
