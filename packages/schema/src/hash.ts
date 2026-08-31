import { CARD_COLUMNS } from "./duckdb-columns.js";

export interface SchemaHash {
  /** Full 64-character SHA-256 hex digest. */
  hash: string;
  /** First 8 characters — suitable for filenames, logs, and display. */
  short: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 fingerprint of the `cards` table's column list — changes whenever
 * a field is added, removed, or reordered. Uses the Web Crypto API so the
 * same implementation runs in both Node (apps/etl's export script) and the
 * browser (apps/viewer compares this against a published manifest.json
 * before trusting a snapshot's shape).
 */
export async function computeSchemaHash(): Promise<SchemaHash> {
  const json = JSON.stringify(CARD_COLUMNS);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = toHex(digest);
  return { hash, short: hash.slice(0, 8) };
}
