import { describe, it, expect } from "vitest";
import { normalize, webMercatorToWgs84 } from "../../src/counties/iosco.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-83.43396303570957, 44.4396825950131],
          [-83.43610488884151, 44.439693306162795],
          [-83.4361026430533, 44.44150763113336],
          [-83.43395432205132, 44.44149736927274],
          [-83.43395513053508, 44.44132182704021],
          [-83.43396303570957, 44.4396825950131],
        ],
      ],
    },
    properties: {
      TaxID: "062-026-300-020-00",
      Shape_Area: 370596.150263,
      township: "Oscoda",
      ...propertyOverrides,
    },
  };
}

describe("webMercatorToWgs84", () => {
  it("matches DuckDB's ST_Transform for a known EPSG:3857 point", () => {
    // Verified live against DuckDB ST_Transform('EPSG:3857' -> 'EPSG:4326')
    // for the target parcel's first vertex (PIN 062-026-300-020-00).
    const [lng, lat] = webMercatorToWgs84(-9287826.28, 5533738.12);
    expect(lng).toBeCloseTo(-83.43396303570957, 9);
    expect(lat).toBeCloseTo(44.4396825950131, 9);
  });
});

describe("iosco normalize", () => {
  it("converts a raw Iosco feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("062-026-300-020-00");
    expect(result.county).toBe("Iosco");
    expect(result.township).toBe("Oscoda");
    expect(result.acres).toBeCloseTo(8.508, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(6);
  });

  it("throws a clear error for a malformed TaxID", () => {
    const raw = makeRawFeature({ TaxID: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid NNN-NNN-NNN-NNN-NN PIN');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});
