import type { CardDef } from "@brp/schema";
import { BLUE_RIBBON_STREAMS_LP } from "./data/blue-ribbon-streams.js";
import { fetchLowerPeninsulaCounties } from "./fetch/county-boundaries.js";
import { resolveStreamGeometry } from "./fetch/blue-ribbon-geometry.js";
import { openSpatialSession, closeSpatialSession } from "./duckdb/load.js";
import {
  bufferGeometry,
  computeIntersectingCounties,
  loadCountiesForIntersectionCheck,
} from "./duckdb/buffer.js";
import { COUNTY_REGISTRY, getCountyAdapter } from "./counties/registry.js";
import { deriveCardForParcel } from "./index.js";
import { openStore, hasCard, insertCard, exportParquet, closeStore } from "./duckdb/store.js";

const BUFFER_METERS = 1000;
// The corridor county list is derived from COUNTY_REGISTRY (the real source
// of truth for which counties have a working adapter) rather than
// hand-copied here. A hand-copied version of this exact list (Otsego and
// Manistee shipped but the copy was never updated) silently excluded both
// from every default batch run for months -- confirmed live 2026-08-31, zero
// Otsego/Manistee cards in the store despite both adapters having passing
// real-network integration tests. Deriving from the registry makes that
// class of drift structurally impossible: a new adapter is picked up the
// moment it's added to COUNTY_REGISTRY.
const CORRIDOR_COUNTIES = Object.keys(COUNTY_REGISTRY);

export interface BlueRibbonBatchOptions {
  /** Restrict to these counties (default: all 5 corridor counties). */
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

  // Each DuckDB connection must be released on every exit path, including a
  // thrown error partway through -- an unclosed connection left the node
  // process hanging indefinitely after a failed run (2026-08-29) instead of
  // exiting once the run finished. Nesting store's try/finally around
  // geoSession's (rather than opening both before either try begins) closes
  // a narrow leak window: if openSpatialSession() itself throws, store's
  // connection is still guaranteed to close.
  try {
    const geoSession = await openSpatialSession();
    try {
      // Loaded once per run, not once per stream -- see
      // loadCountiesForIntersectionCheck's own comment for why.
      await loadCountiesForIntersectionCheck(geoSession, lpCounties);
      const additionalCounties = new Set<string>();

      for (const county of corridorCounties) {
        let streamsForCounty = BLUE_RIBBON_STREAMS_LP.filter((s) => s.counties.includes(county));
        if (options.streamNames) {
          streamsForCounty = streamsForCounty.filter((s) => options.streamNames!.includes(s.name));
        }
        const adapter = getCountyAdapter(county);

        for (const record of streamsForCounty) {
          // The per-stream operations (resolving geometry, buffering,
          // computing intersecting counties, fetching candidates) are not
          // per-candidate-isolated like the loop below -- a single bad
          // stream (a network error, a MultiPolygon edge case an adapter
          // doesn't yet handle, etc.) must not abort every remaining
          // stream/county in the batch. Record a failure and move to the
          // next stream instead, consistent with the per-candidate
          // isolation already below.
          let candidates;
          try {
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

            const intersectingCounties = await computeIntersectingCounties(geoSession, buffer);
            for (const c of intersectingCounties) {
              if (!corridorCounties.includes(c)) {
                additionalCounties.add(c);
              }
            }

            candidates = await adapter.fetchParcelsIntersecting(buffer);
          } catch (err) {
            summary.failures.push({
              pin: "",
              county,
              error: err instanceof Error ? err.message : String(err),
            });
            continue;
          }

          summary.candidatesFound += candidates.length;

          for (const raw of candidates) {
            // adapter.normalize can throw on a single real-world edge case
            // (e.g. a genuinely MultiPolygon parcel -- live-verified
            // 2026-08-29 near Middle Branch River -- which every adapter's
            // normalize() rejects rather than attempting to support end to
            // end). That must record a per-parcel failure and move on, not
            // abort every remaining stream/county in the batch: a single
            // uncommon candidate crashing the whole run is a robustness gap,
            // not the "filter only on the universe" this repo requires.
            let normalized;
            try {
              normalized = adapter.normalize(raw);
            } catch (err) {
              summary.failures.push({
                pin: String(
                  raw.properties.PIN ?? raw.properties.TaxID ?? raw.properties.pin ?? "unknown"
                ),
                county,
                error: err instanceof Error ? err.message : String(err),
              });
              continue;
            }

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
    } finally {
      closeSpatialSession(geoSession);
    }
  } finally {
    closeStore(store);
  }
}
