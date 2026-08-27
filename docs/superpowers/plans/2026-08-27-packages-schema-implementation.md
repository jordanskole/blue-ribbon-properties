# packages/schema v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/schema`, the load-bearing TypeScript package defining the parcel
card shape (identity + Tier A criteria A1–A5), the provenance/vintage metadata every field
carries, and the registry of v1 data sources — with a golden-record test fixture proving the
shape can hold N 20th Ave's real, spike-verified values.

**Architecture:** A pure-TypeScript package with no runtime dependencies beyond the standard
library. Each field is `Field<T> = { value: T | null; provenance; vintage }`. Types are paired
with small, genuinely testable validation/combination functions rather than tested directly
(TS interfaces vanish at runtime). No ETL, no MCP server, no live data fetching — this plan
stops at types, a static registry, and tests.

**Tech Stack:** TypeScript (strict), Vitest, Node.js. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-27-packages-schema-design.md`

## Global Constraints

- TypeScript strict mode throughout — no `any`, no implicit `undefined` where `null` is meant.
- **No `property_id` / cross-parcel grouping.** Rejected explicitly in the spec — one PIN, one
  card, always.
- **v1 field scope = identity + Tier A (A1–A5) only.** Tier B/C/D from `01_` are out of scope
  for this plan.
- Provenance ranking, strongest to weakest: `verified` > `inferred` > `aggregator` >
  `listing claim`. Combining multiple inputs' provenance always yields the *weakest* of them.
- `Vintage.source_type` is one of exactly `"static" | "periodic" | "continuous" |
  "manual-confirmation"` — no other values.
- **No ETL, no live data fetching, no MCP server in this plan.** Types, the static `LayerDef`
  registry, validation functions, and tests only.
- **The golden test must assert the spike's own re-derived SSURGO numbers, never the disputed
  property write-up figures (93% Kalkaska on 013-20 / 66% Au Gres on 009-00).** Per the spec:
  do not "fix" the test to match the write-up — that discrepancy is still open.

---

### Task 1: Scaffold the package

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/vitest.config.ts`
- Create: `packages/schema/test/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` and `npm run typecheck` in `packages/schema/`, which every
  later task depends on.

- [ ] **Step 1: Write the package manifest**

```json
{
  "name": "@brp/schema",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Save as `packages/schema/package.json`.

- [ ] **Step 2: Write the TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

Save as `packages/schema/tsconfig.json`.

- [ ] **Step 3: Write the Vitest config**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
```

Save as `packages/schema/vitest.config.ts`.

- [ ] **Step 4: Write a smoke test**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Save as `packages/schema/test/smoke.test.ts`.

- [ ] **Step 5: Install dependencies**

Run: `cd packages/schema && npm install`
Expected: installs `typescript` and `vitest` into `packages/schema/node_modules`, creates
`package-lock.json`.

- [ ] **Step 6: Run the smoke test to verify the toolchain works**

Run: `cd packages/schema && npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/package.json packages/schema/package-lock.json packages/schema/tsconfig.json packages/schema/vitest.config.ts packages/schema/test/smoke.test.ts
git commit -m "chore(schema): scaffold packages/schema with vitest + strict TS"
```

---

### Task 2: `provenance.ts` — Provenance, Vintage, Field<T>, combineProvenance

**Files:**
- Create: `packages/schema/src/provenance.ts`
- Test: `packages/schema/test/provenance.test.ts`

**Interfaces:**
- Consumes: nothing (base module).
- Produces: `Provenance`, `VintageSourceType`, `Vintage`, `Field<T>` types and
  `combineProvenance(...provenances: Provenance[]): Provenance`, all exported from
  `../src/provenance.js`. Every later task imports `Field<T>` and `Provenance`/`Vintage` from
  here.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { combineProvenance } from "../src/provenance.js";

describe("combineProvenance", () => {
  it("returns the single input unchanged", () => {
    expect(combineProvenance("verified")).toBe("verified");
  });

  it("returns the weaker of two inputs", () => {
    expect(combineProvenance("verified", "inferred")).toBe("inferred");
    expect(combineProvenance("verified", "aggregator")).toBe("aggregator");
    expect(combineProvenance("inferred", "aggregator")).toBe("aggregator");
    expect(combineProvenance("aggregator", "listing claim")).toBe("listing claim");
  });

  it("is order-independent", () => {
    expect(combineProvenance("aggregator", "verified")).toBe("aggregator");
  });

  it("handles more than two inputs, taking the overall weakest", () => {
    expect(combineProvenance("verified", "inferred", "listing claim", "aggregator")).toBe(
      "listing claim"
    );
  });

  it("throws on zero inputs", () => {
    expect(() => combineProvenance()).toThrow(
      "combineProvenance requires at least one provenance value"
    );
  });
});
```

Save as `packages/schema/test/provenance.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module '../src/provenance.js'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
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
```

Save as `packages/schema/src/provenance.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 6 tests passed (5 from this file + 1 smoke test).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/src/provenance.ts packages/schema/test/provenance.test.ts
git commit -m "feat(schema): add Provenance/Vintage/Field<T> types and combineProvenance"
```

---

### Task 3: `identity.ts` — ParcelIdentity, validateIdentity

**Files:**
- Create: `packages/schema/src/identity.ts`
- Test: `packages/schema/test/identity.test.ts`

**Interfaces:**
- Consumes: `Field<T>` from `../src/provenance.js` (Task 2).
- Produces: `ParcelIdentity` type and `validateIdentity(identity: ParcelIdentity): string[]`
  from `../src/identity.js`. `card.ts` (Task 4) imports both.

- [ ] **Step 1: Write the failing test**

```ts
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
```

Save as `packages/schema/test/identity.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module '../src/identity.js'`.

- [ ] **Step 3: Write the implementation**

```ts
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
```

Save as `packages/schema/src/identity.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 12 tests passed (6 new + 6 from Task 2).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/src/identity.ts packages/schema/test/identity.test.ts
git commit -m "feat(schema): add ParcelIdentity and validateIdentity"
```

---

### Task 4: `card.ts` — Tier A field types, CardDef, validateCard

**Files:**
- Create: `packages/schema/src/card.ts`
- Test: `packages/schema/test/card.test.ts`

**Interfaces:**
- Consumes: `Field<T>` from `../src/provenance.js` (Task 2), `ParcelIdentity` and
  `validateIdentity` from `../src/identity.js` (Task 3).
- Produces: `GroundwaterExpression`, `DryWetAdjacency`, `WetlandFootprint`, `CardDef` types and
  `validateCard(card: CardDef): string[]` from `../src/card.js`. The golden test (Task 7)
  imports `CardDef` and `validateCard`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateCard, type CardDef } from "../src/card.js";

function makeCard(overrides: Partial<CardDef> = {}): CardDef {
  const base: CardDef = {
    identity: {
      parcel_id: "10-003-013-20",
      county: "Osceola",
      township: "Middle Branch",
      acres: {
        value: 3.755,
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: {
        value: "Cold stream",
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
      designated_trout_stream: {
        value: true,
        provenance: "verified",
        vintage: { as_of: "2026-08-27", source_type: "continuous" },
      },
      flowing_wells_nearby: {
        value: { count: 2, nearest_ft: 2270 },
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
    },
    dryWetAdjacency: {
      dry_acres: {
        value: 1.638,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      wet_acres: {
        value: 2.117,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      dominant_dry_soil: {
        value: { series: "Kalkaska", dwelling_rating: "Not limited" },
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
      adjacent: {
        value: true,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "periodic" },
      },
    },
    relief_envelope_to_water_ft: {
      value: 14,
      provenance: "inferred",
      vintage: { as_of: "2026-08-27", source_type: "periodic" },
    },
    wetland: {
      wetland_pct: {
        value: 56.4,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "static" },
      },
      wetland_between_envelope_and_water: {
        value: false,
        provenance: "inferred",
        vintage: { as_of: "2026-08-27", source_type: "static" },
      },
    },
    prominence_ft: {
      value: 6,
      provenance: "inferred",
      vintage: { as_of: "2026-08-27", source_type: "static" },
    },
  };
  return { ...base, ...overrides };
}

describe("validateCard", () => {
  it("returns no errors for a well-formed card where dry+wet == acres", () => {
    expect(validateCard(makeCard())).toEqual([]);
  });

  it("propagates identity errors", () => {
    const card = makeCard({
      identity: {
        parcel_id: "not-a-pin",
        county: "Osceola",
        township: "Middle Branch",
        acres: {
          value: 3.755,
          provenance: "verified",
          vintage: { as_of: "2026-08-27", source_type: "continuous" },
        },
      },
    });
    expect(validateCard(card)).toContain(
      'parcel_id "not-a-pin" does not match expected PIN format NN-NNN-NNN-NN'
    );
  });

  it("rejects negative dry_acres", () => {
    const card = makeCard();
    card.dryWetAdjacency.dry_acres.value = -1;
    expect(validateCard(card)).toContain("dry_acres.value must not be negative, got -1");
  });

  it("rejects negative wet_acres", () => {
    const card = makeCard();
    card.dryWetAdjacency.wet_acres.value = -1;
    expect(validateCard(card)).toContain("wet_acres.value must not be negative, got -1");
  });

  it("flags dry_acres + wet_acres that don't sum to identity.acres within tolerance", () => {
    const card = makeCard();
    card.dryWetAdjacency.wet_acres.value = 5; // 1.638 + 5 = 6.638, way off from 3.755
    const errors = validateCard(card);
    expect(errors.some((e) => e.includes("does not match identity.acres.value"))).toBe(true);
  });

  it("allows dry_acres + wet_acres within 0.01 ac of identity.acres", () => {
    const card = makeCard();
    card.dryWetAdjacency.dry_acres.value = 1.64; // 1.64 + 2.117 = 3.757, within 0.01 of 3.755
    expect(validateCard(card)).toEqual([]);
  });

  it("skips the acreage-sum check when any of the three values is null", () => {
    const card = makeCard();
    card.dryWetAdjacency.dry_acres.value = null;
    expect(validateCard(card)).toEqual([]);
  });

  it("rejects wetland_pct outside 0-100", () => {
    const card = makeCard();
    card.wetland.wetland_pct.value = 150;
    expect(validateCard(card)).toContain(
      "wetland.wetland_pct.value must be between 0 and 100, got 150"
    );
  });
});
```

Save as `packages/schema/test/card.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module '../src/card.js'`.

- [ ] **Step 3: Write the implementation**

```ts
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
  dryWetAdjacency: DryWetAdjacency; // A2
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

  const { dry_acres, wet_acres } = card.dryWetAdjacency;

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
```

Save as `packages/schema/src/card.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 20 tests passed (8 new + 12 from Tasks 2–3).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/src/card.ts packages/schema/test/card.test.ts
git commit -m "feat(schema): add Tier A CardDef types and validateCard"
```

---

### Task 5: `layers.ts` — LayerDef, the v1 registry, getLayer

**Files:**
- Create: `packages/schema/src/layers.ts`
- Test: `packages/schema/test/layers.test.ts`

**Interfaces:**
- Consumes: `VintageSourceType` from `../src/provenance.js` (Task 2).
- Produces: `LayerDef` type, `LAYER_REGISTRY` (readonly array of 7 entries), and
  `getLayer(id: string): LayerDef` from `../src/layers.js`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY, getLayer } from "../src/layers.js";

describe("LAYER_REGISTRY", () => {
  it("has exactly 7 v1 entries", () => {
    expect(LAYER_REGISTRY).toHaveLength(7);
  });

  it("has unique ids", () => {
    const ids = LAYER_REGISTRY.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the expected ids from the design spec", () => {
    const ids = LAYER_REGISTRY.map((l) => l.id).sort();
    expect(ids).toEqual(
      [
        "egle_mienviro_1",
        "egle_mienviro_32",
        "nwi_wetlands",
        "parcel_source",
        "ssurgo_sda",
        "usgs_3dep_dem",
        "wellogic_county",
      ].sort()
    );
  });

  it("every entry has a non-empty feeds list", () => {
    for (const layer of LAYER_REGISTRY) {
      expect(layer.feeds.length).toBeGreaterThan(0);
    }
  });
});

describe("getLayer", () => {
  it("returns the matching entry", () => {
    const layer = getLayer("egle_mienviro_1");
    expect(layer.name).toBe("Cold/Cold Transitional Streams");
    expect(layer.sourceType).toBe("continuous");
  });

  it("throws a clear error for an unknown id", () => {
    expect(() => getLayer("does_not_exist")).toThrow(
      'No LayerDef registered for id "does_not_exist"'
    );
  });
});
```

Save as `packages/schema/test/layers.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module '../src/layers.js'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { VintageSourceType } from "./provenance.js";

export interface LayerDef {
  id: string;
  name: string;
  source: string;
  geometryType: "point" | "polyline" | "polygon" | "raster";
  sourceType: VintageSourceType;
  /** Human-readable CardDef field paths this layer feeds, e.g. "groundwater.thermal_class" */
  feeds: string[];
}

export const LAYER_REGISTRY: readonly LayerDef[] = [
  {
    id: "egle_mienviro_1",
    name: "Cold/Cold Transitional Streams",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/1",
    geometryType: "polyline",
    sourceType: "continuous",
    feeds: ["groundwater.thermal_class"],
  },
  {
    id: "egle_mienviro_32",
    name: "Designated Trout Stream",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/32",
    geometryType: "polyline",
    sourceType: "continuous",
    feeds: ["groundwater.designated_trout_stream"],
  },
  {
    id: "nwi_wetlands",
    name: "National Wetland Inventory 2005",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/38",
    geometryType: "polygon",
    sourceType: "static",
    feeds: ["wetland.wetland_pct", "wetland.wetland_between_envelope_and_water"],
  },
  {
    id: "wellogic_county",
    name: "Wellogic county water well download",
    source: "https://www.michigan.gov/egle/maps-data/wellogic/water-wells",
    geometryType: "point",
    sourceType: "periodic",
    feeds: ["groundwater.flowing_wells_nearby"],
  },
  {
    id: "ssurgo_sda",
    name: "SSURGO via Soil Data Access",
    source: "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
    geometryType: "polygon",
    sourceType: "periodic",
    feeds: [
      "dryWetAdjacency.dry_acres",
      "dryWetAdjacency.wet_acres",
      "dryWetAdjacency.dominant_dry_soil",
      "dryWetAdjacency.adjacent",
    ],
  },
  {
    id: "parcel_source",
    name: "County parcel FeatureServer (or Regrid fallback)",
    source: "per-county — see county configuration, not a single fixed endpoint",
    geometryType: "polygon",
    sourceType: "continuous",
    feeds: ["identity.parcel_id", "identity.county", "identity.township", "identity.acres"],
  },
  {
    id: "usgs_3dep_dem",
    name: "USGS 3DEP elevation tile",
    source: "https://www.usgs.gov/3d-elevation-program",
    geometryType: "raster",
    sourceType: "static",
    feeds: ["relief_envelope_to_water_ft", "prominence_ft"],
  },
];

export function getLayer(id: string): LayerDef {
  const layer = LAYER_REGISTRY.find((l) => l.id === id);
  if (!layer) {
    throw new Error(`No LayerDef registered for id "${id}"`);
  }
  return layer;
}
```

Save as `packages/schema/src/layers.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 26 tests passed (6 new + 20 from Tasks 2–4).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/src/layers.ts packages/schema/test/layers.test.ts
git commit -m "feat(schema): add LayerDef registry for the 7 v1 sources"
```

---

### Task 6: `index.ts` — barrel export

**Files:**
- Create: `packages/schema/src/index.ts`
- Test: `packages/schema/test/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces: a single import surface `../src/index.js` re-exporting all public types and
  functions. Task 7's golden fixture imports `CardDef` and `validateCard` from here, not from
  `card.js` directly, to prove the package's actual public API surface works.

- [ ] **Step 1: Write the failing test**

```ts
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
      })
    ).toEqual([]);
  });

  it("exports validateCard", () => {
    expect(typeof validateCard).toBe("function");
  });

  it("exports getLayer and LAYER_REGISTRY", () => {
    expect(LAYER_REGISTRY).toHaveLength(7);
    expect(getLayer("ssurgo_sda").name).toBe("SSURGO via Soil Data Access");
  });
});
```

Save as `packages/schema/test/index.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module '../src/index.js'`.

- [ ] **Step 3: Write the implementation**

```ts
export type { Provenance, VintageSourceType, Vintage, Field } from "./provenance.js";
export { combineProvenance } from "./provenance.js";

export type { ParcelIdentity } from "./identity.js";
export { validateIdentity } from "./identity.js";

export type {
  GroundwaterExpression,
  DryWetAdjacency,
  WetlandFootprint,
  CardDef,
} from "./card.js";
export { validateCard } from "./card.js";

export type { LayerDef } from "./layers.js";
export { LAYER_REGISTRY, getLayer } from "./layers.js";
```

Save as `packages/schema/src/index.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 30 tests passed (4 new + 26 from Tasks 2–5).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/src/index.ts packages/schema/test/index.test.ts
git commit -m "feat(schema): add package barrel export"
```

---

### Task 7: Golden-record fixture and test — N 20th Ave

**Files:**
- Create: `packages/schema/test/golden/n20th-ave.fixture.ts`
- Create: `packages/schema/test/golden/n20th-ave.test.ts`

**Interfaces:**
- Consumes: `CardDef` and `validateCard` from `../../src/index.js` (Task 6).
- Produces: `PARCEL_013_20`, `PARCEL_009_00`, `PARCEL_008_00` fixture constants — later ETL
  work (out of scope for this plan) can diff live pipeline output against these by hand until
  an automated live-vs-fixture comparison is built.

Every numeric value below traces to a query run during the `05_SPIKE_FINDINGS.md` session
(SDA area-weighted SSURGO clips against the official Osceola parcel geometry). The A2 "dry"
rule from the spec is: drainage class well-drained or somewhat-excessively-drained AND no
water table in profile. Component drainage classes found in the spike: Kalkaska = somewhat
excessively drained (dry), Montcalm = well drained (dry), Au Gres = somewhat poorly drained
(wet), Evart = poorly drained (wet), Roscommon = poorly drained (wet), Carbondale muck and
Sloan loam = poorly/very poorly drained (wet).

- 013-20 (3.755 ac): Kalkaska 42.6% (1.598 ac) + Montcalm 1.1% (0.040 ac) = **1.638 ac dry**;
  Au Gres 32.0% (1.202 ac) + Evart loam 24.4% (0.915 ac) = **2.117 ac wet**.
- 009-00 (3.167 ac): Kalkaska 89.7% (2.839 ac) = **2.839 ac dry**; Roscommon 9.6% (0.304 ac) +
  Au Gres 0.8% (0.024 ac) = **0.328 ac wet**.
- 008-00 (10.421 ac): Kalkaska 27.6% (2.872 ac) = **2.872 ac dry**; Carbondale muck 36.3%
  (3.787 ac) + Au Gres 31.7% (3.301 ac) + Roscommon 4.4% (0.458 ac) + Sloan loam <0.1% (0.003
  ac) = **7.549 ac wet**.

Only parcel 008-00 is confirmed river-adjacent (per the spike's aerial cross-check — it's the
parcel that physically reaches the Middle Branch River); 013-20 and 009-00 don't touch a
mapped MiEnviro reach directly, so their `thermal_class`/`designated_trout_stream` are `null`/
`false` with an explanatory note, not fabricated positive values.

- [ ] **Step 1: Write the fixture**

```ts
import type { CardDef } from "../../src/index.js";

const SPIKE_DATE = "2026-08-27";

export const PARCEL_013_20: CardDef = {
  identity: {
    parcel_id: "10-003-013-20",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 3.755,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note:
          "013-20 does not directly touch a mapped MiEnviro layer-1 reach; only 008-00 " +
          "reaches the Middle Branch River per the spike's aerial cross-check.",
      },
    },
    designated_trout_stream: {
      value: false,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "same reasoning as thermal_class — not directly adjacent to a designated reach",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note:
          "spike found flowing wells within 1.5 mi of the general area but did not compute " +
          "per-parcel-centroid distance — not yet computed",
      },
    },
  },
  dryWetAdjacency: {
    dry_acres: {
      value: 1.638,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 2.117,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "polygon-touch test not run in the spike — not yet computed",
      },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note:
        "spike's relief transect used the wrong line (straight guess, not a real " +
        "road-to-river path) — not a validated null, see 05_SPIKE_FINDINGS.md",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "static",
        note: "NWI/hydric overlay not run in the spike — not yet computed",
      },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "static",
      note: "not yet computed — depends on the same corrected DEM transect as relief",
    },
  },
};

export const PARCEL_009_00: CardDef = {
  identity: {
    parcel_id: "10-003-009-00",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 3.167,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "009-00 does not directly touch a mapped reach — only 008-00 reaches the river",
      },
    },
    designated_trout_stream: {
      value: false,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "same reasoning as thermal_class",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "not yet computed per-parcel",
      },
    },
  },
  dryWetAdjacency: {
    dry_acres: {
      value: 2.839,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 0.328,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic", note: "not yet computed" },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note: "spike's relief transect used the wrong line — not a validated null",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
  },
};

export const PARCEL_008_00: CardDef = {
  identity: {
    parcel_id: "10-003-008-00",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 10.421,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: "Cold stream",
      provenance: "verified",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: 'MiEnviro layer 1, NHSStreamName "Middle Branch River"',
      },
    },
    designated_trout_stream: {
      value: true,
      provenance: "verified",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note:
          'MiEnviro layer 32, GNISName "Middle Branch River", RegulationType "Type 1", ' +
          "Designated=1",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "not yet computed per-parcel",
      },
    },
  },
  dryWetAdjacency: {
    dry_acres: {
      value: 2.872,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 7.549,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic", note: "not yet computed" },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note: "spike's relief transect used the wrong line — not a validated null",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
  },
};
```

Save as `packages/schema/test/golden/n20th-ave.fixture.ts`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { validateCard } from "../../src/index.js";
import { PARCEL_013_20, PARCEL_009_00, PARCEL_008_00 } from "./n20th-ave.fixture.js";

describe("N 20th Ave golden record (05_SPIKE_FINDINGS.md)", () => {
  const parcels = [PARCEL_013_20, PARCEL_009_00, PARCEL_008_00];

  it("has no structural validation errors on any of the three parcels", () => {
    for (const card of parcels) {
      expect(validateCard(card)).toEqual([]);
    }
  });

  it("resolves all three known PINs", () => {
    expect(PARCEL_013_20.identity.parcel_id).toBe("10-003-013-20");
    expect(PARCEL_009_00.identity.parcel_id).toBe("10-003-009-00");
    expect(PARCEL_008_00.identity.parcel_id).toBe("10-003-008-00");
  });

  it("sums acreage to ~17.34, matching start-here.md's 17.37", () => {
    const total =
      PARCEL_013_20.identity.acres.value! +
      PARCEL_009_00.identity.acres.value! +
      PARCEL_008_00.identity.acres.value!;
    expect(total).toBeCloseTo(17.343, 2);
  });

  it("classifies the Middle Branch River as a designated cold stream on the river-adjacent parcel (008-00) only", () => {
    expect(PARCEL_008_00.groundwater.thermal_class.value).toBe("Cold stream");
    expect(PARCEL_008_00.groundwater.designated_trout_stream.value).toBe(true);
    expect(PARCEL_013_20.groundwater.thermal_class.value).toBeNull();
    expect(PARCEL_009_00.groundwater.thermal_class.value).toBeNull();
  });

  it(
    "carries the spike's own re-derived soil percentages, NOT the disputed property " +
      "write-up figures (93% Kalkaska on 013-20 / 66% Au Gres on 009-00) — see " +
      "05_SPIKE_FINDINGS.md, 'The soil percentages — an open discrepancy'",
    () => {
      // 013-20: 42.6% Kalkaska (dry) + 32.0% Au Gres + 24.4% Evart loam (wet) + 1.1% Montcalm (dry)
      expect(PARCEL_013_20.dryWetAdjacency.dry_acres.value).toBeCloseTo(1.638, 3);
      expect(PARCEL_013_20.dryWetAdjacency.wet_acres.value).toBeCloseTo(2.117, 3);

      // 009-00: 89.7% Kalkaska (dry) + 9.6% Roscommon + 0.8% Au Gres (wet)
      expect(PARCEL_009_00.dryWetAdjacency.dry_acres.value).toBeCloseTo(2.839, 3);
      expect(PARCEL_009_00.dryWetAdjacency.wet_acres.value).toBeCloseTo(0.328, 3);

      // 008-00: 27.6% Kalkaska (dry) + 36.3% Carbondale muck + 31.7% Au Gres + 4.4% Roscommon (wet)
      expect(PARCEL_008_00.dryWetAdjacency.dry_acres.value).toBeCloseTo(2.872, 3);
      expect(PARCEL_008_00.dryWetAdjacency.wet_acres.value).toBeCloseTo(7.549, 3);
    }
  );

  it("does not assert relief_envelope_to_water_ft or prominence_ft — spike's transect was invalid, per the spec", () => {
    for (const card of parcels) {
      expect(card.relief_envelope_to_water_ft.value).toBeNull();
      expect(card.prominence_ft.value).toBeNull();
    }
  });
});
```

Save as `packages/schema/test/golden/n20th-ave.test.ts`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/schema && npm test`
Expected: FAIL — `Cannot find module './n20th-ave.fixture.js'` (fixture step above creates it,
so if done in order this instead verifies the *test* file's assertions against the fixture;
if the fixture file is missing, create it first per Step 1 before running).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/schema && npm test`
Expected: PASS — 36 tests passed (6 new + 30 from Tasks 2–6).

- [ ] **Step 5: Typecheck**

Run: `cd packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add packages/schema/test/golden/n20th-ave.fixture.ts packages/schema/test/golden/n20th-ave.test.ts
git commit -m "test(schema): add N 20th Ave golden-record fixture from 05_SPIKE_FINDINGS.md"
```

---

## Definition of done

- `cd packages/schema && npm test` passes all 36 tests.
- `cd packages/schema && npm run typecheck` reports no errors.
- `git log --oneline` shows 7 commits, one per task, each independently buildable.
- No file in `packages/schema/src/` references ETL, fetch, or any live network call — this
  package is types, a static registry, and pure validation functions only, per the spec's v1
  scope.
