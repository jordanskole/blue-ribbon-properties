import type { Field } from "./provenance.js";
import type { PolygonGeometry } from "./geometry.js";

export interface ParcelIdentity {
  parcel_id: string; // PIN, the join key — canonical form is dash-separated groups,
  // e.g. "10-003-013-20" (Osceola, 4 groups), "062-026-300-020-00" (Iosco, 5
  // groups), "011-430-045-0000" (Roscommon, 4 groups, 4-digit last group), or
  // "051-A20-000-033-00" (Iosco platted subdivision, a letter+2-digit block
  // code in place of one numeric group). The exact grouping is a county
  // convention, not a fixed shape this schema enforces.
  county: string;
  township: string;
  acres: Field<number>; // wrapped: the spike found disagreeing acreage numbers for one PIN
  boundary: Field<PolygonGeometry>; // the parcel's real boundary, from the same county
  // FeatureServer fetch as acres — same provenance/vintage treatment.
}

// Loose on purpose: PIN segment counts and widths vary by county (verified
// for Osceola, Iosco, and Roscommon so far), and a segment isn't always pure
// digits -- Iosco's platted-subdivision parcels use a letter+2-3-digit block
// code for one segment instead (verified live 2026-08-30 against 43 real
// parcels). This only catches gross malformation (spaces, missing dashes),
// not a specific county's exact shape.
const PIN_SEGMENT = String.raw`(?:\d{2,4}|[A-Z]\d{2,3})`;
const PIN_PATTERN = new RegExp(`^${PIN_SEGMENT}(-${PIN_SEGMENT}){3,4}$`);

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
  const boundary = identity.boundary.value;
  if (boundary !== null) {
    if ((boundary as { type: string }).type !== "Polygon") {
      errors.push(
        `boundary.value.type must be "Polygon", got "${(boundary as { type: string }).type}"`
      );
    } else if (
      !Array.isArray(boundary.coordinates) ||
      boundary.coordinates.length === 0 ||
      boundary.coordinates[0].length === 0
    ) {
      errors.push("boundary.value.coordinates must contain at least one non-empty ring");
    }
  }

  return errors;
}
