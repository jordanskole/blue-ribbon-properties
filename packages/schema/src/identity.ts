import type { Field } from "./provenance.js";

export interface ParcelIdentity {
  parcel_id: string; // PIN, the join key — canonical form is dash-separated digit groups,
  // e.g. "10-003-013-20" (Osceola, 4 groups), "062-026-300-020-00" (Iosco, 5
  // groups), or "011-430-045-0000" (Roscommon, 4 groups, 4-digit last group).
  // The exact grouping is a county convention, not a fixed shape this schema enforces.
  county: string;
  township: string;
  acres: Field<number>; // wrapped: the spike found disagreeing acreage numbers for one PIN
}

// Loose on purpose: PIN segment counts and widths vary by county (verified
// for Osceola, Iosco, and Roscommon so far). This only catches gross
// malformation (letters, spaces, missing dashes), not a specific county's
// exact shape.
const PIN_PATTERN = /^\d{2,4}(-\d{2,4}){3,4}$/;

/**
 * Structural validation only — this does not check the PIN against a live parcel source,
 * it checks that the identity block is internally well-formed.
 */
export function validateIdentity(identity: ParcelIdentity): string[] {
  const errors: string[] = [];

  if (!PIN_PATTERN.test(identity.parcel_id)) {
    errors.push(
      `parcel_id "${identity.parcel_id}" does not match expected PIN format (dash-separated digit groups)`
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
