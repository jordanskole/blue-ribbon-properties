import type { Field } from "./provenance.js";

export interface ParcelIdentity {
  parcel_id: string; // PIN, the join key — canonical form "NN-NNN-NNN-NN", e.g. "10-003-013-20"
  county: string;
  township: string;
  acres: Field<number>; // wrapped: the spike found disagreeing acreage numbers for one PIN
}

const PIN_PATTERN = /^\d{2}-\d{3}-\d{3}-\d{2}$/;

/**
 * Structural validation only — this does not check the PIN against a live parcel source,
 * it checks that the identity block is internally well-formed.
 */
export function validateIdentity(identity: ParcelIdentity): string[] {
  const errors: string[] = [];

  if (!PIN_PATTERN.test(identity.parcel_id)) {
    errors.push(
      `parcel_id "${identity.parcel_id}" does not match expected PIN format NN-NNN-NNN-NN`
    );
  }
  if (!identity.county.trim()) {
    errors.push("county must not be empty");
  }
  if (!identity.township.trim()) {
    errors.push("township must not be empty");
  }
  if (identity.acres.value !== null && identity.acres.value <= 0) {
    errors.push(`acres.value must be positive, got ${identity.acres.value}`);
  }

  return errors;
}
