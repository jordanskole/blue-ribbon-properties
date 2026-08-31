import { describe, it, expect } from "vitest";
import { validateCard } from "@brp/schema";
import { runParcelEtl } from "../../src/index.js";

describe("Otsego target parcel, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces the live-verified ground truth for PIN 045-000-001-001-00",
    async () => {
      const card = await runParcelEtl("045-000-001-001-00", "Otsego");

      expect(validateCard(card)).toEqual([]);

      // Identity -- verified live against Otsego's FeatureServer (owner
      // Varnhagen, 741 East Main St, Vanderbilt -- right on the Pigeon
      // River -- property class 401 residential) and, independently,
      // against the statewide MinorCivilDivision layer for township.
      expect(card.identity.parcel_id).toBe("045-000-001-001-00");
      expect(card.identity.county).toBe("Otsego");
      // ~0.397 acres via the DuckDB-verified equirectangular formula;
      // cross-checked live against the FeatureServer's own AtlasAcres field
      // (0.396816...) to within 0.2%.
      expect(card.identity.acres.value).toBeCloseTo(0.397, 2);
      expect(card.identity.boundary.value?.type).toBe("Polygon");
      expect(card.identity.boundary.value?.coordinates[0].length).toBeGreaterThan(0);
      expect(card.identity.township.length).toBeGreaterThan(0);
    },
    30_000 // real network calls -- generous timeout
  );
});
