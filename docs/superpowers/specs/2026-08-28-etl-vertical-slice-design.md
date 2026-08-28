# apps/etl — vertical slice design spec

*2026-08-28. Architectural path (superpowers:brainstorming). First of three planned
sub-projects (`04_ARCHITECTURE_MCP.md`'s own sketch, decomposed in brainstorming):
1. **This spec** — ETL vertical slice, one parcel end to end
2. ETL generalized — batch mode, the universe-filter funnel, many counties
3. MCP server — the 7 read-only tools over DuckDB + Parquet

Per `00_OBJECTIVE.md`: *"Do not build 3–7 before 1–2 returns something interesting."*
This spec is deliberately the smallest thing that proves the fetch → geometry → `CardDef`
loop actually works, checked against a case we already know the right answer to.*

---

## Decisions made in brainstorming, and why

1. **Geometry math runs in DuckDB, not in application code.** `04_ARCHITECTURE_MCP.md`
   already pointed this way ("DuckDB's spatial extension covers the geometry work") — this
   spec commits to it explicitly. TypeScript ETL code fetches raw data and orchestrates;
   every `ST_Intersects`/`ST_Area`/area-weighting computation is SQL against DuckDB's
   spatial extension. One geometry engine for the whole system — the same engine the
   `query_data` MCP tool will expose later, not a second stack that has to agree with it.

   **⚠️ Verified before writing the plan, and it changes what "compute area in DuckDB"
   actually means:** a throwaway probe (`@duckdb/node-api` 1.5.5, `spatial` extension)
   against N 20th Ave's real 013-20 polygon found that DuckDB spatial's own geodesic area
   functions — `ST_Area_Spheroid`, and `ST_Area` after `ST_Transform` to a projected CRS
   (EPSG:3857 or UTM 16N) — both return area **~8.4× too small** at this latitude (44°N)
   compared to the spike's already-proven 3.755 acres, while a *correct* result at the
   equator (same functions, tested independently) confirmed the functions aren't simply
   broken outright. Likely cause: an axis-order mismatch (EPSG:4326's formal axis order is
   lat/lon; GeoJSON and this pipeline's data are lon/lat), not chased down further since a
   working, verified alternative was found. **The verified, correct formula — confirmed to
   match the spike's proven acreage to within 0.02%** — is the same equirectangular
   approximation the spike's own Python code already used, translated to SQL:
   ```sql
   ST_Area(geom) * POWER(111320.0, 2) * COS(RADIANS(ST_Y(ST_Centroid(geom)))) / 4046.8564224
   ```
   (raw planar shoelace area in degree², × meters-per-degree² at the equator, × a per-row
   `cos(centroid latitude)` longitude-compression correction, ÷ m² per acre.) **Every area
   computation in this spec uses this formula, not `ST_Area_Spheroid` or `ST_Transform`.**
   This approximation is only valid at parcel scale (a few acres, sub-degree extent) — fine
   here, would need revisiting for anything spanning a wide latitude range.
2. **SDA's server-side clip is still used for *fetching*, not for *computing*.** SDA offers
   a clip (`mupolygongeo.STIntersection(...)`, the exact T-SQL the spike proved) specifically
   so ETL never has to download an entire county's unclipped soil polygons to look at one
   parcel — that's a bandwidth reality, not a geometry-engine exception. The clipped geometry
   SDA returns is loaded into DuckDB, and **DuckDB — not SDA's own `area_ac` column —
   computes the acreage** that ends up on the card. SDA does the *fetch-scoping*; DuckDB
   does the *math*.
3. **Scope is "reproduce the golden fixture's non-null values," not "fill in everything."**
   Target fields: `identity.parcel_id`, `identity.acres`, `groundwater.designated_trout_stream`
   (`true` on 008-00 only — real, nearby layer-32 geometry; `false` on the other two), and
   `dry_wet_adjacency`'s `dry_acres`/`wet_acres`/`dominant_dry_soil` (all three parcels).
   **`groundwater.thermal_class` is `null` on all three parcels** (corrected 2026-08-28 —
   the original claim of `"Cold stream"` on 008-00 was a name match on a different, distant
   reach; MiEnviro layer 1 genuinely has no coverage near this parcel) — the ETL query still
   needs to run the `ST_Intersects` check against layer 1, it should just correctly find
   nothing here, which is itself part of what this vertical slice needs to get right.
   Everything else the spike left `null` (`flowing_wells_nearby`,
   `relief_envelope_to_water_ft`, `wetland_pct`, `wetland_between_envelope_and_water`,
   `adjacent`, `prominence_ft`) stays `null` in this pass — those each need a method the
   spike never finished (a corrected road-to-river transect, a wetland overlay, a
   polygon-touch test, a per-parcel well-distance calc), and solving four new methods in the
   same pass as proving the DuckDB-spatial approach would turn a vertical slice into a
   second architectural project.
4. **The acceptance test is the golden fixture already in `packages/schema`.** No new
   "expected values" get invented for this spec — the pipeline's output on N 20th Ave's
   three real parcels must equal `packages/schema/test/golden/n20th-ave.fixture.ts`'s
   non-null fields. That fixture is the one place in the repo we already know is right.
5. **Parcels get a per-county adapter harness now, even though only one adapter (Osceola)
   is registered in this pass.** Parcels are the one source that's genuinely per-county —
   the spike found Osceola and Roscommon both have free public FeatureServers, but with
   *different field names* for the same concepts (Osceola: `PIN`/`OWNER`/`PROPADD`;
   Roscommon: truncated shapefile-style `c_Parcel_P`/`ParcelMast`), and Missaukee's is
   token-gated, needing a fallback entirely. Building `fetch/parcels.ts` as one
   Osceola-shaped function now would mean rewriting it the moment a second county shows
   up. Instead: a `counties/` registry, mirroring `packages/schema`'s own
   `LAYER_REGISTRY` pattern (a lookup keyed by name, same "typed registry +
   get-with-a-clear-error" shape as `getLayer()`). Adding a county later is "write an
   adapter, register it," not "modify the fetch code." **Only Osceola is registered
   in this spec** — Roscommon (already spike-validated, different field names, a good
   second case to prove the harness against) and Oscoda (a newly-relevant target parcel,
   but with no parcel source found yet and no ground-truth facts to check output
   against) are both sub-project 2's job, each earning its own ground-truth check the
   way Osceola earned N 20th Ave's, before being trusted.

---

## Package layout

```
apps/etl/
  package.json, tsconfig.json, vitest.config.ts
  src/
    counties/
      types.ts        — CountyParcelAdapter interface:
                          { county: string,
                            fetchParcel(pin: string): Promise<RawParcelFeature>,
                            normalize(raw: RawParcelFeature): NormalizedParcelRecord }
                         NormalizedParcelRecord = { pin, county, township, acres,
                          geometry } — the one shape every adapter must produce,
                          regardless of what its source calls these fields.
      osceola.ts        — the one adapter this pass registers: Osceola's FeatureServer
                           URL + field names (PIN/OWNER/PROPADD/PROPCLASS/UNIT),
                           implements fetchParcel + normalize
      registry.ts         — COUNTY_REGISTRY: county name → adapter, and
                              getCountyAdapter(county) — same lookup-with-a-clear-error
                              shape as @brp/schema's getLayer()
    fetch/
      mienviro.ts    — MiEnviro layers 1 & 32 (bbox-filtered fetch; NOT the final
                         intersects test — that runs in DuckDB per decision 1)
      ssurgo.ts        — SDA fetch: clipped soil polygons for the parcel AOI, plus
                           component drainage-class/water-table data per mukey
      parcels.ts         — thin: getCountyAdapter(county).fetchParcel(pin) →
                             .normalize(raw) → a NormalizedParcelRecord. Never
                             touches county-specific field names itself.
    duckdb/
      load.ts               — `@duckdb/node-api` (verified working; the older `duckdb`
                                npm package's native binding failed to load on this
                                environment's Node version). Open an in-memory
                                `DuckDBInstance`, `INSTALL spatial; LOAD spatial;`,
                                register fetched GeoJSON as tables via
                                `ST_GeomFromGeoJSON($1::VARCHAR)` on a parameterized `run()`
      compute.ts              — the spatial SQL queries (see below) — all area math uses
                                 the verified formula from decision 1, never
                                 `ST_Area_Spheroid`/`ST_Transform`
    derive.ts                  — assemble one CardDef from compute.ts's results,
                                   attach provenance/vintage per LAYER_REGISTRY,
                                   call validateCard from @brp/schema
    index.ts                    — runParcelEtl(pin: string, county: string):
                                   Promise<CardDef> — orchestrates one parcel end to end
  test/
    counties/
      osceola.test.ts     — unit tests: does osceola.ts's normalize() correctly map
                              raw PIN/OWNER/PROPADD/UNIT fields to a
                              NormalizedParcelRecord (no network)
      registry.test.ts      — unit tests: getCountyAdapter("Osceola") resolves;
                                an unregistered county throws a clear error
    fetch/
      mienviro.test.ts   — unit tests against recorded fixture responses (no network)
      ssurgo.test.ts       — same
      parcels.test.ts       — same (mocks the adapter, doesn't hit a real county)
    duckdb/
      compute.test.ts        — unit tests against small hand-built DuckDB tables
                                 (no network) — proves the SQL logic in isolation
    derive.test.ts              — unit test: given known compute.ts outputs, does
                                    derive.ts assemble a valid CardDef with correct
                                    provenance/vintage tags
    integration/
      n20th-ave.test.ts          — the real thing: runs runParcelEtl() against the
                                     three live N 20th Ave PINs over the real network,
                                     asserts the result's non-null fields equal
                                     packages/schema's golden fixture. Separate npm
                                     script (test:integration), not part of the
                                     default `npm test` — depends on live government
                                     API reachability, shouldn't block a normal run.
```

`apps/etl` depends on `@brp/schema` (the `packages/schema` workspace member) for
`CardDef`, `Field<T>`, `LAYER_REGISTRY`, `validateCard`. **This is the first real consumer
of `packages/schema`**, so this spec also has to close the workspace-wiring gap the final
review on that package explicitly deferred: a root `package.json` with an `npm workspaces`
field listing `packages/*` and `apps/*`, so `apps/etl` can `import` from `@brp/schema` by
package name rather than a relative path across package boundaries.

---

## Data flow, one parcel

```
runParcelEtl("10-003-008-00", "Osceola")
  │
  ├─ fetch/parcels.ts   → getCountyAdapter("Osceola") → osceola.ts's fetchParcel +
  │                        normalize → a NormalizedParcelRecord with WGS84 geometry
  │                        (query by Twp/Sec/ID, same pattern the spike proved;
  │                        adapter-internal, parcels.ts itself never sees PIN/OWNER/etc)
  │
  ├─ fetch/mienviro.ts  → layer-1 features + layer-32 features within the parcel's
  │                        bbox (small buffer), f=geojson. NOT filtered to "intersects
  │                        the parcel" server-side — that's decided in DuckDB.
  │
  ├─ fetch/ssurgo.ts    → SDA: (a) the spike's clip T-SQL (mupolygongeo.STIntersection
  │                        against the parcel WKT, on the `mupolygon` table) → clipped
  │                        soil polygons as WKT, one row per mukey/segment — this single
  │                        query enumerates the relevant mukeys as a byproduct, no
  │                        separate mukey-list call needed first; (b) a join query
  │                        against mapunit/component for muname/compname/drainagecl/
  │                        comppct_r/wtdepannmin, keyed to whichever mukeys came back
  │                        from (a), majcompflag='Yes'
  │
  ├─ duckdb/load.ts     → INSTALL spatial; LOAD spatial; register all of the above as
  │                        DuckDB tables via ST_GeomFromGeoJSON($1::VARCHAR) on a
  │                        parameterized con.run() (@duckdb/node-api)
  │
  ├─ duckdb/compute.ts  → three queries:
  │     thermal_class          = SELECT TemperatureGradient FROM mienviro_1
  │                               WHERE ST_Intersects(geom, parcel_geom) LIMIT 1
  │     designated_trout        = EXISTS(SELECT 1 FROM mienviro_32
  │                               WHERE ST_Intersects(geom, parcel_geom)
  │                               AND Designated = 1)
  │     dry_wet_by_mukey         = SELECT mukey,
  │                               ST_Area(geom) * POWER(111320.0, 2) *
  │                               COS(RADIANS(ST_Y(ST_Centroid(geom)))) / 4046.8564224
  │                               AS acres
  │                               FROM ssurgo_polygons GROUP BY mukey, geom
  │                               (the verified formula from decision 1 — NOT
  │                               ST_Area_Spheroid; joined against the component
  │                               table's drainagecl to classify each mukey dry/wet
  │                               per the A2 rule: "well-drained or
  │                               somewhat-excessively-drained AND no water table in
  │                               profile" = dry, else wet)
  │
  └─ derive.ts          → sum dry_wet_by_mukey by classification → dry_acres/wet_acres;
                           dominant_dry_soil = the dry-classified mukey with the largest
                           area, its component's muname + a dwelling-rating lookup;
                           assemble CardDef, attach provenance (verified for parcel
                           geometry/identity, inferred for everything computed) and
                           vintage (as_of = fetch time, source_type from LAYER_REGISTRY);
                           validateCard(card) — throw if it returns any errors.
```

---

## The dwelling-rating lookup

`dominant_dry_soil.dwelling_rating` needs a string like `"Not limited"` — this comes from
SDA's `cointerp` table (the same one explored in the spike, `mrulename LIKE
'%dwelling%without%basement%'`), joined against the dominant dry component's `cokey`. This
is a third SDA query beyond the two in `fetch/ssurgo.ts` above — folded into that same
module rather than a separate file, since it's still "get me SSURGO facts for this AOI,"
not a new source.

---

## Testing strategy

- **Unit tests** (`test/fetch/*.test.ts`, `test/duckdb/compute.test.ts`, `test/derive.test.ts`)
  run offline, against recorded/hand-built fixtures — fast, part of `npm test`, catch logic
  bugs without depending on network or government API uptime.
- **One integration test** (`test/integration/n20th-ave.test.ts`) runs the real pipeline
  against the real network for all three N 20th Ave parcels, and is the actual proof this
  spec exists to produce. Separate `npm run test:integration` script. Failure here means
  either the method is wrong or a live source changed shape — worth knowing immediately,
  but not something that should block every routine `npm test` run on a flaky government
  endpoint.
- **The integration test's assertions** compare against `@brp/schema`'s
  `n20th-ave.fixture.ts` directly (import it, don't re-type the numbers) — so if that
  fixture is ever corrected (e.g. the still-open AOI/PIN mislabeling question from
  `05_SPIKE_FINDINGS.md` gets resolved), this test picks up the correction automatically
  rather than drifting from a second copy of the same numbers.

---

## What this spec does NOT cover (explicitly deferred)

- Wellogic fetch (`flowing_wells_nearby`) — out of scope per decision 3, no wells needed
  for this pass.
- Relief (`relief_envelope_to_water_ft`), prominence (`prominence_ft`), wetland
  (`wetland_pct`, `wetland_between_envelope_and_water`), adjacency (`adjacent`) — same,
  each needs a method not yet proven correct.
- Any county adapter besides Osceola, any parcel besides N 20th Ave's three — that's
  sub-project 2 (ETL generalized). **Two specific counties are already known to be next:**
  Roscommon (spike-validated free FeatureServer, different field names — a good second
  adapter to prove the harness against) and Oscoda (a newly-relevant target parcel, but
  needs its own source discovery and its own ground-truth check first — nothing to build
  an adapter against yet, and no known-right-answer facts to test output against).
- Writing to Parquet / any published output format — this pass ends at an in-memory
  `CardDef`, validated and compared to the fixture. Publishing is also sub-project 2's
  concern, once there's a real multi-parcel batch worth publishing.
- The MCP server — sub-project 3, depends on this and sub-project 2 existing first.
