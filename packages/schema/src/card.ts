import type { Field } from "./provenance.js";
import { validateIdentity, type ParcelIdentity } from "./identity.js";

/** A1 — is the aquifer surfacing here? A composite signal, not one field. */
export interface GroundwaterExpression {
  thermal_class: Field<
    | "Cold stream"
    | "Cold transitional stream"
    | "Cold small river"
    | "Cold transitional small river"
    | "Cold transitional large river"
    | null
  >;
  designated_trout_stream: Field<boolean>;
  flowing_wells_nearby: Field<{ count: number; nearest_ft: number } | null>;
}

/** A2 — dry ground adjacent to wet amenity. "The whole search" per 01_. */
export interface DryWetAdjacency {
  dry_acres: Field<number>;
  wet_acres: Field<number>;
  dominant_dry_soil: Field<{ series: string; dwelling_rating: string } | null>;
  adjacent: Field<boolean>;
}

/** A4 — wetland footprint and whether it sits between the envelope and the water. */
export interface WetlandFootprint {
  wetland_pct: Field<number>;
  wetland_between_envelope_and_water: Field<boolean>;
}

/** The v1 parcel card: identity + Tier A (A1–A5). One card per PIN, always. */
export interface CardDef {
  identity: ParcelIdentity;
  groundwater: GroundwaterExpression; // A1
  dry_wet_adjacency: DryWetAdjacency; // A2
  relief_envelope_to_water_ft: Field<number>; // A3
  wetland: WetlandFootprint; // A4
  prominence_ft: Field<number>; // A5
}

const ACRES_TOLERANCE = 0.01;

/**
 * Structural validation only — does not re-query any source. Checks that the card is
 * internally consistent (e.g. dry_acres + wet_acres roughly equals the parcel's total
 * acreage), not that its values are factually correct.
 */
export function validateCard(card: CardDef): string[] {
  const errors = validateIdentity(card.identity);

  const { dry_acres, wet_acres } = card.dry_wet_adjacency;

  if (dry_acres.value !== null && dry_acres.value < 0) {
    errors.push(`dry_acres.value must not be negative, got ${dry_acres.value}`);
  }
  if (wet_acres.value !== null && wet_acres.value < 0) {
    errors.push(`wet_acres.value must not be negative, got ${wet_acres.value}`);
  }

  if (
    dry_acres.value !== null &&
    wet_acres.value !== null &&
    card.identity.acres.value !== null
  ) {
    const sum = dry_acres.value + wet_acres.value;
    const diff = Math.abs(sum - card.identity.acres.value);
    if (diff > ACRES_TOLERANCE) {
      errors.push(
        `dry_acres + wet_acres (${sum.toFixed(3)}) does not match identity.acres.value ` +
          `(${card.identity.acres.value.toFixed(3)}) within tolerance ${ACRES_TOLERANCE}`
      );
    }
  }

  const wetlandPct = card.wetland.wetland_pct.value;
  if (wetlandPct !== null && (wetlandPct < 0 || wetlandPct > 100)) {
    errors.push(`wetland.wetland_pct.value must be between 0 and 100, got ${wetlandPct}`);
  }

  return errors;
}
