import { describe, it, expect } from "vitest";
import { normalize } from "../../src/counties/roscommon.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-84.775504233674, 44.3280463336908],
          [-84.7755129036588, 44.3281802630799],
          [-84.7750613139315, 44.3281813328021],
          [-84.7750604027277, 44.328162963954],
          [-84.7750566910371, 44.328102653675],
          [-84.7750530742179, 44.3280474666252],
          [-84.775504233674, 44.3280463336908],
        ],
      ],
    },
    properties: {
      PIN: "011-430-045-0000",
      Shape__Area: 1046.7578125,
      township: "Roscommon",
      ...propertyOverrides,
    },
  };
}

describe("roscommon normalize", () => {
  it("converts a raw Roscommon feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("011-430-045-0000");
    expect(result.county).toBe("Roscommon");
    expect(result.township).toBe("Roscommon");
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(7);
  });

  it("throws a clear error for a malformed PIN", () => {
    const raw = makeRawFeature({ PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid NNN-NNN-NNN-NNNN PIN');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});
