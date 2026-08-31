export interface Manifest {
  schemaHash: string;
  exportedAt: string;
  cardCount: number;
  counties: string[];
}

export type ManifestCheckResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; reason: string };

/** Fetches manifest.json and checks its schemaHash against what this build
 * of the viewer expects (computeSchemaHash() from @brp/schema, called by
 * main.ts and passed in here) -- a snapshot from months ago may genuinely
 * carry a different column shape, and querying it as if it matched today's
 * schema would silently misread a column that isn't there. */
export async function checkManifest(
  manifestUrl: string,
  expectedHash: string
): Promise<ManifestCheckResult> {
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    return { ok: false, reason: `failed to fetch manifest: HTTP ${res.status}` };
  }
  const manifest = (await res.json()) as Manifest;
  if (manifest.schemaHash !== expectedHash) {
    return {
      ok: false,
      reason:
        `schema hash mismatch: this build expects "${expectedHash}", ` +
        `manifest has "${manifest.schemaHash}" (exported ${manifest.exportedAt})`,
    };
  }
  return { ok: true, manifest };
}
