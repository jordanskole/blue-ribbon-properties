import { describe, it, expect } from "vitest";
import { validateCard } from "@brp/schema";
import { runParcelEtl } from "../../src/index.js";

describe("Iosco target parcel, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces the live-verified ground truth for PIN 062-026-300-020-00",
    async () => {
      const card = await runParcelEtl("062-026-300-020-00", "Iosco");

      expect(validateCard(card)).toEqual([]);

      // Identity — verified live against the FetchGIS FeatureServer (owner
      // McCoy, Harvey Tr, Oscoda, property class 402 residential-vacant) and
      // the statewide MinorCivilDivision layer.
      expect(card.identity.parcel_id).toBe("062-026-300-020-00");
      expect(card.identity.county).toBe("Iosco");
      expect(card.identity.township).toBe("Oscoda");
      // ~8.51 acres via the DuckDB-verified equirectangular formula on the
      // reprojected geometry; cross-checked against the FeatureServer's own
      // Shape_Area (sq ft) to within 0.1% during design.
      expect(card.identity.acres.value).toBeCloseTo(8.51, 1);
      expect(card.identity.boundary.value?.type).toBe("Polygon");
      expect(card.identity.boundary.value?.coordinates[0].length).toBeGreaterThan(0);

      // dry_acres + wet_acres reconciling with identity.acres is already
      // covered by validateCard() above.
    },
    30_000 // real network calls -- generous timeout
  );
});
