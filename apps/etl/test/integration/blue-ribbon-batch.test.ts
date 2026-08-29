import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBlueRibbonCorridorBatch } from "../../src/batch.js";

describe("Blue Ribbon corridor batch, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "finds real candidate parcels near Osceola's Middle Branch River and writes real cards",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "brp-batch-integration-"));
      const storePath = join(dir, "corridor.duckdb");

      const summary = await runBlueRibbonCorridorBatch(storePath, {
        counties: ["Osceola"],
        streamNames: ["Middle Branch River"],
      });

      expect(summary.failures).toEqual([]);
      expect(summary.candidatesFound).toBeGreaterThan(0);
      expect(summary.cardsWritten).toBeGreaterThan(0);
      expect(summary.cardsWritten).toBe(summary.candidatesFound); // fresh store, nothing skipped
    },
    120_000 // real network + real derive pipeline across every candidate parcel
  );
});
