# Blue Ribbon Corridor Store — Design

**Status:** approved by user, section by section, 2026-08-29. Supersedes the earlier framing
of this work as "MCP server first" — see `04_ARCHITECTURE_MCP.md`'s tool sketch, which this
spec deliberately does not build yet (see Scope).

**Spec:** this file. **Plan:** to be written next via `superpowers:writing-plans`.

## Goal

Populate a local DuckDB + Parquet store with real, validated `CardDef` cards for every
vacant-land-relevant parcel within 1km of a Lower Peninsula Blue Ribbon trout stream, across
the 3 counties this repo currently has adapters for (Osceola, Iosco, Roscommon). Along the
way, produce a byproduct list of which other counties the LP Blue Ribbon streams pass
through — the "todo list" for future county adapters.

## Why this instead of the MCP server

The user's read, and the one this spec follows: `get_parcel_card` / `list_layers` /
`describe_layer` / `explain_field` need no new data infrastructure (they're covered by
`apps/etl`'s existing single-PIN pipeline and `packages/schema`'s static `LAYER_REGISTRY`).
But `query_data` / `find_parcels` / `check_coverage` need a real, populated multi-parcel
store — and "all vacant parcels in 3 counties" is an arbitrary, oversized universe with no
connection to why this repo exists. **The actual universe is: parcels near the water that
made this project worth building.** Building that universe is valuable on its own
(loadable into a map, queryable by hand in DuckDB) even before any MCP tool sits on top of
it — which is also why the user flagged that the eventual "front door" for this data might
be a map (Leaflet/Mapbox) rather than an MCP server. Neither the MCP server nor a map
viewer is in scope for this spec; both are explicitly deferred.

## Scope

**In scope (this spec, sub-projects A/B/C):**
- Resolve real stream geometry for the 49 Lower Peninsula Blue Ribbon trout streams listed
  in `03_BLUE_RIBBON_STREAMS.md`, disambiguated by county (not a blind statewide name
  search — that already produced one false positive earlier in this project).
- 1km buffer around each resolved stream geometry, computed in a metric CRS.
- Extend the 3 existing county adapters (Osceola, Iosco, Roscommon) with a server-side
  spatial "parcels intersecting this polygon" query, alongside their existing single-PIN
  `fetchParcel`.
- Run the existing single-parcel derive pipeline (the same code `runParcelEtl` already
  uses) against every candidate parcel found, and persist the resulting cards to a local
  DuckDB file + Parquet export.
- A resumable batch runner (skip parcels already in the store).
- As a byproduct: compute which other Michigan counties the 49 LP streams pass through
  (using the state's own County boundary layer), to seed the next county-adapter todo list.

**Out of scope (deferred, not part of this plan):**
- The MCP server itself (sub-project D from the earlier discussion) — `04_
  ARCHITECTURE_MCP.md`'s 7-tool surface.
- A map-based (Leaflet/Mapbox) viewer — raised by the user as a plausible next "front door"
  instead of MCP, but not designed or scoped here.
- Upper Peninsula Blue Ribbon streams (13 streams) — explicitly excluded this pass.
- Publishing/hosting the store anywhere (blob storage, a public endpoint) — stays local.
  `04_`'s own caveat #1 (no free statewide parcel layer, licensing unclear) means this
  decision is better made once there's something real to decide about.
- Real schema-driven DuckDB DDL generation from `packages/schema` (the architecture doc's
  eventual vision: one `DatasetDef` drives DDL, types, and everything else). This pass
  hand-writes DDL matching `CardDef`'s current shape instead.
- Building adapters for any county beyond Osceola, Iosco, Roscommon — the byproduct todo
  list is output, not acted on, this pass.
- Re-deriving "Blue Ribbon" status from USGS water quality data instead of the static seed
  list — noted by the user as a real eventual improvement, explicitly not this pass.

## Architecture

```
03_BLUE_RIBBON_STREAMS.md (LP rows)
        │  (transcribed once, by hand, into structured data)
        ▼
apps/etl/src/data/blue-ribbon-streams.ts   -- 49 {name, counties[]} records
        │
        ▼
apps/etl/src/fetch/blue-ribbon-geometry.ts -- per record: county bbox -> MiEnviro layer 1
        │                                      query -> match NHSStreamName -> geometry
        ▼
apps/etl/src/duckdb/buffer.ts              -- reproject to EPSG:3078, ST_Buffer 1km,
        │                                      reproject buffer back to WGS84
        ▼
counties/{osceola,iosco,roscommon}.ts      -- new fetchParcelsIntersecting(polygon)
        │                                      per adapter, reusing existing query patterns
        ▼
apps/etl/src/batch.ts                      -- for each candidate PIN not already in the
        │                                      store: run the existing derive pipeline,
        │                                      persist the card, resumable by PIN
        ▼
apps/etl/store/blue-ribbon-corridor.duckdb + .parquet   (gitignored)
```

Separately, non-blocking: `apps/etl/src/fetch/county-boundaries.ts` queries the state's
`County` FeatureServer (`services3.arcgis.com/dxRQUfTDNtfqZ301/.../County/FeatureServer/0`,
has a `Peninsula` field for the LP filter already used for scoping) to compute which
counties each resolved stream buffer intersects, and prints the byproduct todo list.

## Components

### A — Stream data + geometry resolution

**`apps/etl/src/data/blue-ribbon-streams.ts`**: the 49 LP rows from `03_`, transcribed as
`{ name: string; counties: string[] }[]`. Multi-segment rivers (Au Sable Main / North
Branch / South Branch / East Branch) are separate entries, matching the table's own
structure — each may need its own `NHSStreamName` match (verified per-stream during
implementation, not assumed).

**`apps/etl/src/fetch/blue-ribbon-geometry.ts`**: for each record, for each listed county,
fetch that county's bbox from the state `County` layer (already proven live), query
MiEnviro layer 1 within that bbox (reusing `fetch/mienviro.ts`'s existing `queryLayer`
pattern), and match `NHSStreamName` against the record's `name`. A record can resolve to
multiple line-segment features (a river usually isn't one single polyline record) — all
matching segments are kept and treated as one `MultiLineString` for the buffer step.

**Known open finding to verify during implementation, not resolved by this spec:** a bbox
query of Roscommon returned `South Branch Au Sable River` but no plain `Au Sable River`,
even though `03_`'s table lists Roscommon among the counties for Au Sable's Main segment.
Every one of the 49 records needs this same live verification before being trusted — the
implementation plan's tasks include this as explicit per-stream verification work, not a
one-time spot check.

### B — Buffer + per-county spatial parcel query

**`apps/etl/src/duckdb/buffer.ts`**: `bufferStreamGeometry(geometry, session): Promise<Polygon>`
— loads the resolved stream geometry into DuckDB, `ST_Transform` to `EPSG:3078` (Michigan
GeoRef — the CRS the state's own MCD/County/Township layers already use natively),
`ST_Buffer` by 1000 meters, `ST_Transform` back to `EPSG:4326`, returns the WGS84 buffer
polygon as GeoJSON.

**Per-adapter extension**: each of `osceola.ts`, `iosco.ts`, `roscommon.ts` gets a new
`fetchParcelsIntersecting(polygon: GeoJSON.Polygon): Promise<RawParcelFeature[]>`,
alongside the existing `fetchParcel(pin)`. Reuses each adapter's already-verified query
mechanics (Osceola/Roscommon: `f=geojson` with a `geometry`/`geometryType=esriGeometryPolygon`
param; Iosco: through the FetchGIS proxy with the native-SR reprojection already built) —
just a different `where`/`geometry` clause, same endpoints, same headers, same parsing.

**No property-class (vacant-vs-developed) filter at this stage, deliberately.** Osceola and
Roscommon's FeatureServers carry a property-class field (`PROPCLASS`, `Parcel_Cla`), but
Iosco's does not — it's only available through a separate per-parcel lookup (`PSsearch2.php`),
which would defeat the point of a cheap discovery-stage filter. Rather than filter
inconsistently across counties, `fetchParcelsIntersecting` returns every parcel the buffer
touches, developed or not. The 1km buffer around named streams already narrows the universe
by orders of magnitude versus a full county; "is this parcel vacant" stays a card-level
question (already partially visible via `identity` and future fields), not a discovery-time
exclusion. This mirrors rule 3's own worked example: filtering the candidate set on anything
beyond the stream corridor itself risks silently dropping a parcel this repo would want to
see.

### C — Batch derive + store

**`apps/etl/src/batch.ts`**: `runBlueRibbonCorridorBatch(): Promise<BatchSummary>`.
For each of the 3 counties: resolve its Blue Ribbon streams (A), buffer them (B), call
`fetchParcelsIntersecting` to get candidate PINs, then for each PIN not already present in
the store, run the same derive pipeline `runParcelEtl` already calls internally (fetch +
DuckDB spatial + `deriveCard`) and insert the resulting card's flattened row. Resumability:
before processing a PIN, check whether it already has a row in the store; skip if so. A
summary return value reports counts (candidates found, cards written, cards skipped,
failures) for visibility into a long-running batch.

**Store schema**: a hand-written DuckDB table matching `CardDef`'s current shape, one row
per parcel, each `Field<T>` flattened to four columns: `{field}_value`,
`{field}_provenance`, `{field}_vintage_as_of`, and `{field}_vintage_note` (nullable —
`Vintage.note` is optional on every field, not just some, so every flattened field gets the
same four columns; most rows will have a null note). Written to
`apps/etl/store/blue-ribbon-corridor.duckdb` and exported to a sibling `.parquet` file. The
`store/` directory is gitignored — this is derived, re-runnable output, not source.

### Byproduct — county todo list

**`apps/etl/src/fetch/county-boundaries.ts`**: queries the state `County` FeatureServer,
filtered to `Peninsula = 'Lower'`. For each resolved+buffered stream (from A/B), reports
which counties its buffer polygon intersects. Diffing that against the 3 counties with
adapters today produces the todo list — printed as part of the batch run's output, not
persisted anywhere new.

## Testing

- Offline unit tests: `blue-ribbon-streams.ts` data shape, name-matching logic in
  `blue-ribbon-geometry.ts` (mocked responses), buffer math in `buffer.ts` (verified against
  a known-good DuckDB computation the way every other geometry formula in this repo has
  been), and each adapter's new `fetchParcelsIntersecting` request-building (mocked
  network, mirroring the existing `fetchParcel` test pattern).
- One real integration test: run the full batch pipeline end-to-end for a deliberately
  small slice — Osceola's Middle Branch River only (the one stream this repo already has
  hand-verified ground truth for, via N 20th Ave) — asserting real candidate parcels are
  found and real cards are written to a scratch store, without attempting all 49 streams ×
  3 counties in a single test run.

## Global constraints carried into the plan

- Reuse existing verified formulas and query patterns exactly (the equirectangular area
  formula, the EPSG:3078 buffer CRS, each adapter's existing fetch mechanics) — do not
  re-derive anything already proven working in this repo.
- Every new per-stream name match is verified live during implementation, not assumed from
  the 3-county spot check in this spec.
- `store/` is gitignored; nothing in this sub-project publishes or uploads data anywhere.
