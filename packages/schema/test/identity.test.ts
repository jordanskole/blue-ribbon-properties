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
    ...overrides,
  };
}

describe("validateIdentity", () => {
  it("returns no errors for a well-formed identity", () => {
    expect(validateIdentity(makeIdentity())).toEqual([]);
  });

  it("rejects a parcel_id that isn't NN-NNN-NNN-NN", () => {
    const errors = validateIdentity(makeIdentity({ parcel_id: "10 003 013 20" }));
    expect(errors).toContain(
      'parcel_id "10 003 013 20" does not match expected PIN format NN-NNN-NNN-NN'
    );
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
});
