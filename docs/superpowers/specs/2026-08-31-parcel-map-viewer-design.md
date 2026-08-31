# Parcel Map Viewer — Design

**Status:** approved by user, section by section, 2026-08-31.

**Spec:** this file. **Plan:** to be written next via `superpowers:writing-plans`.

## Goal

Build a Leaflet map that shows every parcel currently in the Blue Ribbon corridor store as
a real polygon, in context against the Blue Ribbon streams that put it there, with a click
revealing the full card — every field, same shape every time, exactly as `01_
VACANT_LAND_CRITERIA.md` and `packages/schema` already define it. The viewer is a new,
independent consumer of the store, not a layer the (still-deferred) MCP server sits behind.

## Why this instead of (or alongside) the MCP server

`04_ARCHITECTURE_MCP.md` argued BRP "has no app, needs no app, and should not grow one,"
on the premise that a web UI would become "a place for verdicts to accumulate." That premise
predates this spec. The resolution, confirmed with the user: **the DuckDB/Parquet store is
the product — the hub.** The MCP server and this viewer are both peer consumers of that hub,
neither depending on the other. Building a viewer does not risk BRP becoming a judgment tool
as long as the viewer itself stays a measurement display, not a filter/rank/recommend
surface — which this spec holds to explicitly (see "What this is not," below).

The MCP server (`04_`'s 7-tool sketch) remains fully deferred. Nothing in this spec touches
it or assumes it exists.

## Scope

**In scope (this spec, phases A/B):**
- Add a `boundary` field to `ParcelIdentity` in `packages/schema`, carrying the parcel's
  real polygon (already fetched by every adapter today, currently discarded after the
  spatial intersects query).
- Thread `boundary` through `packages/schema`'s DuckDB DDL, all 5 county adapters'
  `normalize()`, and `derive.ts`.
- Backfill the existing store (Osceola, Iosco, Roscommon, Otsego, Manistee — 1,885+ cards)
  by re-running the existing resumable batch runner against a fresh store, now that
  `normalize()` persists geometry instead of discarding it.
- A small static-export step producing three files: the corridor store's Parquet (as
  today), a small streams Parquet/GeoJSON (Blue Ribbon stream geometry, for map context),
  and a `manifest.json` (schema hash + export vintage + row count — see "Versioning,"
  below).
- `apps/viewer`: a new Vite + TypeScript workspace app (no UI framework), duckdb-wasm
  querying the static Parquet directly in-browser, Leaflet rendering parcels and streams,
  a click-to-open side panel showing the full card.

**Out of scope (deferred, not part of this plan):**
- The MCP server itself.
- OPFS caching, background refresh, partitioned datasets — bankql-scale machinery this
  store (low hundreds of KB) doesn't need yet.
- Multi-snapshot history/diffing UI (e.g. actually comparing two vintages of the store
  against each other for land-use change). The manifest's versioning fields make this
  possible later; building the comparison UI is not this spec's job.
- Any filter/sort/rank UI beyond structural grouping (e.g. by county). No "best parcels,"
  no score, no recommendation — see rule 1 and the "no verdict tools" section of
  `start-here.md`.
- Auth. This is a portfolio project; there is no user data and nothing to protect yet.
- A second map library (Mapbox) — Leaflet only, chosen for zero-config static hosting.

## What this is not

The viewer must not become a fifth "recommend" surface. Concretely:
- No color-coding or sizing by a computed "goodness" score. Parcel styling is by **county**
  only (a categorical fact) — never by a Tier A measurement mapped onto a quality gradient.
- No search/filter that expresses judgment (e.g. "hide parcels under 5 acres"). Structural
  filters (by county, by whether a field is null) are fine; threshold filters that encode
  a buyer's opinion are not — this is the same "17.37-acre lesson" from `start-here.md`
  rule 3, applied to a map instead of a query.
- The side panel shows the full card, unedited and unranked — the same measurements the
  MCP server's `get_parcel_card` would eventually return, just rendered instead of returned
  as JSON.

## Phase A — geometry becomes a real, precomputed field

### `packages/schema` changes

Add a `GeoJSONPolygon` type (mirroring `apps/etl/src/counties/types.ts`'s existing shape —
that file should import it from `@brp/schema` afterward instead of maintaining its own
copy, so there is exactly one definition) and a new field on `ParcelIdentity`:

```ts
export type GeoJSONPolygon = { type: "Polygon"; coordinates: number[][][] };

export interface ParcelIdentity {
  parcel_id: string;
  county: string;
  township: string;
  acres: Field<number>;
  boundary: Field<GeoJSONPolygon>; // NEW
}
```

`validateIdentity` gains a structural check: `boundary.value` (when non-null) must have
`type: "Polygon"` and a non-empty `coordinates[0]` ring — mirroring the existing acres
non-negativity check, not a geometry-correctness check (that's what the live-verified
adapter tests are for).

### DuckDB DDL (`apps/etl/src/duckdb/store.ts`)

`boundary` gets the same 5-column treatment every other `Field<T>` gets
(`identity_boundary_value`, `..._provenance`, `..._vintage_as_of`,
`..._vintage_source_type`, `..._vintage_note`) — except `value` is stored as `TEXT`
(the GeoJSON polygon serialized as JSON), the same way DuckDB already stores other
non-primitive `Field<T>` values on this card (e.g. `dominant_dry_soil`). This is the
project's 4th schema widening this session's lineage of changes, but it's additive only —
no existing column changes shape.

### Adapter changes (all 5: Osceola, Iosco, Roscommon, Otsego, Manistee)

Each adapter's `fetchParcel`/`fetchParcelsIntersecting` already produces a
`NormalizedParcelRecord` with a `geometry: { type: "Polygon"; coordinates: number[][][] }`
field — this is not new fetching, just no longer discarding what's already there.
`derive.ts`'s `deriveCard()` gains one field on `identity`:

```ts
boundary: {
  value: input.parcel.geometry,
  provenance: "verified",
  vintage: { as_of: input.fetchedAt, source_type: "continuous" },
},
```

— identical provenance/vintage treatment to `identity.acres`, since both come from the
exact same county FeatureServer fetch.

### Backfill

Re-run `runBlueRibbonCorridorBatch` against a fresh store path (not resumed against the
existing one, since every existing card is missing `boundary` and needs re-deriving, not
skipping). This reuses the batch runner's existing resumability/pagination/error-isolation
behavior verbatim — no new migration tooling. The old store stays on disk until the new one
is verified, then gets replaced.

## Phase B — `apps/viewer`

### Static export

A new script (living in `apps/etl`, alongside the existing store/export code) produces,
into `apps/viewer/public/data/`:

- `blue-ribbon-corridor.parquet` — copied/re-exported from the store, unchanged shape from
  today's export logic.
- `streams.geojson` — resolved once from the existing `resolveStreamGeometry` /
  `blue-ribbon-geometry.ts` code, for every stream this repo currently has adapter coverage
  for (i.e. streams touching Osceola, Iosco, Roscommon, Otsego, Manistee). This is a
  reference/context layer, not queryable card data, so plain GeoJSON (not Parquet) is fine
  — Leaflet consumes it directly with no SQL involved.
- `manifest.json` — see Versioning below.

`apps/viewer/public/data/` is gitignored, same as `apps/etl/store/` — it's generated
output. "Topping up" the viewer means: re-run the ETL batch, re-run the export script,
rebuild/redeploy the viewer.

### Versioning (`manifest.json`)

```ts
interface Manifest {
  schemaHash: string;   // structural hash of CardDef, same mechanism as bankql's hashDataset
  exportedAt: string;   // ISO date — this snapshot's vintage
  cardCount: number;
  counties: string[];   // which counties this snapshot covers
}
```

Two independent purposes, both real, both cheap to keep in one file: (1) the viewer checks
`schemaHash` against what its own bundled `@brp/schema` expects before querying, so a stale
deployed viewer doesn't silently misread a differently-shaped snapshot; (2) `exportedAt` +
`cardCount` give every snapshot a version marker, so that a future consumer (e.g. land-use
change detection, comparing this quarter's snapshot to last quarter's) has something to
diff against without needing this spec to build the diffing itself. A schema hash mismatch
is exactly why (1) matters even without OPFS caching: a snapshot from months ago may
genuinely have a different `boundary`-less shape, and the viewer needs to know that before
trying to read a column that isn't there.

### `apps/viewer` file layout

```
apps/viewer/
  index.html
  src/
    main.ts              # entry point: init map, load data, wire click handler
    lib/
      duckdb.ts           # getDB() / runQuery() singleton — CDN bundles, near-verbatim
                           # from bankql's apps/web/app/lib/duckdb.ts
      manifest.ts         # fetch manifest.json, compare schemaHash, expose vintage/count
      map.ts               # Leaflet init: OSM base layer, parcel layer, streams layer
      card-panel.ts        # renders a full CardDef into the side panel DOM
  public/
    data/                 # gitignored — see Static export, above
  vite.config.ts
  package.json
  CLAUDE.md
```

No routing library, no React — one page, one map. `vite.config.ts` needs
`optimizeDeps.exclude: ["@duckdb/duckdb-wasm"]`, same as bankql, to avoid Vite pre-bundling
its dynamic worker imports.

### Query shape

On load: `getDB()` initializes, then `CREATE TABLE parcels AS SELECT * FROM
read_parquet('/data/blue-ribbon-corridor.parquet')` (or a view, if the spatial extension
needs `ST_GeomFromGeoJSON(identity_boundary_value)` applied before `ST_AsGeoJSON` can hand
Leaflet a clean ring). Then a single query pulls `identity_parcel_id`,
`identity_county`, and the boundary as GeoJSON for every card, rendered as Leaflet
polygons styled by county. Streams load directly from the static GeoJSON file (no SQL —
Leaflet's `L.geoJSON()` reads it as-is).

Click a polygon → look up that PIN's full row (all 63+1 columns) → `card-panel.ts` renders
every field with its value/provenance/vintage, grouped the same way `CardDef` groups them
(identity, groundwater, dry/wet adjacency, wetland, etc.) — not a curated summary.

## Testing

- `packages/schema`: extend `validateIdentity`/`validateCard` tests for the new `boundary`
  field (structural checks only — non-null implies well-formed `Polygon` shape).
- Each of the 5 adapters: extend existing `normalize()` unit tests to assert `boundary`
  passes through; the existing real-network integration test per county already fetches
  real geometry, so it starts asserting on `card.identity.boundary.value` too.
- `apps/etl`'s export script: unit test that `manifest.json`'s `schemaHash` matches
  `packages/schema`'s own hash function output for the current `CardDef` shape.
- `apps/viewer`: `manifest.ts`'s hash-comparison logic is a pure function — unit-testable
  without a browser. The duckdb-wasm/Leaflet integration itself is browser-only and not
  practically unit-testable (same as bankql) — verified live instead: start the dev
  server, confirm parcels render as real polygons on the map, confirm the streams layer
  renders, click a parcel, confirm the side panel shows real card data for the right PIN.

## Global Constraints

- `boundary` follows the exact same `Field<T>` shape (value/provenance/vintage) as every
  other card field — no special-casing geometry as "not really a measurement."
- No new backend/server process. The viewer is a fully static site; all querying happens
  client-side via duckdb-wasm.
- No verdict, score, rank, or judgment-encoding filter anywhere in the viewer — see "What
  this is not."
- `packages/schema` remains the single source of truth for the card shape; `apps/viewer`
  imports types from it rather than redefining them, same as `apps/etl` already does.
