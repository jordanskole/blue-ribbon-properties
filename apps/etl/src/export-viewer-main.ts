import { openStore, exportParquet, closeStore } from "./duckdb/store.js";
import { copyParquet, writeManifest } from "./export-viewer-data.js";
import { BLUE_RIBBON_STREAMS_LP, type BlueRibbonStreamRecord } from "./data/blue-ribbon-streams.js";
import { fetchLowerPeninsulaCounties } from "./fetch/county-boundaries.js";
import { resolveStreamGeometry } from "./fetch/blue-ribbon-geometry.js";

const ADAPTED_COUNTIES = ["Osceola", "Iosco", "Roscommon", "Otsego", "Manistee"];
const STORE_DUCKDB_PATH = "./store/blue-ribbon-corridor.duckdb";
const STORE_PARQUET_PATH = "./store/blue-ribbon-corridor.parquet";
const OUT_DIR = "../viewer/public/data";

/** Streams whose `counties` list includes at least one currently-adapted
 * county — the same subset the batch runner itself would touch, so the
 * map's reference layer never shows a stream with no candidate parcels. */
export function selectStreamsForCounties(
  streams: BlueRibbonStreamRecord[],
  counties: string[]
): BlueRibbonStreamRecord[] {
  return streams.filter((s) => s.counties.some((c) => counties.includes(c)));
}

async function writeStreamsGeoJSON(): Promise<void> {
  const lpCounties = await fetchLowerPeninsulaCounties();
  const relevant = selectStreamsForCounties(BLUE_RIBBON_STREAMS_LP, ADAPTED_COUNTIES);

  const features = [];
  for (const record of relevant) {
    const resolved = await resolveStreamGeometry(record, lpCounties);
    if (resolved === null) continue;
    features.push({
      type: "Feature" as const,
      properties: { name: record.name, counties: record.counties },
      geometry: resolved.geometry,
    });
  }

  const featureCollection = { type: "FeatureCollection" as const, features };
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "streams.geojson"), JSON.stringify(featureCollection));
}

async function main(): Promise<void> {
  const store = await openStore(STORE_DUCKDB_PATH);
  let cardCount: number;
  let counties: string[];
  try {
    await exportParquet(store, STORE_PARQUET_PATH);
    const countReader = await store.connection.runAndReadAll("SELECT COUNT(*) AS n FROM cards");
    cardCount = Number(countReader.getRowObjectsJS()[0].n);
    const countyReader = await store.connection.runAndReadAll(
      "SELECT DISTINCT county FROM cards ORDER BY county"
    );
    counties = countyReader.getRowObjectsJS().map((r) => String(r.county));
  } finally {
    closeStore(store);
  }

  copyParquet(STORE_PARQUET_PATH, OUT_DIR);
  await writeManifest(cardCount, counties, OUT_DIR);
  await writeStreamsGeoJSON();

  console.log(`Exported ${cardCount} cards across ${counties.join(", ")} to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
