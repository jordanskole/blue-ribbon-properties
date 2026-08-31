import { describe, it, expect, vi, afterEach } from "vitest";
import { checkManifest } from "../src/lib/manifest.js";

describe("checkManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok:true when the fetched manifest's schemaHash matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          schemaHash: "abc123",
          exportedAt: "2026-08-31",
          cardCount: 1885,
          counties: ["Osceola"],
        }),
      }))
    );
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.cardCount).toBe(1885);
    }
  });

  it("returns ok:false with a clear reason when the hash doesn't match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          schemaHash: "different-hash",
          exportedAt: "2026-01-01",
          cardCount: 10,
          counties: ["Osceola"],
        }),
      }))
    );
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("schema hash mismatch");
    }
  });

  it("returns ok:false when the manifest can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("404");
    }
  });
});
