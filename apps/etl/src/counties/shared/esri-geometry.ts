import type { GeoJSONPolygon } from "../types.js";

/** Esri's geometry model represents a "multipart polygon" as one flat array
 * of rings (exterior + hole rings, distinguished by winding order) -- there
 * is no separate MultiPolygon geometry type on the wire. When a GeoJSON
 * MultiPolygon comes out of `bufferGeometry` (`ST_Buffer` doesn't merge
 * disjoint stream segments into one blob -- live-verified 2026-08-29:
 * Osceola's own Pine River, 23 segments, buffers to a MultiPolygon), flatten
 * every constituent polygon's ring list into one `rings` array; a plain
 * GeoJSON Polygon's own ring list is already in the right shape. */
export function toEsriRings(polygon: GeoJSONPolygon): number[][][] {
  if (polygon.type === "MultiPolygon") {
    return polygon.coordinates.flat();
  }
  return polygon.coordinates;
}

/** ArcGIS FeatureServers can respond HTTP 200 with an error payload in the
 * body instead of a non-2xx status -- live-verified 2026-08-29: a malformed
 * query to Osceola's FeatureServer returns 200 with
 * `{"error":{"code":400,"message":"..."}}`. The `res.ok` check alone misses
 * this class of failure entirely, and the caller goes on to read
 * `body.features` (undefined), crashing downstream with an
 * unrelated-looking TypeError. Call this immediately after parsing the JSON
 * body, before touching `body.features`. */
export function assertNoArcgisError(body: unknown, context: string): void {
  if (typeof body !== "object" || body === null || !("error" in body)) return;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return;
  const { code, message } = error as { code?: unknown; message?: unknown };
  throw new Error(`${context}: ArcGIS error ${code ?? "?"}: ${message ?? "unknown error"}`);
}

/** Repeatedly calls `fetchPage` with an increasing `resultOffset`,
 * accumulating features across pages, until a page reports the server's
 * `maxRecordCount` transfer limit was not exceeded (or returns no
 * features). Osceola's FeatureServer (and likely Roscommon's, same
 * ArcGIS-Online-hosted shape) caps at 2000 records per query; a single
 * 6-mile stream (Middle Branch River) already returns 839 real candidates,
 * and Pine River (57 miles) returns far more. Without paging, exceeding the
 * cap silently drops parcels with no error -- exactly the "filter on
 * judgment, not the universe" class of silent narrowing this project's
 * rules forbid, just accidental rather than deliberate. */
export async function fetchAllEsriPages<TFeature>(
  fetchPage: (
    resultOffset: number,
    resultRecordCount: number | undefined
  ) => Promise<{ features: TFeature[]; exceededTransferLimit: boolean }>
): Promise<TFeature[]> {
  const all: TFeature[] = [];
  let offset = 0;
  let pageSize: number | undefined;
  for (;;) {
    const page = await fetchPage(offset, pageSize);
    all.push(...page.features);
    if (!page.exceededTransferLimit || page.features.length === 0) break;
    pageSize = page.features.length;
    offset += page.features.length;
  }
  return all;
}
