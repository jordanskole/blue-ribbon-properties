import { describe, it, expect } from "vitest";
import { validateCard, type CardDef } from "../src/card.js";

function makeCard(overrides: Partial<CardDef> = {}): CardDef {
  const base: CardDef = {
    identity: {
      parcel_id: "10-003-013-20",
      county: "Osceola",
      township: "Middle Branch",
      acres: {
        value: 3.755,
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: {
        value: "Cold stream",
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
      designated_trout_stream: {
        value: true,
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
      flowing_wells_nearby: {
        value: { count: 2, nearest_ft: 2270 },
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
    },
    dry_wet_adjacency: {
      dry_acres: {
        value: 1.638,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      wet_acres: {
        value: 2.117,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      dominant_dry_soil: {
        value: { series: "Kalkaska", dwelling_rating: "Not limited" },
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      adjacent: {
        value: true,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
    },
    relief_envelope_to_water_ft: {
      value: 14,
      provenance: "inferred",
      vintage: { as_of: "2026-08-27", source_type: "periodic" },
    },
    wetland: {
      wetland_pct: {
        value: 56.4,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "static" },
      },
      wetland_between_envelope_and_water: {
        value: false,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "static" },
      },
    },
    prominence_ft: {
      value: 6,
      provenance: "inferred",
      vintage: { as_of: "2026-08-27", source_type: "static" },
    },
  };
  return { ...base, ...overrides };
}

describe("validateCard", () => {
  it("returns no errors for a well-formed card where dry+wet == acres", () => {
    expect(validateCard(makeCard())).toEqual([]);
  });

  it("propagates identity errors", () => {
    const card = makeCard({
      identity: {
        parcel_id: "not-a-pin",
        county: "Osceola",
        township: "Middle Branch",
        acres: {
          value: 3.755,
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      },
    });
    expect(validateCard(card)).toContain(
      'parcel_id "not-a-pin" does not match expected PIN format NN-NNN-NNN-NN'
    );
  });

  it("rejects negative dry_acres", () => {
    const card = makeCard();
    card.dry_wet_adjacency.dry_acres.value = -1;
    expect(validateCard(card)).toContain("dry_acres.value must not be negative, got -1");
  });

  it("rejects negative wet_acres", () => {
    const card = makeCard();
    card.dry_wet_adjacency.wet_acres.value = -1;
    expect(validateCard(card)).toContain("wet_acres.value must not be negative, got -1");
  });

  it("flags dry_acres + wet_acres that don't sum to identity.acres within tolerance", () => {
    const card = makeCard();
    card.dry_wet_adjacency.wet_acres.value = 5; // 1.638 + 5 = 6.638, way off from 3.755
    const errors = validateCard(card);
    expect(errors.some((e) => e.includes("does not match identity.acres.value"))).toBe(true);
  });

  it("allows dry_acres + wet_acres within 0.01 ac of identity.acres", () => {
    const card = makeCard();
    card.dry_wet_adjacency.dry_acres.value = 1.64; // 1.64 + 2.117 = 3.757, within 0.01 of 3.755
    expect(validateCard(card)).toEqual([]);
  });

  it("skips the acreage-sum check when any of the three values is null", () => {
    const card = makeCard();
    card.dry_wet_adjacency.dry_acres.value = null;
    expect(validateCard(card)).toEqual([]);
  });

  it("rejects wetland_pct outside 0-100", () => {
    const card = makeCard();
    card.wetland.wetland_pct.value = 150;
    expect(validateCard(card)).toContain(
      "wetland.wetland_pct.value must be between 0 and 100, got 150"
    );
  });
});
