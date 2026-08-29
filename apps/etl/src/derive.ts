import { validateCard, type CardDef } from "@brp/schema";
import type { NormalizedParcelRecord } from "./counties/types.js";
import type { ComponentInfo } from "./fetch/ssurgo.js";
import type { SoilPolygonArea } from "./duckdb/compute.js";

const DRY_DRAINAGE_CLASSES = new Set([
  "Somewhat excessively drained",
  "Excessively drained",
  "Well drained",
]);

function isDryComponent(component: ComponentInfo): boolean {
  return (
    component.drainagecl !== null &&
    DRY_DRAINAGE_CLASSES.has(component.drainagecl) &&
    component.wtdepannmin === null
  );
}

export interface DominantDrySoil {
  mukey: string;
  cokey: string;
  series: string;
  acres: number;
}

export interface SoilSummary {
  dryAcres: number;
  wetAcres: number;
  dominantDry: DominantDrySoil | null;
}

/** SDA can return more than one majcompflag='Yes' component for a single
 * mukey. Deterministically picks the dominant one by comppct_r (highest
 * percent wins), with a stable cokey tiebreak -- rather than silently
 * keeping whichever row happened to come back last. */
function pickDominantComponent(components: ComponentInfo[]): Map<string, ComponentInfo> {
  const byMukey = new Map<string, ComponentInfo>();
  for (const c of components) {
    const existing = byMukey.get(c.mukey);
    if (
      existing === undefined ||
      c.comppct_r > existing.comppct_r ||
      (c.comppct_r === existing.comppct_r && c.cokey < existing.cokey)
    ) {
      byMukey.set(c.mukey, c);
    }
  }
  return byMukey;
}

/** Aggregates soil-polygon-segment acreage by mukey, classifies dry vs wet per
 * the A2 rule (well-drained/somewhat-excessively-drained AND no water table in
 * profile), and finds the dominant (largest-area) dry component. Shared between
 * index.ts (which needs the cokey to fetch a dwelling rating before assembling
 * a card) and deriveCard (which needs the same totals to populate the card) so
 * the two never compute this differently. */
export function summarizeSoil(
  soilAreas: SoilPolygonArea[],
  components: ComponentInfo[]
): SoilSummary {
  const componentByMukey = pickDominantComponent(components);
  const acresByMukey = new Map<string, number>();
  for (const { mukey, acres } of soilAreas) {
    acresByMukey.set(mukey, (acresByMukey.get(mukey) ?? 0) + acres);
  }

  let dryAcres = 0;
  let wetAcres = 0;
  let dominantDry: DominantDrySoil | null = null;

  for (const [mukey, acres] of acresByMukey) {
    const component = componentByMukey.get(mukey);
    const dry = component !== undefined && isDryComponent(component);
    if (dry && component) {
      dryAcres += acres;
      if (dominantDry === null || acres > dominantDry.acres) {
        dominantDry = { mukey, cokey: component.cokey, series: component.compname, acres };
      }
    } else {
      wetAcres += acres;
    }
  }

  return { dryAcres, wetAcres, dominantDry };
}

const VALID_THERMAL_CLASSES = [
  "Cold stream",
  "Cold transitional stream",
  "Cold small river",
  "Cold transitional small river",
  "Cold transitional large river",
] as const;

type ThermalClass = (typeof VALID_THERMAL_CLASSES)[number];

function toThermalClass(value: string | null): ThermalClass | null {
  if (value === null || value === "") return null;
  if ((VALID_THERMAL_CLASSES as readonly string[]).includes(value)) {
    return value as ThermalClass;
  }
  throw new Error(`Unexpected TemperatureGradient value from MiEnviro: "${value}"`);
}

export interface DeriveInput {
  parcel: NormalizedParcelRecord;
  thermalClass: string | null;
  designatedTroutStream: boolean;
  soilAreas: SoilPolygonArea[];
  components: ComponentInfo[];
  dominantDrySoilRating: string | null;
  fetchedAt: string; // ISO date
}

export function deriveCard(input: DeriveInput): CardDef {
  const { dryAcres, wetAcres, dominantDry } = summarizeSoil(
    input.soilAreas,
    input.components
  );

  const card: CardDef = {
    identity: {
      parcel_id: input.parcel.pin,
      county: input.parcel.county,
      township: input.parcel.township,
      acres: {
        value: input.parcel.acres,
        provenance: "verified",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: {
        value: toThermalClass(input.thermalClass),
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
      designated_trout_stream: {
        value: input.designatedTroutStream,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
      flowing_wells_nearby: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "periodic",
          note: "out of scope for this ETL pass",
        },
      },
    },
    dry_wet_adjacency: {
      dry_acres: {
        value: Math.round(dryAcres * 1000) / 1000,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      wet_acres: {
        value: Math.round(wetAcres * 1000) / 1000,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      dominant_dry_soil: {
        value:
          dominantDry && input.dominantDrySoilRating
            ? { series: dominantDry.series, dwelling_rating: input.dominantDrySoilRating }
            : null,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      adjacent: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "periodic",
          note: "out of scope for this ETL pass",
        },
      },
    },
    relief_envelope_to_water_ft: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: input.fetchedAt,
        source_type: "static",
        note: "out of scope for this ETL pass",
      },
    },
    wetland: {
      wetland_pct: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "static",
          note: "out of scope for this ETL pass",
        },
      },
      wetland_between_envelope_and_water: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "static",
          note: "out of scope for this ETL pass",
        },
      },
    },
    prominence_ft: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: input.fetchedAt,
        source_type: "static",
        note: "out of scope for this ETL pass",
      },
    },
  };

  const errors = validateCard(card);
  if (errors.length > 0) {
    throw new Error(`deriveCard produced an invalid CardDef: ${errors.join("; ")}`);
  }
  return card;
}
