import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectStreamsForCounties } from "../src/export-viewer-main.js";
import { BLUE_RIBBON_STREAMS_LP } from "../src/data/blue-ribbon-streams.js";

describe("selectStreamsForCounties", () => {
  it("includes only streams touching at least one of the given counties", () => {
    const result = selectStreamsForCounties(
      BLUE_RIBBON_STREAMS_LP,
      ["Osceola", "Iosco", "Roscommon", "Otsego", "Manistee"]
    );
    // Pine River touches Manistee, Lake, Osceola -- included via Manistee/Osceola.
    expect(result.some((s) => s.name === "Pine River")).toBe(true);
    // Pere Marquette touches Mason, Lake only -- neither is an adapted county.
    expect(result.some((s) => s.name === "Pere Marquette")).toBe(false);
  });
});
