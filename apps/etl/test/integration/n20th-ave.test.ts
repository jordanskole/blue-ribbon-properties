import { describe, it, expect } from "vitest";
import { runParcelEtl } from "../../src/index.js";
import {
  PARCEL_013_20,
  PARCEL_009_00,
  PARCEL_008_00,
} from "../../../../packages/schema/test/golden/n20th-ave.fixture.js";

describe("N 20th Ave, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces packages/schema's golden fixture non-null fields for all three parcels",
    async () => {
      const results = await Promise.all([
        runParcelEtl("10-003-013-20", "Osceola"),
        runParcelEtl("10-003-009-00", "Osceola"),
        runParcelEtl("10-003-008-00", "Osceola"),
      ]);
      const [card013, card009, card008] = results;

      // Identity
      expect(card013.identity.parcel_id).toBe(PARCEL_013_20.identity.parcel_id);
      expect(card013.identity.acres.value).toBeCloseTo(
        PARCEL_013_20.identity.acres.value!,
        2
      );
      expect(card009.identity.parcel_id).toBe(PARCEL_009_00.identity.parcel_id);
      expect(card009.identity.acres.value).toBeCloseTo(
        PARCEL_009_00.identity.acres.value!,
        2
      );
      expect(card008.identity.parcel_id).toBe(PARCEL_008_00.identity.parcel_id);
      expect(card008.identity.acres.value).toBeCloseTo(
        PARCEL_008_00.identity.acres.value!,
        2
      );

      // A1 -- thermal_class is null on all three (corrected 2026-08-28);
      // designated_trout_stream is true on 008-00 only.
      expect(card013.groundwater.thermal_class.value).toBeNull();
      expect(card009.groundwater.thermal_class.value).toBeNull();
      expect(card008.groundwater.thermal_class.value).toBeNull();
      expect(card013.groundwater.designated_trout_stream.value).toBe(
        PARCEL_013_20.groundwater.designated_trout_stream.value
      );
      expect(card009.groundwater.designated_trout_stream.value).toBe(
        PARCEL_009_00.groundwater.designated_trout_stream.value
      );
      expect(card008.groundwater.designated_trout_stream.value).toBe(true);

      // A2 -- dry/wet acres, within a generous tolerance of the spike's own numbers
      // (the spike's SDA clip and this ETL's SDA clip should agree closely, but
      // aren't required to match to the same floating-point precision).
      expect(card013.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_013_20.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card013.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_013_20.dry_wet_adjacency.wet_acres.value!,
        1
      );
      expect(card009.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_009_00.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card009.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_009_00.dry_wet_adjacency.wet_acres.value!,
        1
      );
      expect(card008.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_008_00.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card008.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_008_00.dry_wet_adjacency.wet_acres.value!,
        1
      );

      // Dominant dry soil should be Kalkaska on all three, matching the fixture.
      expect(card013.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
      expect(card009.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
      expect(card008.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
    },
    30_000 // real network calls across 3 parcels -- generous timeout
  );
});
