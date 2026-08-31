import { describe, it, expect } from "vitest";
import { validateIdentity, type ParcelIdentity } from "../src/identity.js";

function makeIdentity(overrides: Partial<ParcelIdentity> = {}): ParcelIdentity {
  return {
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
    ...overrides,
  };
}

describe("validateIdentity", () => {
  it("returns no errors for a well-formed identity", () => {
    expect(validateIdentity(makeIdentity())).toEqual([]);
  });

  it("rejects a parcel_id that isn't dash-separated digit groups", () => {
    const errors = validateIdentity(makeIdentity({ parcel_id: "10 003 013 20" }));
    expect(errors).toContain(
      'parcel_id "10 003 013 20" does not match expected PIN format (dash-separated digit groups)'
    );
  });

  it("accepts Iosco's 5-segment PIN shape", () => {
    const errors = validateIdentity(
      makeIdentity({
        parcel_id: "062-026-300-020-00",
        county: "Iosco",
        township: "Oscoda",
      })
    );
    expect(errors).toEqual([]);
  });

  it("accepts Roscommon's 4-digit last-segment PIN shape", () => {
    const errors = validateIdentity(
      makeIdentity({
        parcel_id: "011-430-045-0000",
        county: "Roscommon",
        township: "Roscommon",
      })
    );
    expect(errors).toEqual([]);
  });

  it("accepts Iosco's platted-subdivision letter-block PIN shape", () => {
    const errors = validateIdentity(
      makeIdentity({
        parcel_id: "051-A20-000-033-00",
        county: "Iosco",
        township: "Oscoda",
      })
    );
    expect(errors).toEqual([]);
  });

  it("rejects an empty county", () => {
    const errors = validateIdentity(makeIdentity({ county: "  " }));
    expect(errors).toContain("county must not be empty");
  });

  it("rejects an empty township", () => {
    const errors = validateIdentity(makeIdentity({ township: "" }));
    expect(errors).toContain("township must not be empty");
  });

  it("rejects non-positive acres when acres.value is present", () => {
    const errors = validateIdentity(
      makeIdentity({
        acres: {
          value: 0,
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      })
    );
    expect(errors).toContain("acres.value must be positive, got 0");
  });

  it("allows a null acres.value without an acreage error", () => {
    const errors = validateIdentity(
      makeIdentity({
        acres: {
          value: null,
          provenance: "inferred",
          vintage: { as_of: "2026-08-27", source_type: "continuous", note: "not yet sourced" },
        },
      })
    );
    expect(errors).toEqual([]);
  });

  it("rejects a boundary whose value.type is not \"Polygon\"", () => {
    const errors = validateIdentity(
      makeIdentity({
        boundary: {
          value: { type: "MultiPolygon", coordinates: [] } as never,
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      })
    );
    expect(errors).toContain('boundary.value.type must be "Polygon", got "MultiPolygon"');
  });

  it("rejects a boundary with an empty coordinate ring", () => {
    const errors = validateIdentity(
      makeIdentity({
        boundary: {
          value: { type: "Polygon", coordinates: [] },
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      })
    );
    expect(errors).toContain("boundary.value.coordinates must contain at least one non-empty ring");
  });

  it("allows a null boundary.value without an error", () => {
    const errors = validateIdentity(
      makeIdentity({
        boundary: {
          value: null,
          provenance: "inferred",
          vintage: { as_of: "2026-08-27", source_type: "continuous", note: "not yet sourced" },
        },
      })
    );
    expect(errors).toEqual([]);
  });
});
