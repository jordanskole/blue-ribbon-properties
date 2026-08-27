import { describe, it, expect } from "vitest";
import { validateCard } from "../../src/index.js";
import { PARCEL_013_20, PARCEL_009_00, PARCEL_008_00 } from "./n20th-ave.fixture.js";

describe("N 20th Ave golden record (05_SPIKE_FINDINGS.md)", () => {
  const parcels = [PARCEL_013_20, PARCEL_009_00, PARCEL_008_00];

  it("has no structural validation errors on any of the three parcels", () => {
    for (const card of parcels) {
      expect(validateCard(card)).toEqual([]);
    }
  });

  it("resolves all three known PINs", () => {
    expect(PARCEL_013_20.identity.parcel_id).toBe("10-003-013-20");
    expect(PARCEL_009_00.identity.parcel_id).toBe("10-003-009-00");
    expect(PARCEL_008_00.identity.parcel_id).toBe("10-003-008-00");
  });

  it("sums acreage to ~17.34, matching start-here.md's 17.37", () => {
    const total =
      PARCEL_013_20.identity.acres.value! +
      PARCEL_009_00.identity.acres.value! +
      PARCEL_008_00.identity.acres.value!;
    expect(total).toBeCloseTo(17.343, 2);
  });

  it("classifies the Middle Branch River as a designated cold stream on the river-adjacent parcel (008-00) only", () => {
    expect(PARCEL_008_00.groundwater.thermal_class.value).toBe("Cold stream");
    expect(PARCEL_008_00.groundwater.designated_trout_stream.value).toBe(true);
    expect(PARCEL_013_20.groundwater.thermal_class.value).toBeNull();
    expect(PARCEL_009_00.groundwater.thermal_class.value).toBeNull();
  });

  it(
    "carries the spike's own re-derived soil percentages, NOT the disputed property " +
      "write-up figures (93% Kalkaska on 013-20 / 66% Au Gres on 009-00) — see " +
      "05_SPIKE_FINDINGS.md, 'The soil percentages — an open discrepancy'",
    () => {
      // 013-20: 42.6% Kalkaska (dry) + 32.0% Au Gres + 24.4% Evart loam (wet) + 1.1% Montcalm (dry)
      expect(PARCEL_013_20.dry_wet_adjacency.dry_acres.value).toBeCloseTo(1.638, 3);
      expect(PARCEL_013_20.dry_wet_adjacency.wet_acres.value).toBeCloseTo(2.117, 3);

      // 009-00: 89.7% Kalkaska (dry) + 9.6% Roscommon + 0.8% Au Gres (wet)
      expect(PARCEL_009_00.dry_wet_adjacency.dry_acres.value).toBeCloseTo(2.839, 3);
      expect(PARCEL_009_00.dry_wet_adjacency.wet_acres.value).toBeCloseTo(0.328, 3);

      // 008-00: 27.6% Kalkaska (dry) + 36.3% Carbondale muck + 31.7% Au Gres + 4.4% Roscommon (wet)
      expect(PARCEL_008_00.dry_wet_adjacency.dry_acres.value).toBeCloseTo(2.872, 3);
      expect(PARCEL_008_00.dry_wet_adjacency.wet_acres.value).toBeCloseTo(7.549, 3);
    }
  );

  it("does not assert relief_envelope_to_water_ft or prominence_ft — spike's transect was invalid, per the spec", () => {
    for (const card of parcels) {
      expect(card.relief_envelope_to_water_ft.value).toBeNull();
      expect(card.prominence_ft.value).toBeNull();
    }
  });
});
