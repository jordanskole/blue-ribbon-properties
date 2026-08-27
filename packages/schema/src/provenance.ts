export type Provenance = "verified" | "aggregator" | "listing claim" | "inferred";

export type VintageSourceType = "static" | "periodic" | "continuous" | "manual-confirmation";

export interface Vintage {
  as_of: string; // ISO date
  source_type: VintageSourceType;
  note?: string;
}

export interface Field<T> {
  value: T | null; // null is data, not an error — start-here.md rule 3
  provenance: Provenance;
  vintage: Vintage;
}

const PROVENANCE_RANK: Record<Provenance, number> = {
  verified: 3,
  inferred: 2,
  aggregator: 1,
  "listing claim": 0,
};

/**
 * Combines multiple inputs' provenance into one, per the spec's explicit ranking
 * (verified > inferred > aggregator > listing claim). A field computed from several
 * source fields is only as trustworthy as the weakest of them.
 */
export function combineProvenance(...provenances: Provenance[]): Provenance {
  if (provenances.length === 0) {
    throw new Error("combineProvenance requires at least one provenance value");
  }
  return provenances.reduce((weakest, current) =>
    PROVENANCE_RANK[current] < PROVENANCE_RANK[weakest] ? current : weakest
  );
}
