import { describe, it, expect } from "vitest";
import { deriveCard, summarizeSoil } from "../src/derive.js";
import { validateCard } from "@brp/schema";
import type { NormalizedParcelRecord } from "../src/counties/types.js";
import type { ComponentInfo } from "../src/fetch/ssurgo.js";

const PARCEL: NormalizedParcelRecord = {
  pin: "10-003-013-20",
  county: "Osceola",
  township: "Middle Branch",
  acres: 3.755,
  geometry: { type: "Polygon", coordinates: [[[0, 0]]] },
};

const KALKASKA: ComponentInfo = {
  mukey: "190064",
  compname: "Kalkaska",
  comppct_r: 95,
  drainagecl: "Somewhat excessively drained",
  wtdepannmin: null,
  cokey: "27171875",
};

const AU_GRES: ComponentInfo = {
  mukey: "189980",
  compname: "Au Gres",
  comppct_r: 90,
  drainagecl: "Somewhat poorly drained",
  wtdepannmin: 12,
  cokey: "27171661",
};

describe("summarizeSoil", () => {
  it("classifies well-drained, no-water-table components as dry, everything else as wet", () => {
    const result = summarizeSoil(
      [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      [KALKASKA, AU_GRES]
    );
    expect(result.dryAcres).toBeCloseTo(1.638, 3);
    expect(result.wetAcres).toBeCloseTo(2.117, 3);
    expect(result.dominantDry).toEqual({
      mukey: "190064",
      cokey: "27171875",
      series: "Kalkaska",
      acres: 1.638,
    });
  });

  it("aggregates multiple soil-polygon segments sharing the same mukey before comparing totals", () => {
    const fragmentedKalkaska = [
      { mukey: "190064", acres: 0.1 },
      { mukey: "190064", acres: 0.2 },
      { mukey: "190064", acres: 0.3 }, // Kalkaska total: 0.6
    ];
    const result = summarizeSoil(
      [...fragmentedKalkaska, { mukey: "189980", acres: 0.5 }],
      [KALKASKA, { ...AU_GRES, drainagecl: "Somewhat excessively drained", wtdepannmin: null }]
    );
    // Kalkaska's aggregated 0.6 ac beats Au Gres's single 0.5 ac segment --
    // proves aggregation happens before comparison, not per-segment comparison.
    expect(result.dominantDry?.series).toBe("Kalkaska");
    expect(result.dominantDry?.acres).toBeCloseTo(0.6, 3);
    expect(result.dryAcres).toBeCloseTo(1.1, 3);
  });

  it("returns a null dominantDry when no component is dry", () => {
    const result = summarizeSoil(
      [{ mukey: "189980", acres: 2.117 }],
      [AU_GRES]
    );
    expect(result.dominantDry).toBeNull();
    expect(result.dryAcres).toBe(0);
    expect(result.wetAcres).toBeCloseTo(2.117, 3);
  });
});

describe("deriveCard", () => {
  it("assembles a card with no errors from validateCard, given consistent inputs", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      components: [KALKASKA, AU_GRES],
      dominantDrySoilRating: "Not limited",
      fetchedAt: "2026-08-28",
    });
    expect(validateCard(card)).toEqual([]);
  });

  it("populates dry_wet_adjacency and dominant_dry_soil from the soil summary", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      components: [KALKASKA, AU_GRES],
      dominantDrySoilRating: "Not limited",
      fetchedAt: "2026-08-28",
    });
    expect(card.dry_wet_adjacency.dry_acres.value).toBeCloseTo(1.638, 3);
    expect(card.dry_wet_adjacency.wet_acres.value).toBeCloseTo(2.117, 3);
    expect(card.dry_wet_adjacency.dominant_dry_soil.value).toEqual({
      series: "Kalkaska",
      dwelling_rating: "Not limited",
    });
  });

  it("carries a null thermal_class through when MiEnviro found no intersecting reach", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [],
      components: [],
      dominantDrySoilRating: null,
      fetchedAt: "2026-08-28",
    });
    expect(card.groundwater.thermal_class.value).toBeNull();
  });

  it("throws on an unexpected TemperatureGradient value from MiEnviro", () => {
    expect(() =>
      deriveCard({
        parcel: PARCEL,
        thermalClass: "Lukewarm stream",
        designatedTroutStream: false,
        soilAreas: [],
        components: [],
        dominantDrySoilRating: null,
        fetchedAt: "2026-08-28",
      })
    ).toThrow('Unexpected TemperatureGradient value from MiEnviro: "Lukewarm stream"');
  });
});
