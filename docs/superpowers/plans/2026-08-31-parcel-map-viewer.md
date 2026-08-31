# Parcel Map Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the corridor store's parcel geometry a real, persisted field, then build a
static Leaflet + duckdb-wasm viewer that renders every parcel as a real polygon, in context
against the Blue Ribbon streams, with a click revealing the full card.

**Architecture:** Two phases. Phase A adds `ParcelIdentity.boundary` to `packages/schema`,
threads it through the DuckDB store and `derive.ts` (no adapter changes needed — every
adapter already produces the geometry, `derive.ts` just stops discarding it), and backfills
the existing store via a fresh full batch run. Phase B is a new `apps/viewer` workspace app
(Vite + TypeScript, no framework) that loads a static Parquet export directly in-browser via
duckdb-wasm and renders it with Leaflet — no backend, no query server.

**Tech Stack:** TypeScript, DuckDB (`@duckdb/node-api` in ETL, `@duckdb/duckdb-wasm` in the
viewer), Vite, Leaflet, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-parcel-map-viewer-design.md`

## Global Constraints

- `boundary` follows the exact same `Field<T>` shape (value/provenance/vintage) as every
  other card field — no special-casing geometry as "not really a measurement."
- No new backend/server process. The viewer is a fully static site; all querying happens
  client-side via duckdb-wasm.
- No verdict, score, rank, or judgment-encoding filter anywhere in the viewer. Parcel
  styling is by **county** only (a categorical fact), never by a Tier A measurement mapped
  onto a quality gradient.
- `packages/schema` remains the single source of truth for the card shape; `apps/viewer`
  and `apps/etl` both import types from it rather than redefining them.
- Every adapter's `normalize()` already rejects non-Polygon parcel geometry — `boundary`'s
  type is always `{ type: "Polygon"; coordinates: number[][][] }`, never MultiPolygon. This
  is a different, narrower type than `apps/etl`'s existing `GeoJSONPolygon` union (which
  covers stream-buffer corridors and genuinely can be MultiPolygon) — do not conflate them.

---

## Task 1: `packages/schema` — add `boundary` to `ParcelIdentity`

**Files:**
- Create: `packages/schema/src/geometry.ts`
- Modify: `packages/schema/src/identity.ts`
- Modify: `packages/schema/src/card.ts` (only `layers.ts`-adjacent import concerns, if any — see step 3)
- Modify: `packages/schema/src/layers.ts`
- Modify: `packages/schema/src/index.ts`
- Modify: `packages/schema/test/identity.test.ts`
- Modify: `packages/schema/test/card.test.ts`
- Modify: `packages/schema/test/registry-consistency.test.ts`
- Modify: `packages/schema/test/golden/n20th-ave.fixture.ts`

**Interfaces:**
- Produces: `PolygonGeometry` (`{ type: "Polygon"; coordinates: number[][][] }`), exported
  from `@brp/schema`. `ParcelIdentity.boundary: Field<PolygonGeometry>`.

- [ ] **Step 1: Write the failing test for `PolygonGeometry` + `boundary` validation**

Add to `packages/schema/test/identity.test.ts`, inside the existing `makeIdentity()` helper
add a default `boundary` field, and add new test cases:

```ts
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
```

Add these new `describe("validateIdentity")` cases:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/schema`
Expected: FAIL — `ParcelIdentity` has no `boundary` property (TypeScript compile error via
vitest's esbuild transform), and `validateIdentity` doesn't export the new error strings.

- [ ] **Step 3: Create `PolygonGeometry` and wire it into `ParcelIdentity`**

Create `packages/schema/src/geometry.ts`:

```ts
/** A single (non-multi) GeoJSON polygon — a parcel's own boundary is always
 * one shape (every county adapter's `normalize()` already rejects
 * MultiPolygon parcels), unlike a stream-buffer corridor, which genuinely
 * can be MultiPolygon (see apps/etl's own `GeoJSONPolygon` union, a
 * different, wider type for that different case — do not conflate them). */
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}
```

Modify `packages/schema/src/identity.ts` — add the import and the new field:

```ts
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
```

Add the structural check to `validateIdentity` (after the existing `acres.value` check,
before the final `return errors;`):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=packages/schema`
Expected: the new `identity.test.ts` cases PASS. Other test files (`card.test.ts`,
`registry-consistency.test.ts`, `golden/n20th-ave.test.ts`) will now FAIL to compile —
expected, fixed in the next steps.

- [ ] **Step 5: Fix `card.test.ts`'s `makeCard()` helper**

In `packages/schema/test/card.test.ts`, add a `boundary` field to the `identity` object
inside `makeCard()`'s `base`:

```ts
    identity: {
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
    },
```

- [ ] **Step 6: Register `boundary` in `layers.ts` and `registry-consistency.test.ts`**

In `packages/schema/src/layers.ts`, the `parcel_source` entry's `feeds` array already lists
`identity.parcel_id`, `identity.county`, `identity.township`, `identity.acres` — add
`"identity.boundary"`:

```ts
    feeds: [
      "identity.parcel_id",
      "identity.county",
      "identity.township",
      "identity.acres",
      "identity.boundary",
    ],
```

In `packages/schema/test/registry-consistency.test.ts`, add to `VALID_CARD_FIELD_PATHS`
right after `"identity.acres"`:

```ts
  "identity.boundary",
```

- [ ] **Step 7: Export `PolygonGeometry` from the package**

In `packages/schema/src/index.ts`, add:

```ts
export type { PolygonGeometry } from "./geometry.js";
```

- [ ] **Step 8: Live-fetch real boundary geometry for the N 20th Ave golden fixture**

`packages/schema/test/golden/n20th-ave.fixture.ts` defines `PARCEL_013_20`, `PARCEL_009_00`,
`PARCEL_008_00` as hand-curated `CardDef` literals — they'll now fail to compile without a
`boundary` field. This project's standing practice is to ground fixtures in real fetched
data, not fabricated coordinates, so fetch the three parcels' real geometry live.

From `apps/etl`, create a throwaway script `apps/etl/fetch_n20th_boundary.mts`:

```ts
import { osceolaAdapter } from "./src/counties/osceola.js";

for (const pin of ["10-003-013-20", "10-003-009-00", "10-003-008-00"]) {
  const raw = await osceolaAdapter.fetchParcel(pin);
  const normalized = osceolaAdapter.normalize(raw);
  console.log(pin, JSON.stringify(normalized.geometry));
}
```

Run: `cd apps/etl && npx tsx fetch_n20th_boundary.mts`

Paste each PIN's real `geometry` value into the corresponding fixture's new `boundary`
field, e.g.:

```ts
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
    boundary: {
      value: /* PASTE THE REAL fetched geometry here */,
      provenance: "verified",
      vintage: { as_of: BOUNDARY_FETCH_DATE, source_type: "continuous" },
    },
  },
  // ...unchanged...
```

Add a `BOUNDARY_FETCH_DATE` constant near the existing `SPIKE_DATE`/`RECHECK_DATE`
constants at the top of the fixture file, set to the actual date this step is run (not
backdated to `SPIKE_DATE` — the boundary fetch is genuinely happening now, not as part of
the original 2026-08-27 spike):

```ts
const BOUNDARY_FETCH_DATE = "2026-09-01"; // whatever today's real date is when this runs
```

Delete the throwaway script when done: `rm apps/etl/fetch_n20th_boundary.mts`.

- [ ] **Step 9: Run the full `packages/schema` suite**

Run: `npm test --workspace=packages/schema`
Expected: PASS, all files including `golden/n20th-ave.test.ts`.

Run: `npm run typecheck --workspace=packages/schema` (if this script exists — check
`packages/schema/package.json`; if absent, run `npx tsc --noEmit` from
`packages/schema/`)
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add packages/schema/src/geometry.ts packages/schema/src/identity.ts \
  packages/schema/src/layers.ts packages/schema/src/index.ts \
  packages/schema/test/identity.test.ts packages/schema/test/card.test.ts \
  packages/schema/test/registry-consistency.test.ts \
  packages/schema/test/golden/n20th-ave.fixture.ts
git commit -m "feat(schema): add ParcelIdentity.boundary, a real precomputed parcel polygon"
```

---

## Task 2: `packages/schema` — `CARD_COLUMNS` and `computeSchemaHash`

**Files:**
- Create: `packages/schema/src/duckdb-columns.ts`
- Create: `packages/schema/src/hash.ts`
- Create: `packages/schema/test/hash.test.ts`
- Modify: `packages/schema/src/index.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 beyond `ParcelIdentity` already having `boundary`.
- Produces: `CARD_COLUMNS: readonly string[]` (68 entries, the `cards` table's exact column
  order). `computeSchemaHash(): Promise<SchemaHash>` where `SchemaHash = { hash: string;
  short: string }`. Both exported from `@brp/schema`. Task 3 (`apps/etl`'s `store.ts`)
  imports `CARD_COLUMNS` directly instead of maintaining its own copy. Task 6 (the export
  script) and Task 9 (`apps/viewer`'s `lib/manifest.ts`) both call `computeSchemaHash()`.

- [ ] **Step 1: Write the failing test**

Create `packages/schema/test/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeSchemaHash } from "../src/hash.js";
import { CARD_COLUMNS } from "../src/duckdb-columns.js";

describe("computeSchemaHash", () => {
  it("has exactly 68 columns (3 top-level identity fields + 13 Field<T> groups x 5 columns)", () => {
    expect(CARD_COLUMNS).toHaveLength(68);
  });

  it("produces a stable 64-char hex hash for the current column list", async () => {
    const { hash, short } = await computeSchemaHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(short).toBe(hash.slice(0, 8));
  });

  it("is deterministic across repeated calls", async () => {
    const a = await computeSchemaHash();
    const b = await computeSchemaHash();
    expect(a.hash).toBe(b.hash);
  });

  it("starts with the three unwrapped top-level columns", () => {
    expect(CARD_COLUMNS.slice(0, 3)).toEqual(["parcel_id", "county", "township"]);
  });

  it("includes the new boundary columns immediately after the acres group", () => {
    const idx = CARD_COLUMNS.indexOf("identity_acres_vintage_note");
    expect(CARD_COLUMNS[idx + 1]).toBe("identity_boundary_value");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=packages/schema`
Expected: FAIL — `../src/hash.js` and `../src/duckdb-columns.js` don't exist yet.

- [ ] **Step 3: Create `duckdb-columns.ts`**

Create `packages/schema/src/duckdb-columns.ts`:

```ts
/** The DuckDB `cards` table's column names, in exact insertion order —
 * single source of truth shared by `apps/etl`'s `store.ts` (DDL +
 * `insertCard`'s column list) and `computeSchemaHash()` below, so the two
 * can never silently drift the way two independently hand-maintained
 * copies could. */
export const CARD_COLUMNS: readonly string[] = [
  "parcel_id",
  "county",
  "township",
  "identity_acres_value",
  "identity_acres_provenance",
  "identity_acres_vintage_as_of",
  "identity_acres_vintage_source_type",
  "identity_acres_vintage_note",
  "identity_boundary_value",
  "identity_boundary_provenance",
  "identity_boundary_vintage_as_of",
  "identity_boundary_vintage_source_type",
  "identity_boundary_vintage_note",
  "groundwater_thermal_class_value",
  "groundwater_thermal_class_provenance",
  "groundwater_thermal_class_vintage_as_of",
  "groundwater_thermal_class_vintage_source_type",
  "groundwater_thermal_class_vintage_note",
  "groundwater_designated_trout_stream_value",
  "groundwater_designated_trout_stream_provenance",
  "groundwater_designated_trout_stream_vintage_as_of",
  "groundwater_designated_trout_stream_vintage_source_type",
  "groundwater_designated_trout_stream_vintage_note",
  "groundwater_flowing_wells_nearby_value",
  "groundwater_flowing_wells_nearby_provenance",
  "groundwater_flowing_wells_nearby_vintage_as_of",
  "groundwater_flowing_wells_nearby_vintage_source_type",
  "groundwater_flowing_wells_nearby_vintage_note",
  "dry_wet_adjacency_dry_acres_value",
  "dry_wet_adjacency_dry_acres_provenance",
  "dry_wet_adjacency_dry_acres_vintage_as_of",
  "dry_wet_adjacency_dry_acres_vintage_source_type",
  "dry_wet_adjacency_dry_acres_vintage_note",
  "dry_wet_adjacency_wet_acres_value",
  "dry_wet_adjacency_wet_acres_provenance",
  "dry_wet_adjacency_wet_acres_vintage_as_of",
  "dry_wet_adjacency_wet_acres_vintage_source_type",
  "dry_wet_adjacency_wet_acres_vintage_note",
  "dry_wet_adjacency_dominant_dry_soil_value",
  "dry_wet_adjacency_dominant_dry_soil_provenance",
  "dry_wet_adjacency_dominant_dry_soil_vintage_as_of",
  "dry_wet_adjacency_dominant_dry_soil_vintage_source_type",
  "dry_wet_adjacency_dominant_dry_soil_vintage_note",
  "dry_wet_adjacency_adjacent_value",
  "dry_wet_adjacency_adjacent_provenance",
  "dry_wet_adjacency_adjacent_vintage_as_of",
  "dry_wet_adjacency_adjacent_vintage_source_type",
  "dry_wet_adjacency_adjacent_vintage_note",
  "relief_envelope_to_water_ft_value",
  "relief_envelope_to_water_ft_provenance",
  "relief_envelope_to_water_ft_vintage_as_of",
  "relief_envelope_to_water_ft_vintage_source_type",
  "relief_envelope_to_water_ft_vintage_note",
  "wetland_wetland_pct_value",
  "wetland_wetland_pct_provenance",
  "wetland_wetland_pct_vintage_as_of",
  "wetland_wetland_pct_vintage_source_type",
  "wetland_wetland_pct_vintage_note",
  "wetland_wetland_between_envelope_and_water_value",
  "wetland_wetland_between_envelope_and_water_provenance",
  "wetland_wetland_between_envelope_and_water_vintage_as_of",
  "wetland_wetland_between_envelope_and_water_vintage_source_type",
  "wetland_wetland_between_envelope_and_water_vintage_note",
  "prominence_ft_value",
  "prominence_ft_provenance",
  "prominence_ft_vintage_as_of",
  "prominence_ft_vintage_source_type",
  "prominence_ft_vintage_note",
];
```

- [ ] **Step 4: Create `hash.ts`**

Create `packages/schema/src/hash.ts`:

```ts
import { CARD_COLUMNS } from "./duckdb-columns.js";

export interface SchemaHash {
  /** Full 64-character SHA-256 hex digest. */
  hash: string;
  /** First 8 characters — suitable for filenames, logs, and display. */
  short: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA-256 fingerprint of the `cards` table's column list — changes whenever
 * a field is added, removed, or reordered. Uses the Web Crypto API so the
 * same implementation runs in both Node (apps/etl's export script) and the
 * browser (apps/viewer compares this against a published manifest.json
 * before trusting a snapshot's shape).
 */
export async function computeSchemaHash(): Promise<SchemaHash> {
  const json = JSON.stringify(CARD_COLUMNS);
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = toHex(digest);
  return { hash, short: hash.slice(0, 8) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=packages/schema`
Expected: PASS.

- [ ] **Step 6: Export from `index.ts`**

Add to `packages/schema/src/index.ts`:

```ts
export { CARD_COLUMNS } from "./duckdb-columns.js";
export { computeSchemaHash, type SchemaHash } from "./hash.js";
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test --workspace=packages/schema && npx tsc --noEmit -p packages/schema`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add packages/schema/src/duckdb-columns.ts packages/schema/src/hash.ts \
  packages/schema/test/hash.test.ts packages/schema/src/index.ts
git commit -m "feat(schema): add CARD_COLUMNS and computeSchemaHash for versioned exports"
```

---

## Task 3: `apps/etl` — thread `boundary` through the store and derive pipeline

**Files:**
- Modify: `apps/etl/src/duckdb/store.ts`
- Modify: `apps/etl/src/derive.ts`
- Modify: `apps/etl/src/counties/types.ts`
- Modify: `apps/etl/test/duckdb/store.test.ts`
- Modify: `apps/etl/test/derive.test.ts`

**Interfaces:**
- Consumes: `PolygonGeometry`, `CARD_COLUMNS` from `@brp/schema` (Tasks 1–2).
- Produces: `insertCard()` persists `boundary`; `deriveCard()` populates
  `identity.boundary` from `input.parcel.geometry`. No adapter files change — every
  adapter's `NormalizedParcelRecord.geometry` already flows into `deriveCard`'s `parcel`
  input unchanged.

- [ ] **Step 1: Write the failing store round-trip test**

In `apps/etl/test/duckdb/store.test.ts`, add `boundary` to `makeCard()`'s `identity`:

```ts
      acres: { value: 3.755, provenance: "verified", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      boundary: {
        value: {
          type: "Polygon",
          coordinates: [[[-85.1, 44.1], [-85.099, 44.1], [-85.099, 44.101], [-85.1, 44.1]]],
        },
        provenance: "verified",
        vintage: { as_of: "2026-08-29", source_type: "continuous" },
      },
```

Extend the `"round-trips scalar, boolean, null, and JSON-object fields correctly"` test —
add `identity_boundary_value` to the `SELECT` and a new assertion:

```ts
    const reader = await session.connection.runAndReadAll(
      `SELECT identity_acres_value, identity_acres_vintage_source_type,
              groundwater_designated_trout_stream_value,
              groundwater_thermal_class_value,
              dry_wet_adjacency_dominant_dry_soil_value,
              identity_boundary_value
       FROM cards WHERE parcel_id = $1`,
      ["10-003-013-20"]
    );
    const rows = reader.getRowObjectsJS();
    // ...existing assertions unchanged...
    expect(JSON.parse(String(rows[0].identity_boundary_value))).toEqual({
      type: "Polygon",
      coordinates: [[[-85.1, 44.1], [-85.099, 44.1], [-85.099, 44.101], [-85.1, 44.1]]],
    });
```

Add a new drift-guard test asserting the live `cards` table's actual column order matches
`CARD_COLUMNS`:

```ts
  it("the live table's column order matches @brp/schema's CARD_COLUMNS exactly", async () => {
    const reader = await session.connection.runAndReadAll(
      `SELECT column_name FROM duckdb_columns() WHERE table_name = 'cards' ORDER BY column_index`
    );
    const liveColumns = reader.getRowObjectsJS().map((r) => String(r.column_name));
    expect(liveColumns).toEqual(CARD_COLUMNS);
  });
```

Add the import at the top of the test file:

```ts
import { CARD_COLUMNS } from "@brp/schema";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl`
Expected: FAIL — `identity.boundary` doesn't exist on `makeCard()`'s literal (TS compile
error), and `identity_boundary_value` isn't a real column yet.

- [ ] **Step 3: Add `boundary` to the DDL and `insertCard`**

In `apps/etl/src/duckdb/store.ts`, add the import:

```ts
import { CARD_COLUMNS } from "@brp/schema";
```

In `CREATE_TABLE_SQL`, insert 5 new lines immediately after
`identity_acres_vintage_note TEXT,` and before `groundwater_thermal_class_value TEXT,`:

```sql
  identity_boundary_value TEXT,
  identity_boundary_provenance TEXT NOT NULL,
  identity_boundary_vintage_as_of TEXT NOT NULL,
  identity_boundary_vintage_source_type TEXT NOT NULL,
  identity_boundary_vintage_note TEXT,
```

In `insertCard`'s `params` array, insert 5 new entries immediately after
`card.identity.acres.vintage.note ?? null,` and before
`card.groundwater.thermal_class.value,`:

```ts
    card.identity.boundary.value === null
      ? null
      : JSON.stringify(card.identity.boundary.value),
    card.identity.boundary.provenance,
    card.identity.boundary.vintage.as_of,
    card.identity.boundary.vintage.source_type,
    card.identity.boundary.vintage.note ?? null,
```

Replace the entire hand-written `columns` array (the 63-line literal) with:

```ts
  // Single source of truth for column names and order — see
  // packages/schema/src/duckdb-columns.ts's own comment for why this used
  // to be a second hand-maintained copy of the same list.
  const columns = CARD_COLUMNS;
```

- [ ] **Step 4: Populate `boundary` in `derive.ts`**

In `apps/etl/src/derive.ts`, inside `deriveCard()`'s `card.identity` object literal, add
`boundary` immediately after `acres`:

```ts
      acres: {
        value: input.parcel.acres,
        provenance: "verified",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
      boundary: {
        value: input.parcel.geometry,
        provenance: "verified",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
```

- [ ] **Step 5: Point `NormalizedParcelRecord.geometry`'s type at the shared `PolygonGeometry`**

In `apps/etl/src/counties/types.ts`, add the import and change `NormalizedParcelRecord`'s
`geometry` field to use it (this does NOT touch the separate `GeoJSONPolygon` union type
below it, which stays exactly as-is — it serves a different purpose, stream-buffer
corridors, which genuinely can be MultiPolygon):

```ts
import type { PolygonGeometry } from "@brp/schema";

export interface NormalizedParcelRecord {
  pin: string; // canonical form: NN-NNN-NNN-NN, e.g. "10-003-008-00"
  county: string;
  township: string;
  acres: number;
  geometry: PolygonGeometry;
}
```

- [ ] **Step 6: Update `derive.test.ts`**

In `apps/etl/test/derive.test.ts`, the `"assembles a card with no errors from validateCard,
given consistent inputs"` test — add an assertion after the existing `validateCard`
assertion:

```ts
    expect(validateCard(card)).toEqual([]);
    expect(card.identity.boundary.value).toEqual(PARCEL.geometry);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test --workspace=apps/etl`
Expected: PASS.

Run: `npm run typecheck --workspace=apps/etl`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/etl/src/duckdb/store.ts apps/etl/src/derive.ts \
  apps/etl/src/counties/types.ts apps/etl/test/duckdb/store.test.ts \
  apps/etl/test/derive.test.ts
git commit -m "feat(etl): persist parcel boundary geometry into the DuckDB store"
```

---

## Task 4: `apps/etl` — verify `boundary` live against all 5 counties, widen the default corridor

**Files:**
- Modify: `apps/etl/test/integration/n20th-ave.test.ts`
- Modify: `apps/etl/test/integration/iosco-target-parcel.test.ts`
- Modify: `apps/etl/test/integration/roscommon-target-parcel.test.ts`
- Modify: `apps/etl/test/integration/otsego-target-parcel.test.ts`
- Modify: `apps/etl/test/integration/manistee-target-parcel.test.ts`
- Modify: `apps/etl/src/batch.ts`

**Interfaces:**
- Consumes: Task 3's `deriveCard()` populating `identity.boundary`.
- Produces: `CORRIDOR_COUNTIES` in `batch.ts` becomes `["Osceola", "Iosco", "Roscommon",
  "Otsego", "Manistee"]` — the actual current adapter set (it was still `["Osceola",
  "Iosco", "Roscommon"]`, stale since Otsego and Manistee shipped; confirmed live 2026-08-31
  that neither county's cards exist in the store yet because of this).

- [ ] **Step 1: Add a `boundary` assertion to each of the 5 real-network target-parcel tests**

Add one assertion to each file's existing `it(...)` block, right after the existing
`identity.acres`/`identity.township` assertions. The exact form is the same in each file —
structural only (type + non-empty ring), since the exact real coordinates aren't known
ahead of time and the existing PIN/acres/township assertions already confirm it's the right
parcel:

```ts
      expect(card.identity.boundary.value?.type).toBe("Polygon");
      expect(card.identity.boundary.value?.coordinates[0].length).toBeGreaterThan(0);
```

Add this to:
- `apps/etl/test/integration/n20th-ave.test.ts`
- `apps/etl/test/integration/iosco-target-parcel.test.ts`
- `apps/etl/test/integration/roscommon-target-parcel.test.ts`
- `apps/etl/test/integration/otsego-target-parcel.test.ts`
- `apps/etl/test/integration/manistee-target-parcel.test.ts`

- [ ] **Step 2: Run the integration suite to verify it fails, then passes**

Run: `npm run test:integration --workspace=apps/etl`
Expected: first run (before Step 1, or against pre-Task-3 code) would fail with
"Cannot read properties of undefined" on `boundary`; after Task 3 + Step 1, all 5 pass with
real live data.

- [ ] **Step 3: Widen `CORRIDOR_COUNTIES` to the real current adapter set**

In `apps/etl/src/batch.ts`, change:

```ts
const CORRIDOR_COUNTIES = ["Osceola", "Iosco", "Roscommon"];
```

to:

```ts
// The real current set of counties with a working adapter — Otsego and
// Manistee shipped but this constant was never updated, so a default
// (no explicit `options.counties`) batch run silently never included them.
// Confirmed live 2026-08-31: the store on disk had zero Otsego/Manistee
// cards despite both adapters having passing real-network integration
// tests for months.
const CORRIDOR_COUNTIES = ["Osceola", "Iosco", "Roscommon", "Otsego", "Manistee"];
```

- [ ] **Step 4: Run the offline suite**

Run: `npm test --workspace=apps/etl`
Expected: PASS unaffected — `batch.test.ts` always passes an explicit
`{ counties: ["Osceola"] }` to `runBlueRibbonCorridorBatch` (confirmed by reading the file:
it never relies on the `CORRIDOR_COUNTIES` default), so widening the default has no effect
on this test.

- [ ] **Step 5: Commit**

```bash
git add apps/etl/test/integration/n20th-ave.test.ts \
  apps/etl/test/integration/iosco-target-parcel.test.ts \
  apps/etl/test/integration/roscommon-target-parcel.test.ts \
  apps/etl/test/integration/otsego-target-parcel.test.ts \
  apps/etl/test/integration/manistee-target-parcel.test.ts \
  apps/etl/src/batch.ts
git commit -m "test(etl): verify boundary live across all 5 counties, fix stale corridor default"
```

---

## Task 5: Backfill the corridor store with boundary, for all 5 counties

**Files:**
- No new source files. This task runs the existing batch runner against a fresh store path
  and replaces the old store once verified.

**Interfaces:**
- Consumes: `runBlueRibbonCorridorBatch` (unchanged signature) from `apps/etl/src/batch.ts`,
  now defaulting to all 5 counties (Task 4) and persisting `boundary` (Task 3).

- [ ] **Step 1: Run the full batch against a fresh store path**

From `apps/etl/`, create a throwaway script `apps/etl/run_backfill.mts`:

```ts
import { runBlueRibbonCorridorBatch } from "./src/batch.js";

const summary = await runBlueRibbonCorridorBatch("./store/blue-ribbon-corridor-v2.duckdb");
console.log(JSON.stringify(summary, null, 2));
```

Run: `npx tsx run_backfill.mts`

This will take a while (the existing 3-county run took ~800-1000s per prior real runs; with
Otsego and Manistee added for the first time, expect longer). Do not run this in the
foreground with a short timeout — dispatch it as a background process and poll for
completion the way this project already does for long-running real-network scripts (see
the corridor-store project's own history: `ps aux`/`pgrep` + `while kill -0 <pid>` rather
than trusting a short foreground timeout).

- [ ] **Step 2: Verify the new store's row counts and coverage**

Create `apps/etl/check_backfill.mts`:

```ts
import { openStore, closeStore } from "./src/duckdb/store.js";

const store = await openStore("./store/blue-ribbon-corridor-v2.duckdb");
const byCounty = await store.connection.runAndReadAll(
  "SELECT county, COUNT(*) AS n FROM cards GROUP BY county ORDER BY county"
);
console.log(byCounty.getRowObjectsJS());

const total = await store.connection.runAndReadAll("SELECT COUNT(*) AS n FROM cards");
console.log("total:", total.getRowObjectsJS());

const nullBoundary = await store.connection.runAndReadAll(
  "SELECT COUNT(*) AS n FROM cards WHERE identity_boundary_value IS NULL"
);
console.log("cards with a null boundary:", nullBoundary.getRowObjectsJS());

const sample = await store.connection.runAndReadAll(
  "SELECT parcel_id, county, identity_boundary_value FROM cards USING SAMPLE 3"
);
console.log(sample.getRowObjectsJS());

closeStore(store);
```

Run: `npx tsx check_backfill.mts`

Expected: all 5 counties present (`Osceola`, `Iosco`, `Roscommon`, `Otsego`, `Manistee`),
total row count ≥ 1885 (the prior 3-county-only total), `nullBoundary`'s count is 0 or
explainable (a `boundary.value` can legitimately be non-null Field-wise but this checks the
raw column — every successfully-derived card should have a real boundary, since it's
sourced directly from the same fetch as `acres`, which every card already has), and the
3-row sample shows real, non-trivial `identity_boundary_value` JSON.

- [ ] **Step 3: Replace the old store with the new one**

```bash
cd apps/etl/store
mv blue-ribbon-corridor.duckdb blue-ribbon-corridor.duckdb.pre-boundary.bak
mv blue-ribbon-corridor-v2.duckdb blue-ribbon-corridor.duckdb
```

Re-export the Parquet from the renamed store (the batch runner already calls
`exportParquet` at the end of its own run using the path it was given, so
`blue-ribbon-corridor-v2.parquet` exists — rename it too):

```bash
mv blue-ribbon-corridor-v2.parquet blue-ribbon-corridor.parquet
cd ../..
```

Once confident (after Task 6/7's export script runs cleanly against this new store), delete
the `.bak` file. Keep it until then — it's the only copy of the pre-boundary 1,885-card
baseline, useful if something in the backfill needs to be diffed against it.

- [ ] **Step 4: Clean up throwaway scripts**

```bash
rm apps/etl/run_backfill.mts apps/etl/check_backfill.mts
```

- [ ] **Step 5: Report the real counts**

No commit for this task (the store itself is gitignored — nothing to add). Report the
actual `byCounty` breakdown and total in the task's completion report so the ledger has a
real record of what the backfill produced.

---

## Task 6: `apps/etl` — export script, part 1: Parquet copy + `manifest.json`

**Files:**
- Create: `apps/etl/src/export-viewer-data.ts`
- Create: `apps/etl/test/export-viewer-data.test.ts`
- Modify: `apps/etl/package.json` (new `export:viewer` script)

**Interfaces:**
- Consumes: `computeSchemaHash` from `@brp/schema` (Task 2). The store path
  (`apps/etl/store/blue-ribbon-corridor.parquet`, post-Task-5 backfill).
- Produces: `writeManifest(cardCount: number, counties: string[], outDir: string):
  Promise<void>`, writing `manifest.json` to `outDir`. `copyParquet(storePath: string,
  outDir: string): Promise<void>`. Both called from a `main()` entry point run via
  `npm run export:viewer --workspace=apps/etl`. Task 7 adds `streams.geojson` generation to
  the same script's `main()`.

- [ ] **Step 1: Write the failing test**

Create `apps/etl/test/export-viewer-data.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeSchemaHash } from "@brp/schema";
import { writeManifest } from "../src/export-viewer-data.js";

describe("writeManifest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brp-export-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a manifest.json with schemaHash matching computeSchemaHash()", async () => {
    await writeManifest(1885, ["Osceola", "Iosco", "Roscommon"], dir);
    expect(existsSync(join(dir, "manifest.json"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8"));
    const expected = await computeSchemaHash();
    expect(manifest.schemaHash).toBe(expected.hash);
    expect(manifest.cardCount).toBe(1885);
    expect(manifest.counties).toEqual(["Osceola", "Iosco", "Roscommon"]);
    expect(typeof manifest.exportedAt).toBe("string");
    expect(manifest.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl`
Expected: FAIL — `../src/export-viewer-data.js` doesn't exist.

- [ ] **Step 3: Implement `export-viewer-data.ts`**

Create `apps/etl/src/export-viewer-data.ts`:

```ts
import { mkdirSync, copyFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeSchemaHash } from "@brp/schema";

interface Manifest {
  schemaHash: string;
  exportedAt: string;
  cardCount: number;
  counties: string[];
}

export async function writeManifest(
  cardCount: number,
  counties: string[],
  outDir: string
): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const { hash } = await computeSchemaHash();
  const manifest: Manifest = {
    schemaHash: hash,
    exportedAt: new Date().toISOString().slice(0, 10),
    cardCount,
    counties: [...counties].sort(),
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function copyParquet(storeParquetPath: string, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  copyFileSync(storeParquetPath, join(outDir, "blue-ribbon-corridor.parquet"));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl`
Expected: PASS.

- [ ] **Step 5: Add the `export:viewer` npm script**

This step's `main()` entry point is completed in Task 7 (it also needs to write
`streams.geojson`, which requires live network access and doesn't belong in this task's
unit-testable surface). For now, add the script definition to `apps/etl/package.json`:

```json
    "export:viewer": "tsx src/export-viewer-main.ts"
```

(This references `src/export-viewer-main.ts`, created in Task 7 — the CLI entry point that
calls `copyParquet`, `writeManifest`, and the streams export together. `export-viewer-data.ts`
stays a pure, unit-tested library file with no CLI/network code in it, consistent with how
`store.ts` and `batch.ts` are already split.)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck --workspace=apps/etl`
Expected: clean (the `export:viewer` script referencing a not-yet-created file is fine —
`npm run` scripts aren't typechecked until invoked).

- [ ] **Step 7: Commit**

```bash
git add apps/etl/src/export-viewer-data.ts apps/etl/test/export-viewer-data.test.ts \
  apps/etl/package.json
git commit -m "feat(etl): add manifest.json + Parquet copy for the viewer's static export"
```

---

## Task 7: `apps/etl` — export script, part 2: `streams.geojson` + CLI entry point

**Files:**
- Create: `apps/etl/src/export-viewer-main.ts`
- Create: `apps/etl/test/export-viewer-main.test.ts`

**Interfaces:**
- Consumes: `BLUE_RIBBON_STREAMS_LP` from `apps/etl/src/data/blue-ribbon-streams.js`,
  `fetchLowerPeninsulaCounties` from `apps/etl/src/fetch/county-boundaries.js`,
  `resolveStreamGeometry` from `apps/etl/src/fetch/blue-ribbon-geometry.js`,
  `copyParquet`/`writeManifest` from Task 6, `CORRIDOR_COUNTIES`-equivalent county list.
- Produces: `streams.geojson` in the output dir — a `FeatureCollection` of
  `MultiLineString` features, one per Blue Ribbon stream record touching any of the 5
  adapted counties. `main()`, the script's CLI entry point.

- [ ] **Step 1: Write the failing test (mocked network)**

Create `apps/etl/test/export-viewer-main.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectStreamsForCounties } from "../src/export-viewer-main.js";
import { BLUE_RIBBON_STREAMS_LP } from "../src/data/blue-ribbon-streams.js";

describe("selectStreamsForCounties", () => {
  it("includes only streams touching at least one of the given counties", () => {
    const result = selectStreamsForCounties(
      BLUE_RIBBON_STREAMS_LP,
      ["Osceola", "Iosco", "Roscommon", "Otsego", "Manistee"]
    );
    // Pine River touches Manistee, Lake, Osceola -- included via Manistee/Osceola.
    expect(result.some((s) => s.name === "Pine River")).toBe(true);
    // Pere Marquette touches Mason, Lake only -- neither is an adapted county.
    expect(result.some((s) => s.name === "Pere Marquette")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl`
Expected: FAIL — `../src/export-viewer-main.js` doesn't exist.

- [ ] **Step 3: Implement `export-viewer-main.ts`**

```ts
import { openStore, exportParquet, closeStore } from "./duckdb/store.js";
import { copyParquet, writeManifest } from "./export-viewer-data.js";
import { BLUE_RIBBON_STREAMS_LP, type BlueRibbonStreamRecord } from "./data/blue-ribbon-streams.js";
import { fetchLowerPeninsulaCounties } from "./fetch/county-boundaries.js";
import { resolveStreamGeometry } from "./fetch/blue-ribbon-geometry.js";

const ADAPTED_COUNTIES = ["Osceola", "Iosco", "Roscommon", "Otsego", "Manistee"];
const STORE_DUCKDB_PATH = "./store/blue-ribbon-corridor.duckdb";
const STORE_PARQUET_PATH = "./store/blue-ribbon-corridor.parquet";
const OUT_DIR = "../viewer/public/data";

/** Streams whose `counties` list includes at least one currently-adapted
 * county — the same subset the batch runner itself would touch, so the
 * map's reference layer never shows a stream with no candidate parcels. */
export function selectStreamsForCounties(
  streams: BlueRibbonStreamRecord[],
  counties: string[]
): BlueRibbonStreamRecord[] {
  return streams.filter((s) => s.counties.some((c) => counties.includes(c)));
}

async function writeStreamsGeoJSON(): Promise<void> {
  const lpCounties = await fetchLowerPeninsulaCounties();
  const relevant = selectStreamsForCounties(BLUE_RIBBON_STREAMS_LP, ADAPTED_COUNTIES);

  const features = [];
  for (const record of relevant) {
    const resolved = await resolveStreamGeometry(record, lpCounties);
    if (resolved === null) continue;
    features.push({
      type: "Feature" as const,
      properties: { name: record.name, counties: record.counties },
      geometry: resolved.geometry,
    });
  }

  const featureCollection = { type: "FeatureCollection" as const, features };
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "streams.geojson"), JSON.stringify(featureCollection));
}

async function main(): Promise<void> {
  const store = await openStore(STORE_DUCKDB_PATH);
  let cardCount: number;
  let counties: string[];
  try {
    await exportParquet(store, STORE_PARQUET_PATH);
    const countReader = await store.connection.runAndReadAll("SELECT COUNT(*) AS n FROM cards");
    cardCount = Number(countReader.getRowObjectsJS()[0].n);
    const countyReader = await store.connection.runAndReadAll(
      "SELECT DISTINCT county FROM cards ORDER BY county"
    );
    counties = countyReader.getRowObjectsJS().map((r) => String(r.county));
  } finally {
    closeStore(store);
  }

  copyParquet(STORE_PARQUET_PATH, OUT_DIR);
  await writeManifest(cardCount, counties, OUT_DIR);
  await writeStreamsGeoJSON();

  console.log(`Exported ${cardCount} cards across ${counties.join(", ")} to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Run the offline test**

Run: `npm test --workspace=apps/etl`
Expected: PASS (`selectStreamsForCounties` is a pure function, no network — the rest of
`export-viewer-main.ts`'s `main()`/`writeStreamsGeoJSON` isn't unit tested, verified live
in the next step instead, same pattern as this project's other real-network scripts).

- [ ] **Step 5: Run the export live, against the backfilled store from Task 5**

Run: `npm run export:viewer --workspace=apps/etl`

Expected: creates `apps/viewer/public/data/blue-ribbon-corridor.parquet`,
`apps/viewer/public/data/manifest.json`, `apps/viewer/public/data/streams.geojson`. Inspect
`manifest.json`'s `cardCount` and `counties` — should match Task 5's verified backfill
counts. Inspect `streams.geojson`'s feature count — should be a reasonable number of streams
(fewer than `BLUE_RIBBON_STREAMS_LP`'s full 28, since only streams touching the 5 adapted
counties are included).

- [ ] **Step 6: Add `apps/viewer/public/data/` to `.gitignore`**

`apps/viewer` doesn't exist yet (created in Task 8) — create the directory now just to hold
the gitignore and exported data:

```bash
mkdir -p apps/viewer/public/data
echo "public/data/" >> apps/viewer/.gitignore
```

(`apps/viewer/.gitignore` is created fresh here; Task 8 adds the rest of the app around it.)

- [ ] **Step 7: Commit**

```bash
git add apps/etl/src/export-viewer-main.ts apps/etl/test/export-viewer-main.test.ts \
  apps/viewer/.gitignore
git commit -m "feat(etl): export streams.geojson alongside the viewer's Parquet + manifest"
```

---

## Task 8: Scaffold `apps/viewer`

**Files:**
- Create: `apps/viewer/package.json`
- Create: `apps/viewer/vite.config.ts`
- Create: `apps/viewer/tsconfig.json`
- Create: `apps/viewer/index.html`
- Create: `apps/viewer/src/main.ts`
- Create: `apps/viewer/CLAUDE.md`

**Interfaces:**
- Produces: a working, empty Vite dev server and build for `apps/viewer`. Task 9 builds on
  `src/main.ts`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@brp/viewer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@brp/schema": "*",
    "@duckdb/duckdb-wasm": "^1.29.0",
    "leaflet": "^1.9.4"
  },
  "devDependencies": {
    "@types/leaflet": "^1.9.12",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

These version ranges are a reasonable starting point, not a guarantee — after `npm install`
(Step 7), if any of these fail to resolve against the real npm registry, run `npm install
<package>@latest --workspace=apps/viewer` for that package instead of hand-editing a
guessed number.

- [ ] **Step 2: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // Same exclusion bankql's apps/web uses -- duckdb-wasm's dynamic worker
    // imports don't survive Vite's dependency pre-bundling.
    exclude: ["@duckdb/duckdb-wasm"],
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Blue Ribbon Properties — Parcel Map</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    />
    <style>
      html, body, #map { height: 100%; margin: 0; }
      #card-panel {
        position: fixed;
        top: 0;
        right: 0;
        width: 380px;
        height: 100%;
        overflow-y: auto;
        background: white;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
        padding: 16px;
        display: none;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <div id="card-panel"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

(The Leaflet CSS is pulled from unpkg rather than bundled — fine for a static site with no
build-time asset pipeline concerns; revisit only if the deployed version needs to work
fully offline.)

- [ ] **Step 5: Create a minimal `src/main.ts`**

```ts
console.log("Blue Ribbon Properties viewer — scaffold OK");
```

- [ ] **Step 6: Create `CLAUDE.md`**

```markdown
# @brp/viewer

Static Vite + TypeScript site. No UI framework, no backend. Loads the corridor store's
published Parquet directly in-browser via `@duckdb/duckdb-wasm` and renders it with
Leaflet. See `docs/superpowers/specs/2026-08-31-parcel-map-viewer-design.md` for the full
design.

## Dev Commands

\`\`\`bash
npm run dev --workspace=apps/viewer        # vite dev server
npm run build --workspace=apps/viewer      # production build
npm run typecheck --workspace=apps/viewer  # tsc --noEmit
\`\`\`

## Data

`public/data/` (gitignored) holds the exported `blue-ribbon-corridor.parquet`,
`streams.geojson`, and `manifest.json` — produced by `npm run export:viewer
--workspace=apps/etl`. Run that before `npm run dev` here, or the map has nothing to show.

## File Layout

\`\`\`
src/
  main.ts              # entry point: init map, load data, wire click handler
  lib/
    duckdb.ts           # getDB() / runQuery() singleton — CDN-hosted WASM bundles
    manifest.ts         # fetch manifest.json, compare schemaHash, expose vintage/count
    map.ts              # Leaflet init: OSM base layer, parcel layer, streams layer
    card-panel.ts       # renders a full CardDef into the side panel DOM
\`\`\`

## What this app must never become

No score, rank, or recommendation. Parcel styling is by county only. See the design spec's
"What this is not" section before adding any new UI.
```

- [ ] **Step 7: Install dependencies and verify the scaffold**

```bash
npm install
npm run dev --workspace=apps/viewer &
```

Open the printed local URL in a browser (or use browser automation) — expect a blank page
with no errors, and "Blue Ribbon Properties viewer — scaffold OK" in the console. Stop the
dev server.

```bash
npm run build --workspace=apps/viewer
```

Expected: builds cleanly to `apps/viewer/dist/`.

```bash
npm run typecheck --workspace=apps/viewer
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/viewer/package.json apps/viewer/vite.config.ts apps/viewer/tsconfig.json \
  apps/viewer/index.html apps/viewer/src/main.ts apps/viewer/CLAUDE.md
git commit -m "chore(viewer): scaffold apps/viewer (Vite + TypeScript, no framework)"
```

---

## Task 9: `apps/viewer` — data layer (duckdb-wasm + manifest check)

**Files:**
- Create: `apps/viewer/src/lib/duckdb.ts`
- Create: `apps/viewer/src/lib/manifest.ts`
- Create: `apps/viewer/test/manifest.test.ts`
- Modify: `apps/viewer/src/main.ts`

**Interfaces:**
- Consumes: `computeSchemaHash` from `@brp/schema`.
- Produces: `getDB(): Promise<AsyncDuckDB>`, `runQuery(sql: string): Promise<QueryResult>`
  from `lib/duckdb.ts`. `checkManifest(manifestUrl: string, expectedHash: string):
  Promise<ManifestCheckResult>` from `lib/manifest.ts`, where `ManifestCheckResult = {
  ok: true; manifest: Manifest } | { ok: false; reason: string }`. `loadParcelsTable(
  parquetUrl: string): Promise<void>` from `lib/duckdb.ts`, creating a `cards` table in the
  in-browser DuckDB instance. Task 10 (`lib/map.ts`) queries this table.

- [ ] **Step 1: Write the failing test for `lib/manifest.ts`**

Create `apps/viewer/test/manifest.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { checkManifest } from "../src/lib/manifest.js";

describe("checkManifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok:true when the fetched manifest's schemaHash matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          schemaHash: "abc123",
          exportedAt: "2026-08-31",
          cardCount: 1885,
          counties: ["Osceola"],
        }),
      }))
    );
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.cardCount).toBe(1885);
    }
  });

  it("returns ok:false with a clear reason when the hash doesn't match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          schemaHash: "different-hash",
          exportedAt: "2026-01-01",
          cardCount: 10,
          counties: ["Osceola"],
        }),
      }))
    );
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("schema hash mismatch");
    }
  });

  it("returns ok:false when the manifest can't be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const result = await checkManifest("/data/manifest.json", "abc123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("404");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test --workspace=apps/viewer`
Expected: FAIL — `../src/lib/manifest.js` doesn't exist.

- [ ] **Step 3: Implement `lib/manifest.ts`**

```ts
export interface Manifest {
  schemaHash: string;
  exportedAt: string;
  cardCount: number;
  counties: string[];
}

export type ManifestCheckResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; reason: string };

/** Fetches manifest.json and checks its schemaHash against what this build
 * of the viewer expects (computeSchemaHash() from @brp/schema, called by
 * main.ts and passed in here) -- a snapshot from months ago may genuinely
 * carry a different column shape, and querying it as if it matched today's
 * schema would silently misread a column that isn't there. */
export async function checkManifest(
  manifestUrl: string,
  expectedHash: string
): Promise<ManifestCheckResult> {
  const res = await fetch(manifestUrl);
  if (!res.ok) {
    return { ok: false, reason: `failed to fetch manifest: HTTP ${res.status}` };
  }
  const manifest = (await res.json()) as Manifest;
  if (manifest.schemaHash !== expectedHash) {
    return {
      ok: false,
      reason:
        `schema hash mismatch: this build expects "${expectedHash}", ` +
        `manifest has "${manifest.schemaHash}" (exported ${manifest.exportedAt})`,
    };
  }
  return { ok: true, manifest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test --workspace=apps/viewer`
Expected: PASS.

- [ ] **Step 5: Configure Vitest for a DOM-capable environment**

`checkManifest` uses global `fetch`, available in Vitest's default `node` environment (Node
20+) without any special config, so no `vitest.config.ts` is needed yet for this task's
test. (If Task 10/11 add DOM-touching unit tests later, add `environment: "jsdom"` then —
not needed now, don't add it speculatively.)

- [ ] **Step 6: Implement `lib/duckdb.ts`**

```ts
import * as duckdb from "@duckdb/duckdb-wasm";

let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function init(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const rows = table.toArray().map((row) => row.toJSON() as Record<string, unknown>);
    return { rows, rowCount: table.numRows };
  } finally {
    await conn.close();
  }
}

/** Fetches the static Parquet export and registers it as the `cards` table
 * in the in-browser DuckDB instance. Boundary geometry is stored as a plain
 * JSON-serialized GeoJSON string (`identity_boundary_value`, TEXT column)
 * -- no DuckDB spatial extension needed. `JSON.parse()` on that column in
 * calling code hands Leaflet exactly the shape it expects. */
export async function loadParcelsTable(parquetUrl: string): Promise<void> {
  const db = await getDB();
  const res = await fetch(parquetUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch ${parquetUrl}: HTTP ${res.status}`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  await db.registerFileBuffer("cards.parquet", buffer);
  const conn = await db.connect();
  try {
    await conn.query(`CREATE TABLE cards AS SELECT * FROM read_parquet('cards.parquet')`);
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 7: Wire into `main.ts`**

```ts
import { getDB, loadParcelsTable, runQuery } from "./lib/duckdb.js";
import { checkManifest } from "./lib/manifest.js";
import { computeSchemaHash } from "@brp/schema";

async function bootstrap(): Promise<void> {
  const { hash } = await computeSchemaHash();
  const manifestResult = await checkManifest("/data/manifest.json", hash);
  if (!manifestResult.ok) {
    console.error("Manifest check failed:", manifestResult.reason);
    document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">${manifestResult.reason}</p>`;
    return;
  }
  console.log(
    `Loading ${manifestResult.manifest.cardCount} cards from ${manifestResult.manifest.counties.join(", ")}, exported ${manifestResult.manifest.exportedAt}`
  );

  await loadParcelsTable("/data/blue-ribbon-corridor.parquet");
  const { rowCount } = await runQuery("SELECT COUNT(*) AS n FROM cards");
  console.log(`duckdb-wasm loaded ${rowCount} row(s) into the cards table`);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
});
```

Also initialize `getDB()`'s import to confirm the unused-import lint (if any) doesn't
trip — `getDB` isn't called directly in `main.ts` (only via `loadParcelsTable`/`runQuery`
internally), so remove it from the import if TypeScript flags it unused:

```ts
import { loadParcelsTable, runQuery } from "./lib/duckdb.js";
```

- [ ] **Step 8: Live-verify in the browser**

Ensure Task 7's export ran (`apps/viewer/public/data/` has real files). Run:

```bash
npm run dev --workspace=apps/viewer
```

Open the dev server URL. Expected in the browser console: the manifest's card count and
county list logged, then "duckdb-wasm loaded N row(s) into the cards table" where N matches
the manifest's `cardCount`. No errors.

- [ ] **Step 9: Run typecheck and the unit test suite**

```bash
npm run typecheck --workspace=apps/viewer
npm run test --workspace=apps/viewer
```

Expected: both clean/passing.

- [ ] **Step 10: Commit**

```bash
git add apps/viewer/src/lib/duckdb.ts apps/viewer/src/lib/manifest.ts \
  apps/viewer/test/manifest.test.ts apps/viewer/src/main.ts
git commit -m "feat(viewer): load the corridor store via duckdb-wasm, verify schema hash first"
```

---

## Task 10: `apps/viewer` — Leaflet map: parcels + streams

**Files:**
- Create: `apps/viewer/src/lib/map.ts`
- Modify: `apps/viewer/src/main.ts`

**Interfaces:**
- Consumes: `runQuery` from `lib/duckdb.ts` (Task 9).
- Produces: `initMap(containerId: string): L.Map`. `renderParcels(map: L.Map): Promise<
  Map<string, L.Layer>>` — returns a lookup from `parcel_id` to its Leaflet layer (each
  parcel is rendered via `L.geoJSON()`, which returns an `L.Layer`, not the narrower
  `L.Polygon`), so Task 11's click handler can look up which PIN was clicked.
  `renderStreams(map: L.Map, geojsonUrl: string): Promise<void>`.

- [ ] **Step 1: Implement `lib/map.ts`**

```ts
import * as L from "leaflet";
import { runQuery } from "./duckdb.js";

const COUNTY_COLORS: Record<string, string> = {
  Osceola: "#1f77b4",
  Iosco: "#ff7f0e",
  Roscommon: "#2ca02c",
  Otsego: "#d62728",
  Manistee: "#9467bd",
};
const DEFAULT_COLOR = "#7f7f7f"; // any county not yet in the palette above

export function initMap(containerId: string): L.Map {
  const map = L.map(containerId).setView([44.3, -85.0], 8); // roughly centered on the corridor
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  return map;
}

interface ParcelRow {
  parcel_id: string;
  county: string;
  identity_boundary_value: string | null;
}

/** Boundary is stored as a plain JSON-serialized GeoJSON string (no DuckDB
 * spatial extension involved) -- JSON.parse() hands Leaflet exactly the
 * {type:"Polygon", coordinates} shape it expects, in [lng,lat] order per
 * GeoJSON, which L.geoJSON() (unlike L.polygon(), which wants [lat,lng])
 * already handles correctly. */
export async function renderParcels(map: L.Map): Promise<Map<string, L.Layer>> {
  const { rows } = await runQuery<ParcelRow>(
    "SELECT parcel_id, county, identity_boundary_value FROM cards"
  );
  const layerByPin = new Map<string, L.Layer>();

  for (const row of rows) {
    if (row.identity_boundary_value === null) continue;
    const geometry = JSON.parse(row.identity_boundary_value);
    const color = COUNTY_COLORS[row.county] ?? DEFAULT_COLOR;
    const layer = L.geoJSON(
      { type: "Feature", properties: {}, geometry },
      { style: { color, weight: 1, fillOpacity: 0.3 } }
    ).addTo(map);
    layerByPin.set(row.parcel_id, layer);
  }

  return layerByPin;
}

export async function renderStreams(map: L.Map, geojsonUrl: string): Promise<void> {
  const res = await fetch(geojsonUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch ${geojsonUrl}: HTTP ${res.status}`);
  }
  const geojson = await res.json();
  L.geoJSON(geojson, { style: { color: "#0000ff", weight: 2 } }).addTo(map);
}
```

`runQuery`'s current signature from Task 9 is `runQuery(sql: string): Promise<QueryResult>`
with `QueryResult = { rows: Array<Record<string, unknown>>; rowCount: number }` — this task
needs a generic version so `rows` can be typed as `ParcelRow[]`. Update `lib/duckdb.ts`:

```ts
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export async function runQuery<T = Record<string, unknown>>(sql: string): Promise<QueryResult<T>> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const rows = table.toArray().map((row) => row.toJSON() as T);
    return { rows, rowCount: table.numRows };
  } finally {
    await conn.close();
  }
}
```

- [ ] **Step 2: Wire into `main.ts`**

Replace the `console.log` row-count check at the end of `bootstrap()` with real rendering:

```ts
import { initMap, renderParcels, renderStreams } from "./lib/map.js";

// ...inside bootstrap(), after loadParcelsTable(...):
  const map = initMap("map");
  const layerByPin = await renderParcels(map);
  await renderStreams(map, "/data/streams.geojson");
  console.log(`Rendered ${layerByPin.size} parcel polygon(s)`);
```

- [ ] **Step 3: Live-verify in the browser**

```bash
npm run dev --workspace=apps/viewer
```

Open the dev server URL. Expected: a Leaflet map centered on the corridor, real parcel
polygons colored by county, blue stream lines overlaid. Zoom/pan to confirm polygons sit on
real parcels (compare a couple visually against known real addresses from prior live
verification, e.g. Osceola's 4411 Schneider Rd area). Check the browser console for
"Rendered N parcel polygon(s)" matching the manifest's card count (minus any with a null
boundary, if any exist).

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck --workspace=apps/viewer
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/viewer/src/lib/map.ts apps/viewer/src/lib/duckdb.ts apps/viewer/src/main.ts
git commit -m "feat(viewer): render parcels as real Leaflet polygons, styled by county"
```

---

## Task 11: `apps/viewer` — click-to-open card panel

**Files:**
- Create: `apps/viewer/src/lib/card-panel.ts`
- Modify: `apps/viewer/src/lib/map.ts`
- Modify: `apps/viewer/src/main.ts`

**Interfaces:**
- Consumes: `layerByPin` from Task 10's `renderParcels`, `runQuery` from `lib/duckdb.ts`.
- Produces: `renderCardPanel(row: Record<string, unknown>): void`, writing the full card
  into the `#card-panel` DOM element and making it visible. `wireClickHandlers(layerByPin:
  Map<string, L.Layer>): void`.

- [ ] **Step 1: Implement `lib/card-panel.ts`**

```ts
/** Renders one parcel's full row (every CARD_COLUMNS column, not a curated
 * subset) into the #card-panel element -- the same measurements the
 * (still-deferred) MCP server's get_parcel_card would return, just shown
 * instead of returned as JSON. Grouped the same way CardDef groups them. */
const FIELD_GROUPS: Array<{ label: string; prefix: string; fields: string[] }> = [
  { label: "Identity", prefix: "identity", fields: ["acres", "boundary"] },
  {
    label: "Groundwater (A1)",
    prefix: "groundwater",
    fields: ["thermal_class", "designated_trout_stream", "flowing_wells_nearby"],
  },
  {
    label: "Dry/Wet Adjacency (A2)",
    prefix: "dry_wet_adjacency",
    fields: ["dry_acres", "wet_acres", "dominant_dry_soil", "adjacent"],
  },
  { label: "Relief (A3)", prefix: "", fields: ["relief_envelope_to_water_ft"] },
  {
    label: "Wetland (A4)",
    prefix: "wetland",
    fields: ["wetland_pct", "wetland_between_envelope_and_water"],
  },
  { label: "Prominence (A5)", prefix: "", fields: ["prominence_ft"] },
];

function columnPrefix(groupPrefix: string, field: string): string {
  return groupPrefix ? `${groupPrefix}_${field}` : field;
}

function formatValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "null";
  if (typeof raw === "string") {
    try {
      // dominant_dry_soil, flowing_wells_nearby, and boundary are stored as
      // JSON strings -- pretty-print if this value parses as JSON, display
      // as-is otherwise (a plain string field like thermal_class).
      return JSON.stringify(JSON.parse(raw), null, 1);
    } catch {
      return raw;
    }
  }
  return String(raw);
}

export function renderCardPanel(row: Record<string, unknown>): void {
  const panel = document.getElementById("card-panel");
  if (!panel) return;

  const sections: string[] = [
    `<h2>${row.parcel_id}</h2>`,
    `<p>${row.county} County — ${row.township}</p>`,
  ];

  for (const group of FIELD_GROUPS) {
    sections.push(`<h3>${group.label}</h3>`);
    for (const field of group.fields) {
      const col = columnPrefix(group.prefix, field);
      const value = formatValue(row[`${col}_value`]);
      const provenance = row[`${col}_provenance`];
      const asOf = row[`${col}_vintage_as_of`];
      const sourceType = row[`${col}_vintage_source_type`];
      const note = row[`${col}_vintage_note`];
      sections.push(
        `<div><strong>${field}</strong>: <pre>${value}</pre>` +
          `<small>${provenance} · ${sourceType} · as of ${asOf}` +
          `${note ? ` · ${note}` : ""}</small></div>`
      );
    }
  }

  panel.innerHTML = sections.join("\n");
  panel.style.display = "block";
}
```

- [ ] **Step 2: Wire click handlers in `lib/map.ts`**

Modify `renderParcels` to attach a click handler per layer, calling a callback the caller
supplies (keeps `map.ts` free of DOM/panel-rendering concerns, matching the file's single
responsibility):

```ts
export async function renderParcels(
  map: L.Map,
  onParcelClick: (parcelId: string) => void
): Promise<Map<string, L.Layer>> {
  const { rows } = await runQuery<ParcelRow>(
    "SELECT parcel_id, county, identity_boundary_value FROM cards"
  );
  const layerByPin = new Map<string, L.Layer>();

  for (const row of rows) {
    if (row.identity_boundary_value === null) continue;
    const geometry = JSON.parse(row.identity_boundary_value);
    const color = COUNTY_COLORS[row.county] ?? DEFAULT_COLOR;
    const layer = L.geoJSON(
      { type: "Feature", properties: {}, geometry },
      { style: { color, weight: 1, fillOpacity: 0.3 } }
    )
      .on("click", () => onParcelClick(row.parcel_id))
      .addTo(map);
    layerByPin.set(row.parcel_id, layer);
  }

  return layerByPin;
}
```

- [ ] **Step 3: Wire into `main.ts`**

```ts
import { renderCardPanel } from "./lib/card-panel.js";

// ...inside bootstrap(), replace the renderParcels call:
  const layerByPin = await renderParcels(map, async (parcelId) => {
    const { rows } = await runQuery(
      `SELECT * FROM cards WHERE parcel_id = '${parcelId.replace(/'/g, "''")}'`
    );
    if (rows[0]) {
      renderCardPanel(rows[0]);
    }
  });
```

- [ ] **Step 4: Live-verify in the browser**

```bash
npm run dev --workspace=apps/viewer
```

Click a real parcel polygon on the map. Expected: the side panel opens on the right,
showing the PIN, county, township, and every field group (Identity, Groundwater, Dry/Wet
Adjacency, Relief, Wetland, Prominence) with value/provenance/vintage for each — matching
what a `SELECT * FROM cards WHERE parcel_id = '...'` in a DuckDB CLI against the same
Parquet would show. Click a different parcel — panel updates to the new PIN.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck --workspace=apps/viewer
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/viewer/src/lib/card-panel.ts apps/viewer/src/lib/map.ts apps/viewer/src/main.ts
git commit -m "feat(viewer): click a parcel to open the full card in a side panel"
```

---

## Final check

After Task 11, run the full monorepo test suite and typecheck once more before considering
this plan complete:

```bash
npm test --workspace=packages/schema
npm test --workspace=apps/etl
npm run test:integration --workspace=apps/etl
npm run test --workspace=apps/viewer
npm run typecheck --workspace=packages/schema
npm run typecheck --workspace=apps/etl
npm run typecheck --workspace=apps/viewer
npm run build --workspace=apps/viewer
```

Delete `apps/etl/store/blue-ribbon-corridor.duckdb.pre-boundary.bak` (from Task 5) once
everything above is green and the map has been visually confirmed to show real parcels
matching the pre-backfill store's known counties.
