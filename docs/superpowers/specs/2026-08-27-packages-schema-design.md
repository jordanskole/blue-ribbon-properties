# packages/schema — design spec

*2026-08-27. Architectural path (superpowers:brainstorming). This is the load-bearing package
per `04_ARCHITECTURE_MCP.md` — everything else (DuckDB DDL, Parquet output, TypeScript row
types, MCP tool descriptions, LLM prompts) derives from it. v1 scope only; see "Deferred" at
the end for what's deliberately out.*

---

## Decisions made in brainstorming, and why

1. **Strictly per-parcel. No `property_id` grouping concept.** N 20th Ave is 3 PINs under one
   owner (`05_SPIKE_FINDINGS.md`), and grouping them is itself a judgment call — whose
   ownership counts, what counts as contiguous — which cuts against `start-here.md` rule 3
   ("filter only on the universe, never on judgment"). The parent project already assembles
   property files from multiple parcels by hand; this repo's primary key stays one PIN, one
   card, always.
2. **v1 field scope = identity + Tier A (A1–A4) + a new A5.** `01_`'s Tier B/C/D (zoning,
   access, counterweights, price) are real but unvalidated by the spike — deferred, not
   dropped. Tier A is "the thesis" per `01_` and is what the spike actually proved queryable.
3. **A5 — topographic prominence, added in this design.** Distinct from A3 (envelope-to-water
   relief): answers "is the high ground actually high, or just high relative to the water next
   to it." Cheap from the same DEM source as A3. Not yet in `01_` — should be added there
   alongside A1–A4 once this spec is approved.
4. **Provenance and vintage are a nested struct per field**, not flat sibling columns or an
   EAV side-table. DuckDB/Parquet both handle typed struct columns natively; this keeps
   `dry_acres.value` typed and queryable while co-locating the metadata that makes the value
   trustworthy or not.
5. **A2/A3/A5 share one geometry**: the "building envelope" is defined as *the highest-
   elevation point inside the parcel's dominant dry-soil polygon* — the same polygon A2
   already computes for `dry_acres`. A3 measures relief from that point to the nearest point
   on the water feature's own geometry. A5 measures it against a DEM-sampled neighborhood
   mean. No separate, undefined "building envelope" guess per criterion.
6. **DEM sampling is a local raster read, not point-by-point USGS EPQS.** The spike found
   EPQS too flaky for even a single 12-point transect (2 of 12 points dropped, multi-minute
   runtime with retries). Production ETL downloads a USGS 3DEP tile per AOI and samples
   locally.

---

## Shared types

```ts
type Provenance = "verified" | "aggregator" | "listing claim" | "inferred";
type VintageSourceType = "static" | "periodic" | "continuous" | "manual-confirmation";

interface Vintage {
  as_of: string;              // ISO date
  source_type: VintageSourceType;
  note?: string;
}

interface Field<T> {
  value: T | null;            // null is data (start-here.md rule 3), not an error
  provenance: Provenance;
  vintage: Vintage;
}
```

**Provenance values, concretely, for this repo's actual sources** (not the parent project's —
see `00_`'s "Provenance convention," reused verbatim for shared vocabulary):

- `verified` — a primary agency record with no computation in between: a PIN/acreage off a
  county FeatureServer, EGLE's own `TemperatureGradient` on a stream reach, a Wellogic `SWL`
  as filed by the driller.
- `inferred` — this pipeline computed it from primary data: `dry_acres` from an SSURGO polygon
  clip, `relief_envelope_to_water_ft` from a DEM read, `groundwater.flowing_wells_nearby` from
  a spatial proximity query. Most of Tier A, by construction.
- `aggregator` — real, not hypothetical: the spike found Missaukee has no free county parcel
  layer. If a parcel's geometry there comes from Regrid instead, that geometry is
  `aggregator`, and anything computed from it inherits the weaker of its inputs' provenance —
  the schema doesn't chain two tags on one field, it collapses to one. **Explicit ranking,
  strongest to weakest: `verified` > `inferred` > `aggregator` > `listing claim`.** A field
  computed from a `verified` parcel boundary and an `inferred` DEM read is itself `inferred`
  (the weaker of the two); the same computation over an `aggregator` parcel boundary is itself
  `aggregator` (weaker still) — never `inferred`, even though the *method* used to compute it
  is identical, because the input this repo can least vouch for sets the ceiling.
- `listing claim` — never emitted by this pipeline (no listings touched). Kept in the enum for
  vocabulary parity with the parent project's cards, which do use it.

---

## `ParcelIdentity`

```ts
interface ParcelIdentity {
  parcel_id: string;     // PIN, the join key — e.g. "10-003-013-20"
  county: string;
  township: string;
  acres: Field<number>;  // wrapped: the spike found 3 disagreeing numbers for one PIN
                          // (Redfin 4.5 / Regrid ~4.5 / county FeatureServer 3.755)
}
```

`parcel_id`/`county`/`township` are plain strings, not wrapped — they're the lookup key, not a
measurement someone could reasonably disagree with once the county match is right. `acres` is
wrapped because the spike proved that's a live discrepancy risk on the exact parcel that
inspired this repo.

---

## `CardDef` v1 — Tier A fields

### A1 — Groundwater expression

`01_`: *"is the aquifer surfacing here?"* — a composite signal, not one field.

```ts
interface GroundwaterExpression {
  thermal_class: Field<
    "Cold stream" | "Cold transitional stream" | "Cold small river" |
    "Cold transitional small river" | "Cold transitional large river" | null
  >;                                    // MiEnviro layer 1, nearest reach touching the parcel
  designated_trout_stream: Field<boolean>;   // MiEnviro layer 32, Designated = 1
  flowing_wells_nearby: Field<{
    count: number;
    nearest_ft: number;
  } | null>;                            // Wellogic FLOWING='Y' within 0.5 mi of parcel centroid
}
```

`flowing_wells_nearby`'s 0.5 mi radius is a v1 default, not derived from anything — tighter
than the spike's exploratory 1.5 mi pass, loose enough to catch the same drift aquifer. Springs/
seeps and "pond with a year-round inlet," both named in `01_`'s A1 row, have no validated
source from the spike — **left out of v1 rather than guessed at**; `check_coverage` should
report them as not-yet-sourced, not silently omit them.

### A2 — Dry ground adjacent to wet amenity

`01_`: *"A2 is the whole search."* — the actual buy/no-buy sentence.

```ts
interface DryWetAdjacency {
  dry_acres: Field<number>;       // SSURGO area, drainage class well/somewhat-excessively-drained
                                    // AND no water table in profile (wtdepannmin null)
  wet_acres: Field<number>;       // parcel acres minus dry_acres
  dominant_dry_soil: Field<{
    series: string;               // e.g. "Kalkaska"
    dwelling_rating: string;      // e.g. "Not limited"
  } | null>;
  adjacent: Field<boolean>;       // does the dry polygon share a boundary with the water feature
}
```

Method proven in the spike: an area-weighted SSURGO clip via Soil Data Access
(`mupolygongeo.STIntersection` against the parcel polygon), which summed to within 0.01 ac of
the parcel's own recorded acreage on every parcel tested. **Not proven in the spike: which
specific parcel's soil numbers should read as ground truth for N 20th Ave** — the 93%-Kalkaska
and 66%-Au-Gres figures from the original write-up landed on different official parcels than
claimed, and that was never resolved (`05_SPIKE_FINDINGS.md`). The golden test below uses the
spike's own re-derived per-parcel numbers, not the disputed write-up figures — see Testing.

### A3 — Vertical margin (relief)

```ts
relief_envelope_to_water_ft: Field<number>;
```

Envelope = the highest-elevation point inside the parcel's `dry_acres` polygon (A2). Water =
the nearest point on the water feature's own geometry (NHD flowline / pond edge), not a
guessed straight-line transect. Read from a locally-downloaded DEM tile, not point-by-point
EPQS.

### A4 — Wetland footprint and position

```ts
interface WetlandFootprint {
  wetland_pct: Field<number>;                              // % of parcel, NWI ∪ hydric soils
  wetland_between_envelope_and_water: Field<boolean>;       // does wetland sit between the two
}
```

### A5 — Topographic prominence *(new; not yet in `01_`)*

```ts
prominence_ft: Field<number>;
```

Envelope elevation (same point as A3) minus the mean DEM elevation in a 1,000 ft radius
annulus around it. Positive = this parcel's high ground is genuinely high relative to its
surroundings, not just high relative to the adjacent water. Same DEM source as A3, same read.

---

## `LayerDef` registry — v1 sources

| id | Source | Geometry | `source_type` | Feeds |
|---|---|---|---|---|
| `egle_mienviro_1` | MiEnviro/MapServer/1, REST | polyline | `continuous` | A1 `thermal_class` |
| `egle_mienviro_32` | MiEnviro/MapServer/32, REST | polyline | `continuous` | A1 `designated_trout_stream` |
| `nwi_wetlands` | MiEnviro 38 / WrdOpenData 9, REST | polygon | `static` (2005) | A4 `wetland_pct` |
| `wellogic_county` | per-county shapefile ZIP download | point | `periodic` (per-county refresh) | A1 `flowing_wells_nearby` |
| `ssurgo_sda` | Soil Data Access, REST/T-SQL | polygon | `periodic` (survey-area vintage) | A2 all fields |
| `parcel_source` | per-county FeatureServer, or Regrid fallback | polygon | `continuous` (county) / `periodic` (Regrid) | `ParcelIdentity`, geometry backbone for A2/A3/A5 |
| `usgs_3dep_dem` | 3DEP tile, downloaded locally | raster | `static` (DEM epoch) | A3, A5 |

`parcel_source`'s provenance is `verified` when it's a county-run FeatureServer (Osceola,
Roscommon — confirmed free and public in the spike) and `aggregator` when it falls back to
Regrid (needed for counties like Missaukee, whose own layer is token-gated). This is a
per-county configuration, not a constant — the registry entry needs a per-county source list,
not one endpoint.

---

## Testing

**Golden-record test against N 20th Ave**, using the spike's own verified values, not the
disputed write-up figures:

| Assertion | Parcel(s) | Expected |
|---|---|---|
| `parcel_id` resolves | `10-003-013-20`, `10-003-009-00`, `10-003-008-00` | all three found via the Osceola FeatureServer |
| `acres.value` | each of the three | 3.755 / 3.167 / 10.421 (sum 17.34 ≈ `start-here.md`'s 17.37) |
| `thermal_class.value` | any (Middle Branch reach) | `"Cold stream"` |
| `designated_trout_stream.value` | any (Middle Branch reach) | `true` — verified live during this spec's self-review: MiEnviro 32, `GNISName = "Middle Branch River"`, `RegulationType = "Type 1"`, `Designated = 1` |
| `dry_acres` / soil mix | all three | the spike's **re-derived, official-geometry SDA clip** numbers (013-20: 42.6% Kalkaska / 32.0% Au Gres / 24.4% Evart / 1.1% Montcalm; 009-00: 89.7% Kalkaska / 9.6% Roscommon / 0.8% Au Gres; 008-00: 36.3% Carbondale / 31.7% Au Gres / 27.6% Kalkaska / 4.4% Roscommon) |

**⚠️ Do not "fix" the golden test to match the property write-up's 93%/66% figures.** Those
numbers came from hand-traced AOIs that don't spatially overlap the parcels they're attributed
to, and which side is actually wrong was never resolved (`05_SPIKE_FINDINGS.md`). The golden
test encodes what the pipeline's own method produces against official parcel geometry — that's
what the test is *for*: catching drift in the method, not matching a disputed number.

`relief_envelope_to_water_ft` and `prominence_ft` are **not** part of the golden test — the
spike's relief transect used the wrong line (a straight guess, not a real road-to-river path)
and never produced a trustworthy number to assert against. Add these once a correct transect
method has been run once, by hand, against N 20th Ave.

---

## Deferred (explicitly out of v1)

- Tier B (zoning, legal access, distance-to-amenity, power, septic, winter access, post
  bearing), Tier C (counterweights: Part 201, TMDL, upstream ag, dams, Natural Rivers,
  floodplain, easements), Tier D (price sanity) — real, unvalidated by this spike, next passes.
- `property_id` grouping — explicitly rejected for v1, not merely postponed; revisit only if a
  concrete need appears that per-parcel cards can't serve.
- Springs/seeps and "pond with year-round inlet" within A1 — no validated source yet.
- Missaukee-style counties needing a Regrid fallback for `parcel_source` — the `aggregator`
  provenance path is designed for this but not yet exercised against a real Regrid pull.
