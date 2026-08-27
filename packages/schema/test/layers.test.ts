import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY, getLayer } from "../src/layers.js";

describe("LAYER_REGISTRY", () => {
  it("has exactly 7 v1 entries", () => {
    expect(LAYER_REGISTRY).toHaveLength(7);
  });

  it("has unique ids", () => {
    const ids = LAYER_REGISTRY.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the expected ids from the design spec", () => {
    const ids = LAYER_REGISTRY.map((l) => l.id).sort();
    expect(ids).toEqual(
      [
        "egle_mienviro_1",
        "egle_mienviro_32",
        "nwi_wetlands",
        "parcel_source",
        "ssurgo_sda",
        "usgs_3dep_dem",
        "wellogic_county",
      ].sort()
    );
  });

  it("every entry has a non-empty feeds list", () => {
    for (const layer of LAYER_REGISTRY) {
      expect(layer.feeds.length).toBeGreaterThan(0);
    }
  });
});

describe("getLayer", () => {
  it("returns the matching entry", () => {
    const layer = getLayer("egle_mienviro_1");
    expect(layer.name).toBe("Cold/Cold Transitional Streams");
    expect(layer.sourceType).toBe("continuous");
  });

  it("throws a clear error for an unknown id", () => {
    expect(() => getLayer("does_not_exist")).toThrow(
      'No LayerDef registered for id "does_not_exist"'
    );
  });
});
