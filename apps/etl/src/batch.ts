import type { CardDef } from "@brp/schema";
import { BLUE_RIBBON_STREAMS_LP } from "./data/blue-ribbon-streams.js";
import { fetchLowerPeninsulaCounties } from "./fetch/county-boundaries.js";
import { resolveStreamGeometry } from "./fetch/blue-ribbon-geometry.js";
import { openSpatialSession } from "./duckdb/load.js";
import { bufferGeometry, computeIntersectingCounties } from "./duckdb/buffer.js";
import { getCountyAdapter } from "./counties/registry.js";
import { deriveCardForParcel } from "./index.js";
import { openStore, hasCard, insertCard, exportParquet } from "./duckdb/store.js";

const BUFFER_METERS = 1000;
const CORRIDOR_COUNTIES = ["Osceola", "Iosco", "Roscommon"];

export interface BlueRibbonBatchOptions {
  /** Restrict to these counties (default: all 3 corridor counties). */
  counties?: string[];
  /** Restrict to Blue Ribbon stream records with this exact `name` (default: all). */
  streamNames?: string[];
}

export interface BatchSummary {
  candidatesFound: number;
  cardsWritten: number;
  cardsSkipped: number;
  failures: Array<{ pin: string; county: string; error: string }>;
  additionalCountiesFound: string[];
}

export async function runBlueRibbonCorridorBatch(
  storePath: string,
  options: BlueRibbonBatchOptions = {}
): Promise<BatchSummary> {
  const corridorCounties = options.counties ?? CORRIDOR_COUNTIES;
  const summary: BatchSummary = {
    candidatesFound: 0,
    cardsWritten: 0,
    cardsSkipped: 0,
    failures: [],
    additionalCountiesFound: [],
  };

  const lpCounties = await fetchLowerPeninsulaCounties();
  const store = await openStore(storePath);
  const geoSession = await openSpatialSession();
  const additionalCounties = new Set<string>();

  for (const county of corridorCounties) {
    let streamsForCounty = BLUE_RIBBON_STREAMS_LP.filter((s) => s.counties.includes(county));
    if (options.streamNames) {
      streamsForCounty = streamsForCounty.filter((s) => options.streamNames!.includes(s.name));
    }
    const adapter = getCountyAdapter(county);

    for (const record of streamsForCounty) {
      const resolved = await resolveStreamGeometry(record, lpCounties);
      if (resolved === null) {
        summary.failures.push({
          pin: "",
          county,
          error: `No MiEnviro geometry matched for stream "${record.name}" in ${county}`,
        });
        continue;
      }

      const buffer = await bufferGeometry(geoSession, resolved.geometry, BUFFER_METERS);

      const intersectingCounties = await computeIntersectingCounties(geoSession, buffer, lpCounties);
      for (const c of intersectingCounties) {
        if (!corridorCounties.includes(c)) {
          additionalCounties.add(c);
        }
      }

      const candidates = await adapter.fetchParcelsIntersecting(buffer);
      summary.candidatesFound += candidates.length;

      for (const raw of candidates) {
        const normalized = adapter.normalize(raw);
        const alreadyStored = await hasCard(store, normalized.pin);
        if (alreadyStored) {
          summary.cardsSkipped += 1;
          continue;
        }
        try {
          const card: CardDef = await deriveCardForParcel(normalized);
          await insertCard(store, card);
          summary.cardsWritten += 1;
        } catch (err) {
          summary.failures.push({
            pin: normalized.pin,
            county,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  await exportParquet(store, storePath.replace(/\.duckdb$/, ".parquet"));
  summary.additionalCountiesFound = [...additionalCounties].sort();
  return summary;
}
