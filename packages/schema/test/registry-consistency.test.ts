import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "../src/layers.js";

/**
 * Every dotted field path in LAYER_REGISTRY[].feeds is a claim that a real CardDef field
 * exists at that path. Nothing in the type system checks that — feeds is just string[] — so
 * this test hand-enumerates every valid CardDef field path (matching the current shape of
 * CardDef, GroundwaterExpression, DryWetAdjacency, and WetlandFootprint in src/card.ts) and
 * asserts every feeds entry names one of them.
 *
 * This set MUST be updated by hand whenever CardDef's shape changes — that's the point: a
 * silent rename in card.ts should make this test fail, not pass.
 */
const VALID_CARD_FIELD_PATHS = new Set<string>([
  // identity.* (ParcelIdentity)
  "identity.parcel_id",
  "identity.county",
  "identity.township",
  "identity.acres",

  // groundwater.* (GroundwaterExpression) — A1
  "groundwater.thermal_class",
  "groundwater.designated_trout_stream",
  "groundwater.flowing_wells_nearby",

  // dry_wet_adjacency.* (DryWetAdjacency) — A2
  "dry_wet_adjacency.dry_acres",
  "dry_wet_adjacency.wet_acres",
  "dry_wet_adjacency.dominant_dry_soil",
  "dry_wet_adjacency.adjacent",

  // A3 — top-level scalar on CardDef
  "relief_envelope_to_water_ft",

  // wetland.* (WetlandFootprint) — A4
  "wetland.wetland_pct",
  "wetland.wetland_between_envelope_and_water",

  // A5 — top-level scalar on CardDef
  "prominence_ft",
]);

describe("LAYER_REGISTRY feeds <-> CardDef field paths", () => {
  it("every feeds entry, across every layer, names a real CardDef field path", () => {
    const invalid: string[] = [];
    for (const layer of LAYER_REGISTRY) {
      for (const path of layer.feeds) {
        if (!VALID_CARD_FIELD_PATHS.has(path)) {
          invalid.push(`${layer.id}: "${path}"`);
        }
      }
    }
    expect(invalid).toEqual([]);
  });

  it("VALID_CARD_FIELD_PATHS itself is non-empty (sanity check on the test)", () => {
    expect(VALID_CARD_FIELD_PATHS.size).toBeGreaterThan(0);
  });
});
