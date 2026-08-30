import { describe, it, expect } from "vitest";
import { validateCard } from "@brp/schema";
import { runParcelEtl } from "../../src/index.js";

describe("Manistee target parcel, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces the live-verified ground truth for PIN 03-021-002-10",
    async () => {
      const card = await runParcelEtl("03-021-002-10", "Manistee");

      expect(validateCard(card)).toEqual([]);

      // Identity -- verified live against Manistee's own FeatureServer
      // (owner Boynton Margaret M, 8783 River Rd, Manistee -- legal
      // description references the Manistee River meander line, and this
      // parcel sits within ~1km of Bear Creek's real MiEnviro-resolved
      // geometry, the Blue Ribbon stream that led to this county).
      expect(card.identity.parcel_id).toBe("03-021-002-10");
      expect(card.identity.county).toBe("Manistee");
      // ~14.86 acres per the layer's own precomputed ACRES field, verified
      // live 2026-08-30 to be the trustworthy source (Shape__Area / 4046.86
      // overstates it by ~2x, a Web Mercator area-inflation artifact at this
      // latitude -- see the comment in normalize()).
      expect(card.identity.acres.value).toBeCloseTo(14.86, 1);
      expect(card.identity.township.length).toBeGreaterThan(0);
    },
    30_000 // real network calls -- generous timeout
  );
});
