import { describe, it, expect } from "vitest";
import { normalize } from "../../src/counties/osceola.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-85.1302116901917, 44.0682264905314],
          [-85.1297927773973, 44.0676977847693],
          [-85.1284158128495, 44.0676948301085],
          [-85.1302116901917, 44.0682264905314],
        ],
      ],
    },
    properties: {
      PIN: "10 003 008 00",
      OWNER: "SPRAGUE WILLIAM E",
      PROPCLASS: "RESIDENTIAL",
      UNIT: "MIDDLE BRANCH TOWNSHIP",
      Shape__Area: 453941.4482421875,
      ...propertyOverrides,
    },
  };
}

describe("osceola normalize", () => {
  it("converts a raw Osceola feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("10-003-008-00");
    expect(result.county).toBe("Osceola");
    expect(result.township).toBe("Middle Branch");
    expect(result.acres).toBeCloseTo(10.421, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(4);
  });

  it("throws a clear error for a malformed raw PIN", () => {
    const raw = makeRawFeature({ PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('cannot normalize PIN "not-a-pin"');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});
