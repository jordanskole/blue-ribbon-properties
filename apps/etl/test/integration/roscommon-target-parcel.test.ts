import { describe, it, expect } from "vitest";
import { validateCard } from "@brp/schema";
import { runParcelEtl } from "../../src/index.js";

describe("Roscommon target parcel, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces the live-verified ground truth for PIN 011-430-045-0000",
    async () => {
      const card = await runParcelEtl("011-430-045-0000", "Roscommon");

      expect(validateCard(card)).toEqual([]);

      // Identity -- verified live against the county's own FeatureServer
      // (117 Oliver St, Houghton Lake, LOT 45 HOUGHTON LAKE PARK) and,
      // independently, against the statewide MinorCivilDivision layer --
      // which correctly resolves "Roscommon Township" despite a real
      // duplicate-ID bug in the county's own Township layer (ID 11 maps to
      // both "Roscommon Township" and "Nester Township" there).
      expect(card.identity.parcel_id).toBe("011-430-045-0000");
      expect(card.identity.county).toBe("Roscommon");
      // The MCD layer's Name field is the short form ("Roscommon", not
      // "Roscommon Township") -- same convention as Iosco's "Oscoda".
      expect(card.identity.township).toBe("Roscommon");
      // ~0.132 acres via the DuckDB-verified equirectangular formula -- a
      // small platted subdivision lot, consistent with the county's own
      // (integer-truncated) Acres field reading 0.
      expect(card.identity.acres.value).toBeCloseTo(0.132, 2);
    },
    30_000 // real network calls -- generous timeout
  );
});
