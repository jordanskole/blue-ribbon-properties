import { describe, it, expect } from "vitest";
import { combineProvenance, validateIdentity, validateCard, getLayer, LAYER_REGISTRY } from "../src/index.js";

describe("package public API", () => {
  it("exports combineProvenance", () => {
    expect(combineProvenance("verified", "aggregator")).toBe("aggregator");
  });

  it("exports validateIdentity", () => {
    expect(
      validateIdentity({
        parcel_id: "10-003-013-20",
        county: "Osceola",
        township: "Middle Branch",
        acres: {
          value: 3.755,
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
        boundary: {
          value: {
            type: "Polygon",
            coordinates: [[[-85.1, 44.1], [-85.099, 44.1], [-85.099, 44.101], [-85.1, 44.1]]],
          },
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      })
    ).toEqual([]);
  });

  it("exports validateCard", () => {
    expect(typeof validateCard).toBe("function");
  });

  it("exports getLayer and LAYER_REGISTRY", () => {
    expect(LAYER_REGISTRY).toHaveLength(8);
    expect(getLayer("ssurgo_sda").name).toBe("SSURGO via Soil Data Access");
  });
});
