import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeSchemaHash } from "@brp/schema";
import { writeManifest } from "../src/export-viewer-data.js";

describe("writeManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brp-export-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a manifest.json with schemaHash matching computeSchemaHash()", async () => {
    await writeManifest(1885, ["Osceola", "Iosco", "Roscommon"], dir);
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    const expected = await computeSchemaHash();
    expect(manifest.schemaHash).toBe(expected.hash);
    expect(manifest.cardCount).toBe(1885);
    expect(manifest.counties).toEqual(["Iosco", "Osceola", "Roscommon"]);
    expect(typeof manifest.exportedAt).toBe("string");
    expect(manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
