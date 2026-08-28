# 05 — Spike Findings

*Run 2026-08-27. This is a spike, not a build: no `packages/`, no `apps/`, throwaway scripts in
`scratch/` only. The deliverable is this document. Everything below was queried live against
public endpoints on 2026-08-27 unless noted.*

---

## Bottom line, up front

| Question | Verdict | Detail |
|---|---|---|
| **1. Does MiEnviro layer 1 collapse funnel stages 0–1?** | ✅ **Yes — much broader.** | ~17,400 mi statewide vs. ~850 mi Blue Ribbon (~20×). `03_` demotes to a validation set. |
| **2. Is the Wellogic artesian hypothesis real?** | ⚠️ **Partially.** | Flowing wells ARE a real, flagged, queryable signal. The *magnitude/interpolation* idea in `00_` is not supportable from this field — SWL is floored at zero. Coordinate quality is the dominant risk, exactly as feared. |
| **3. Parcel reality check (2–3 counties)** | ⚠️ **Mixed, workably positive.** | Osceola and Roscommon both have free, public, no-auth ArcGIS parcel layers with real geometry. Missaukee's is token-gated. Regrid's ToS confirms geometry cannot be republished without written approval — Difference #1 is real. |
| **Ground truth (N 20th Ave)** | ⚠️ **1 of 4 clean, 1 open discrepancy, 2 not reproduced.** | Parcel count (**3**, not 2 — 013-20 + 009-00 + 008-00 = 17.34 ac ≈ 17.37) checks out cleanly. The 93%/66% soil percentages are real numbers from real hand-traced AOIs, but they land on different official parcels than the write-up says — unresolved, not fixed, see ⚠️⚠️ below. The 14-ft relief figure genuinely didn't reproduce, likely a bad transect line, not bad geology. **The "coldwater reach" claim also didn't reproduce, and was wrongly marked as reproduced in the original pass** — corrected 2026-08-28 after the ETL design work caught it: layer 1 has zero real coverage near this parcel, the original check was a name match, not a spatial one. Layer 32's designated-trout-stream status does hold up independently. |

**None of the three questions came back hard-negative**, so nothing here stops the funnel.
**The most important finding turned out to be architectural, not statistical: N 20th Ave is
not one parcel, it's three.** Chasing that down also surfaced a real, still-open discrepancy —
the 93%-Kalkaska and 66%-Au-Gres soil AOIs, traced by hand in Web Soil Survey, sit on different
official parcels than the write-up attributes them to. **This wasn't fully resolved — see the
honest caveat in the ⚠️⚠️ section** — but a per-parcel pipeline with automated geometry
cross-checks is exactly the tool that would surface a mismatch like this instead of missing it.
See the design note right after this table.

### ⭐ Open question surfaced by this spike, not by the three questions

**Not a design decision — an open question this spike surfaced and didn't answer: does the
schema need a concept above `parcel`, or does it stay strictly per-parcel?** N 20th Ave (the
example that inspired the whole repo) is 3 PINs under one owner, not 1, and
`01_VACANT_LAND_CRITERIA.md` currently frames the card as one-per-parcel (`"One card per parcel
in the universe"`, single `Parcel ID` field in its worked example). Two real options, not one
obvious answer:

1. **Stay strictly per-parcel.** Emit a card per PIN, always. Grouping same-owner contiguous
   parcels into "a property" is itself a judgment call — which owner, how contiguous is
   contiguous, does a shared driveway easement count — and rule 3 in `start-here.md`
   ("filter only on the universe, never on judgment") is arguably about exactly this kind of
   line-drawing. The parent project, which already has the concept of a listing/property file,
   may be the right place for that rollup, not this repo.
2. **Add a grouping concept** (`property_id` or similar) so a human doesn't have to manually
   reassemble "17.34 ac total, dry ground on one parcel, wet amenity on another, contiguous"
   from three disconnected cards. The counter-argument to option 1: without it, this exact
   property — the one that motivated the repo — never appears as one legible thing anywhere in
   the output.

**Flagging this as a question for `01_`/`04_` to resolve deliberately, not defaulting into
either answer.**

---

## 1. MiEnviro layer 1 vs. layer 32 vs. the Blue Ribbon list

**Layer 1 — Cold/Cold Transitional Streams** (`EGLE/MiEnviro/MapServer/1`):

- **14,520 polyline features statewide**, sum length **27,967,130 m ≈ 17,381 miles**.
- **Real thermal classification field, not just a name.** `TemperatureGradient` has 5 values:
  `Cold stream`, `Cold transitional stream`, `Cold small river`, `Cold transitional small
  river`, `Cold transitional large river`. This is a genuine EGLE fisheries classification,
  not a cosmetic label.
- At least **1,000 distinct named streams** (hit the server's default page cap on a `GROUP BY`
  query — the true count is higher; did not paginate further, out of scope for the spike).
- Other fields: `NHSStreamId`, `NHSStreamName`, `ReachCode`, `ReachType` (StreamRiver /
  ArtificialPath / Connector / CanalDitch / Coastline).

**Layer 32 — Designated Trout Stream** (`EGLE/MiEnviro/MapServer/32`):

- 77,310 raw features; 76,378 where `Designated = 1`.
- ⚠️ **Length comparison is unreliable as queried.** Summing `Shape.STLength()` gives
  49,312,392 m ≈ 30,644 mi — i.e., *longer* than layer 1, which looked backwards until a
  `groupByFieldsForStatistics=ReachCode` check showed heavy duplication: some `ReachCode`
  values repeat **up to 71 times** (multiple `RegulationType`/`StreamType1`/`StreamType2`
  records stacked on the same physical reach — e.g. a Great Lakes tributary rule layered on a
  Type designation). **A real length comparison needs a dissolve-by-geometry step, which is a
  GIS operation this spike's toolchain (curl + dbfread, no GDAL/geopandas) doesn't have.**
  Treat the "layer 32 is broader" number as an artifact, not a finding.

**The Blue Ribbon list** (`03_`): 62 streams, ~850 miles (49 LP + 13 UP, per that file's own
count).

**The number that matters:** layer 1's ~17,381 mi is **~20× the Blue Ribbon list's ~850 mi**.
That is not "barely broader" — it's a different search geography. Per `03_`'s own decision
rule: **the Blue Ribbon list demotes to a seed/validation set, and the real search runs against
layer 1.**

**Ground truth — corrected 2026-08-28, this was wrong as first written:** the original claim
here ("the Middle Branch River is in layer 1, classified `Cold stream`") came from a **name
match, not a spatial one**. Michigan has exactly one "Middle Branch River" entity in layer 1
statewide (`NHSStreamId 00632240`), and its full 6-segment extent (lat 44.079–44.120) never
comes within ~2.8 miles of N 20th Ave (lat ~44.068) — confirmed via a multi-km bbox spatial
query returning zero features, then an exhaustive per-`NHSStreamId` check ruling out a
partial-listing artifact. **Layer 1 has no coverage of this reach at all.** Layer 32
(Designated Trout Stream) *does* have real, nearby geometry here (lon -85.113 to -85.147, lat
44.056 to 44.077) — that part of the original ground-truth check was right; the two EGLE
layers simply don't have matching coverage. This was caught while designing the ETL pipeline's
spatial-intersection queries, not by re-running this section — a name-match check should
never have been treated as a spatial one in the first place. `packages/schema`'s golden
fixture and its test were corrected to match (`thermal_class: null` for parcel 008-00,
`designated_trout_stream: true` unchanged).

**What didn't work:** no county attribute exists on layer 1, so "which counties does this
broader footprint touch" requires a spatial intersection against county boundaries, which
wasn't done — county selection for Q3 below is a **heuristic choice** (prior-work overlap from
`03_`'s own table), not a rigorous "top N counties by layer-1 mileage" ranking. Flagging this
so it isn't mistaken for a completed analysis.

---

## 2. The Wellogic artesian hypothesis

Pulled the real Osceola County download (`Osceola_WaterWells.zip`, from
`https://www.deq.state.mi.us/gis-data/downloads/waterwells/Osceola_WaterWells.zip`, linked off
the county-download page — **that page 403s without a browser User-Agent header**, first thing
that didn't work). It's a full shapefile (points), not just a table — geometry included.
**8,941 well records.**

### Static water level — real field, but the datum floors at zero

`SWL` = "Depth of Static Water Level (in feet)" — **depth below grade**, not an elevation.
Observed range: **0.0 to 9999.99**. 9999.99 is a missing-data sentinel, not a real depth (two
`FLOWING='Y'` records literally carry `SWL=9999.0`, which is obviously not a real static level
for a flowing well). **`SWL` never goes negative in this county's data** — it appears to be
floored at zero, not a signed depth-above/below-grade value.

### Flowing wells — an explicit flag, not an inferred sign

`FLOWING` is a real Y/N/U field: **401 `Y`, 8,170 `N`, 363 `U` (unknown), 7 blank**, out of
8,941. Almost all `Y` records carry `SWL = 0.0` (a handful carry the `9999` sentinel instead of
a real value). **So: flowing wells are identifiable, and it's a flag, not a sign convention on
depth** — which answers `00_`'s open question directly, but also **narrows the hypothesis**:
because `SWL` floors at 0, you cannot recover *how far above grade* the potentiometric surface
sits. The binary "this well flows" signal is real. The **magnitude surface** `00_` describes
("interpolate those points and you have a map of artesian *potential*" — implying a gradient,
not just points) is not supportable from this field as collected. At best you get a point
layer of confirmed-flowing wells, which is still useful, just a smaller claim than the one in
`00_`.

### Coordinate quality — the risk flagged in `00_`/`02_` is real and dominant

`METHD_COLL` (how the lat/lon was collected), 8,941 records:

| Method | Count | % | What it means |
|---|---:|---:|---|
| `018` Interpolation–Map | 6,821 | **76.3%** | A point placed on a map by a person, not measured |
| `016` GPS, Std Positioning, SA off | 1,347 | 15.1% | Consumer-grade GPS |
| `001` Address Matching–House Number | 325 | 3.6% | Geocoded from the mailing address |
| `036` Quarter-quarter-quarter centroid | 63 | 0.7% | ~10-acre-cell precision at best |
| `019`/`020` Interpolation–aerial/satellite photo | 78 | 0.9% | |
| `027` Section centroid | 22 | 0.2% | ~1-mile-cell precision |
| `012`/`013`/`014`/`015`/`017` (other GPS grades) | 65 | 0.7% | |
| `UNK` / blank / other | ~220 | ~2.5% | |

**Real-GPS-derived total (any grade, codes 012–017): 1,552 records — 17.4%.** Everything else
(82.6%) is interpolated, address-matched, or centroid-snapped. **This is the dominant mode by
a wide margin**, not an edge case.

It compounds: `ELEV_METHD` (how the recorded `ELEVATION` field was derived) is blank for
**55.5%** of records, and where present, **96.6%** of those come from `014` = Topographic Map
Interpolation, not survey or GPS. So even where an elevation is on file, it's not
independently trustworthy — a DEM lookup at the well's (uncertain) coordinate is the only real
option, and that lookup inherits the coordinate's positional error.

**⚠️ Why this matters concretely:** on ground where the whole thesis is "a few feet of head
near a valley wall," a map-interpolated point can easily be off by a hundred-plus feet, and a
DEM sampled at the wrong point near a valley wall can be off by many times the vertical signal
being hunted. **This is very likely the dominant error source for the "join SWL to DEM"
pipeline**, worse than CRS or DEM resolution.

### Pre-2000 coverage — better than feared

`CONST_DATE` by decade (Osceola, n=8,941, 288 blank):

| Decade | Count | Decade | Count |
|---|---:|---|---:|
| 1960s | 226 | 2000s | 2,418 |
| 1970s | 1,131 | 2010s | 1,156 |
| 1980s | 1,140 | 2020s | 983 |
| 1990s | 1,591 | | |

**Pre-2000: 45.8%. Post-2000: 51.0%.** The readme's "virtually 100% since 2000" claim is about
completeness going forward, not exclusivity — pre-2000 wells are well represented here, at
least in this county. Encouraging; doesn't generalize to counties with weaker legacy digitization,
which wasn't checked.

### Ground truth — a real flowing well shows up right next to the target parcel

Searched all wells within 1.5 mi of the N 20th Ave centroid (44.067933, -85.127523): **105
wells.** Two records at **17169 N 20th Ave**, ~0.43 mi from the centroid, both dated 2003,
explicitly `FLOWING = 'Y'`, `SWL = 0.0` and `1.0` ft, `WELL_DEPTH = 112` ft, `AQ_TYPE = DRIFT`.
This is not confirmed to be the *same* well described in `00_` (that one is described as
"decades old"; this record is from 2003, filed by a driller) — but it's independent
corroboration that **the drift aquifer under positive head is a real, documented, and
locally-clustered phenomenon on this road**, not a one-off. ✅ Directionally reproduced.

### What didn't work

- `www.michigan.gov/egle/maps-data/wellogic/water-wells` returns **403 without a browser
  User-Agent** — trivial to work around, but note it for the ETL.
- No GIS tooling available in this environment (`ogrinfo`/`ogr2ogr` absent, no `geopandas`).
  Installed `dbfread` via pip to read the `.dbf` directly — works fine for tabular analysis,
  but reading the `.shp` geometry itself wasn't attempted since coordinates are already in the
  DBF as `LATITUDE`/`LONGITUDE` columns.
- Did not attempt the DEM join itself (out of scope for this pass) — the coordinate-quality
  finding above is a strong enough reason to treat that join's *output* skeptically before
  building it.

---

## 3. Parcel reality check

Selection of counties: **not** a rigorous "top-N by layer-1 mileage" (see §1 limitation).
Chose **Osceola** (ground truth county, deepest prior work per `03_`), **Missaukee**
(adjacent, prior-work overlap), and **Roscommon** (prior-work overlap, largest Blue Ribbon
mileage of the three) — the same trio `03_`'s "where the interesting overlap already is" table
already flags.

### ⚠️ First: a real gotcha worth logging in `02_`

**`osceola.org` / `gis.osceola.org` is Osceola County, FLORIDA** (Kissimmee area — confirmed
by its ArcGIS Portal's spatial reference, `NAD_1983_StatePlane_Florida_East`, and its dataset
list: Urban Growth Boundary, Transit Oriented Development Impact Fee Areas, etc.). **Osceola
County, Michigan's real site is `osceola-county.org`.** A naive search or scrape targeting
"Osceola County GIS" will silently return Florida data under a Michigan county's name. This
cost real time in this session and will cost more in an automated pipeline unless it's
hard-coded around.

### County-by-county

| County | Free public layer? | Access | Geometry | Property class field | Notes |
|---|---|---|---|---|---|
| **Osceola** | ✅ Yes | No auth, `Query` capability, `services8.arcgis.com/.../OsceolaCountyParcels_view/FeatureServer/0` | Polygon, real | `PROPCLASS` — **coarse text** (`"RESIDENTIAL"`), not MI's numeric 401/402 code | 21,622 parcels. **Ground-truth PIN and acreage reproduced exactly** — see below |
| **Missaukee** | ⚠️ Listed public, not actually usable | Item metadata says `access: public`; the `FeatureServer` itself returns `{"code":499,"message":"Token Required"}` | — | — | The county's own web viewer presumably injects a scoped key; there's no way to query this layer programmatically from outside without contacting the county |
| **Roscommon** | ✅ Yes | No auth, `Query` capability, `services3.arcgis.com/.../Roscommon_County_Map_WFL1/FeatureServer/0` | Polygon, real | **`ParcelFina` — actual numeric MI class code**, confirmed `402` on a sample record | 35,019 parcels. Field names are shapefile-truncated (`c_Parcel_I`, `ParcelMa_3`, etc.) and need a decode pass, but owner/mailing-address block and the numeric class code are both there |

**Two of three counties have a genuinely free, open, no-auth, full-geometry parcel layer.**
That's a materially better starting position than `04_`'s "no free statewide parcel layer
exists" framing implies at the county level — the statewide claim is still true (no single
source covers all 83 counties uniformly), but county-run ArcGIS Online orgs are a real,
underused channel, at least for two of these three.

### Regrid — the licensing question `04_` asked for directly

Confirmed via `regrid.com/terms/api`:

- **Tile/geometry data:** *"Customer may not (i) cache the Data or otherwise store Data
  offline without written approval from Company, or (ii) extract or process the Data,
  including parcel geometries in any derivative works other than the web and mobile
  applications."*
- **API/attribute records:** may be cached, but *"Customer must destroy all parcel records...
  upon termination."*
- **Derivative works of any kind require written approval and may cost extra.**

**This confirms Difference #1 exactly as `04_` worried: Regrid geometry cannot be republished
into this repo's public Parquet layer.** If Regrid is used at all, it has to be for counties
where a free county layer doesn't exist, and even then the geometry stays local / behind the
MCP server rather than getting republished to blob storage — attributes only, and even those
must be destroyed if the subscription lapses. **Pricing is not public** — the self-serve plans
page (`app.regrid.com/api/plans`) requires login to see tiers; a web search turned up no
concrete self-serve dollar figures, only "starting prices range from several hundred to
several thousand dollars monthly" from third-party commentary, unverified.

### What didn't work

- Regrid's actual price tiers — gated behind login, couldn't get concrete numbers without an
  account.
- BS&A wasn't tested directly this pass; `02_`'s existing note (CAPTCHA-gated, 403s
  automation) was taken as still current rather than re-verified.
- Didn't check a 4th/5th county — Crawford/Oscoda/Otsego/Montmorency (the "densest Blue Ribbon
  geography," per `03_`) remain unchecked. Worth doing before committing to Osceola/Roscommon
  as the actual build targets, since neither of those two was chosen by a rigorous mileage
  ranking (see §1).

---

## ⚠️⚠️ Ground truth: N 20th Ave — what reproduced and what didn't

**Revised after the user pointed out N 20th Ave is *three* parcels, not two, and provided the
original Web Soil Survey exports** (`wss_aoi_2026-08-25_12-54-45/55-58/56-39.zip`, from
`Property_MiddleBranchRiver_N20thAve.md`'s own working files). That third parcel and those
three original AOI shapefiles resolve the soil-percentage discrepancy below — it turned into
the single most useful finding in this document, but not the one first drafted.

**The third parcel: `10 003 008 00`**, same owner (SPRAGUE WILLIAM E), no site address on
file, **10.421 acres**. `013-20 (3.755) + 009-00 (3.167) + 008-00 (10.421) = 17.34 acres` —
matches `start-here.md`'s **"17.37 acres"** almost exactly. ✅ Confirms the property is a
3-parcel assemblage under one owner, geometrically contiguous (each pair shares an edge in the
official geometry).

Five claims to check, from GIS alone:

| Claim | Result |
|---|---|
| Middle Branch is a coldwater reach | ❌ **Not reproduced — corrected 2026-08-28.** Layer 1 has zero coverage near N 20th Ave (the original claim was a name match on a different, ~2.8mi-distant "Middle Branch River"). Layer 32's designated-trout-stream status *does* hold up on real nearby geometry — see the correction note above. |
| Parcel identity / geometry / count | ✅ **Reproduced exactly**, once the 3rd parcel was found — 3.755 + 3.167 + 10.421 = 17.34 ac ≈ 17.37 ac |
| ~93% Kalkaska on 013-20 / ~66% Au Gres on 009-00 | ⚠️ **The soil numbers are real** — ❌ **but the hand-traced AOIs carrying them don't spatially overlap the parcels the write-up attributes them to, per today's official parcel geometry.** See below — open, not resolved. |
| ~14 ft relief over 1,800 ft | ❌ **Not reproduced — transect line was wrong, see previous section, unchanged by this update** |

### The soil percentages — an open discrepancy, likely not a pipeline bug

The original write-up (`Property_MiddleBranchRiver_N20thAve.md`) is explicit about which AOI
export is which parcel: **AOI 1 (93.1% Kalkaska) = parcel 013-20**, **AOI 2 (66.3% Au Gres) =
parcel 009-00**, **AOI 3 (mixed, 62% wet) = parcel 008-00**. Loading the three actual
`.shp` AOI boundaries (`aoi_a_aoi.shp`, real hand-traced polygons, not a guess) and
intersecting each against the three **official** parcel polygons from Osceola's FeatureServer
gives a very different pairing:

| AOI export | Its own soil mix | Overlaps official 013-20 | Overlaps official 009-00 | Overlaps official 008-00 |
|---|---|---:|---:|---:|
| **AOI 1** (3.03 ac) | **93.1% Kalkaska (KkB)** | **0%** | **56%** of the AOI (53.8% of that parcel) | 0.9% |
| **AOI 2** (1.97 ac) | **66.3% Au Gres (ArB)** | **0%** | 1.2% | **58.6%** of the AOI (11.1% of that parcel) |
| **AOI 3** (8.57 ac) | 38.6% ArB / 37.6% KkB / 23.2% Carbondale muck | 0% | 0% | 2.7% |

**The 93%-Kalkaska AOI sits on the ground that is now parcel `009-00`, not `013-20`. The
66%-Au-Gres AOI sits mostly on the ground that is now parcel `008-00`, not `009-00`. AOI 3
barely touches any of the three official parcels at all — it's drawn over ground (probably the
river corridor / an adjoining strip) that isn't fully inside the current parcel lines.**

This is why the automated full-parcel SSURGO clip in the first draft of this section (done
*before* the third parcel and the original AOIs were available) came out looking "inverted"
against 013-20/009-00 — **it was clipping the correct official geometry, it just wasn't the
same footprint the AOIs were traced over.** For the record, the full-official-parcel clips, now
with all three parcels:

| Parcel | Acres | Dominant map units (area-weighted, full official boundary) |
|---|---:|---|
| 013-20 | 3.755 | Kalkaska 42.6% / Au Gres 32.0% / Evart loam 24.4% / Montcalm 1.1% |
| 009-00 | 3.167 | Kalkaska 89.7% / Roscommon mucky sand 9.6% / Au Gres 0.8% |
| 008-00 | 10.421 | Carbondale muck 36.3% / Au Gres 31.7% / Kalkaska 27.6% / Roscommon 4.4% / Sloan loam <0.1% |

**These don't match the write-up's per-PIN percentages either** — because the write-up's
percentages were never computed against the full official parcel boundary in the first place;
they were computed against smaller, hand-traced AOI footprints (the classic `02_` §9 caveat:
"AOIs covered 81/62/82% of the real parcels and stopped short of the riverbank" — confirmed
here directly, e.g. AOI 1 is 3.03 ac against 009-00's real 3.167 ac, AOI 2 is 1.97 ac against
008-00's real 10.421 ac). **Two independent, compounding effects, both real:** (1) the AOIs
undercover their true parcels, and (2) at least two of the three AOI↔PIN labels are swapped
relative to where those AOIs geometrically sit today. Which of those is the actual authoring
error — mislabeling during the original Web Soil Survey session, or a parcel renumbering
between when the AOIs were traced and when the county's current FeatureServer geometry was
pulled — wasn't run down further this pass.

**Why this is still the headline finding, just a different one than first drafted:** whichever
side is actually wrong — the AOI↔PIN labels in the write-up, or something about the vintage/
identity of the parcel geometry pulled live from Osceola's FeatureServer today — **the
automated, full-parcel, area-weighted SSURGO clip is internally consistent and matches the
parcel's own recorded acreage almost exactly (013-20: 3.755 ac clip vs. 3.755 ac on record;
same for the other two), so it isn't the obvious source of the error.** A one-parcel-at-a-time
pipeline with a live, geometry-anchored cross-check is exactly the tool that surfaces a
mismatch like this instead of silently trusting whichever label was typed into a markdown file
— **that's the argument for building it**, but it cuts both ways: it also means the pipeline
needs to treat "the AOI/PIN pairing is self-consistent" as something to verify, not assume,
before it trusts a percentage enough to put it on a card.

*(One partial corroboration that held up regardless: the Au Gres component's first soil
horizon break is at 13 inches — `chorizon` H1 = 0–13", H2 = 13–76" — matching the "12-inch
spring water table" language in spirit.)*

### One more cross-check, and why it doesn't fully settle this

The property folder also has `regrid_parcels_annotated.png` — a hand-annotated aerial with two
outlines: a small blue parcel directly on 20th Ave with a visible pond inside it (geographically
consistent with "013-20, frontage + pond, 3.75 ac"), and a long pink parcel running from just
behind it west to the Middle Branch River, passing a cluster of structures partway along
(consistent with "009-00 + 008-00 combined" — trailers, then river). **This image is timestamped
12:28, before the three-parcel discovery and before any of the three WSS AOIs were traced
(12:54–12:57)** — so it can't independently confirm where the AOI polygons themselves ended up;
it was drawn against Regrid's boundary rendering, a different source than both the AOIs (traced
free-hand in the Web Soil Survey UI) and the official Osceola FeatureServer geometry used above.
**It's consistent with the official parcel geometry's shape and position (small road/pond parcel
east, long river-reaching parcel west) — it does not by itself tell us which specific ground the
93%-Kalkaska AOI was actually traced over.** Worth being explicit about the limits here: this
document has now produced two internally-consistent but independently-sourced parcel pictures
(official FeatureServer geometry, and the WSS AOI polygons) that disagree with each other on a
decision-relevant question — **which physical ground is the dry buildable sand** — and neither
this spike nor the annotated aerial fully resolves which one is right. That's a site-walk or a
side-by-side overlay question, not one to guess at further from a desk.

### The relief transect — completed, doesn't match, probably the wrong line

USGS EPQS (`epqs.nationalmap.gov`) is exactly as flaky as `02_` warned — a 12-point transect
with retries took several minutes and still dropped 2 of 12 points. The run that did complete
(constant latitude 44.0685, longitude sweep from -85.1234 to -85.1303, ~1,800 ft, 10/12 points
returned):

| frac | elev (ft) | frac | elev (ft) |
|---:|---:|---:|---:|
| 0.00 | 1088.22 | 0.55 | *(no data)* |
| 0.09 | 1088.74 | 0.64 | 1089.65 |
| 0.18 | 1088.14 | 0.73 | 1089.13 |
| 0.27 | 1088.53 | 0.82 | 1090.02 |
| 0.36 | 1089.76 | 0.91 | 1089.40 |
| 0.45 | 1090.94 | 1.00 | *(no data)* |

**Min 1088.14 ft, max 1090.94 ft → relief = 2.8 ft.** That is nowhere near the claimed ~14 ft.
**But this transect almost certainly does not cross the real terrain break.** It's a single
straight East–West line held at one constant latitude through the two parcels' bounding boxes
— it has no information about where the river channel or valley wall actually is, and `02_`'s
own method note says the right way to do this is "sample a line of points **from road to
water**," which requires knowing where the water is, not just guessing a straight line across
two parcel polygons. A river valley in this landscape can easily sit outside a two-parcel,
1,800-ft-wide window, or the true road-to-river line may not run East–West at all. **This
reads as "wrong transect," not "no relief exists"** — the honest status is *not reproduced*,
with a clear, fixable methodological reason why, rather than a geology finding.

---

## What didn't work, collected

- `michigan.gov` (Wellogic download page) and `osceola-county.org` (equalization page) both
  403 without a browser `User-Agent` header on `curl`. Trivial fix, but every fetch needs it.
- `osceola.org` / `gis.osceola.org` is the **wrong Osceola County (Florida)**. Real MI site:
  `osceola-county.org`. This is a serious, repeatable trap for any automated source-discovery
  step and should be hard-coded around, not re-discovered.
- No GDAL/GEOS/geopandas in this environment. Worked around with `dbfread`, `pyproj`, and
  `shapely` (all pip-installed ad hoc) — fine for a spike, not a real ETL toolchain decision.
- `SDA_Get_Mupolygongeom_from_intersection_with_WktWgs84` (a guessed SDA function name)
  doesn't exist — had to find the actual T-SQL template (`mupolygon.mupolygongeo.STIntersection`
  against a `geometry::STGeomFromText` AOI) from the `soilDB` R package source rather than SDA's
  own docs, which are thin on this exact pattern.
- Layer 32's length statistic is unusable without a dissolve — flagged above, not resolved.
- Regrid's actual self-serve pricing — gated behind login, not obtained.
- County selection for Q3 is an acknowledged shortcut (§1, above) — heuristic, not the
  rigorous version `00_`/`04_` describe.
- The relief transect completed but almost certainly queried the wrong line (a straight
  east-west guess, not an actual road-to-river path) — see below.
- The soil-percentage discrepancy went through two drafts in this document: first reported
  against only 2 of the 3 parcels (looked like a near-inversion), then revised once the third
  parcel and the original AOI shapefiles surfaced (looked like an AOI↔PIN labeling mismatch
  instead) — and even the revised version is an **open discrepancy, not a fixed one**. Neither
  this spike nor the annotated aerial in the property folder settles which side is right. Left
  both drafts' reasoning visible in the document rather than silently replacing one guess with
  another.

---

## Recommendation

**Don't stop the funnel.** The soil-percentage mismatch didn't collapse into a clean "the
automated method was wrong" story, and it also didn't collapse into a clean "prior manual work
was wrong" story — it surfaced a real disagreement between two independently-sourced parcel
pictures that this spike doesn't have the tools to adjudicate from a desk. That's still useful:
it means an automated, geometry-anchored cross-check catches this class of problem, which a
markdown file with typed-in percentages cannot. Concretely, before writing more architecture:

1. **Decide the per-parcel-vs-property-grouping question in `01_`/`04_` deliberately**, while
   it's cheap — don't let it default silently either way. N 20th Ave is the reference case to
   design against either decision.
2. Re-run the relief transect along an actual road-to-river line (pull the river centerline
   from NHD and the road edge from the parcel/address data, not a straight guess between two
   parcel bounding boxes), using a local DEM tile instead of point-by-point EPQS.
3. Decide the parcel strategy question `04_` actually lists first (county-run ArcGIS layers,
   where they exist and are public, vs. Regrid where they don't) now that two of three sampled
   counties have one for free — this changes the calculus on how much Regrid spend is needed
   at all.
4. **⚠️ Before anyone acts on "013-20 is the good dry ground" for a real building decision,
   settle which parcel the 93%-Kalkaska AOI actually covers.** This spike found the AOI and the
   official-geometry pull for `013-20` don't overlap at all, and couldn't determine from a desk
   which one is stale or mislabeled — that needs either a site walk, or overlaying the AOI
   shapefile directly on the annotated aerial (or a current Regrid pull) to see, visually, which
   physical ground 93% Kalkaska actually sits on. **This is a parent-project decision input, not
   a pipeline detail — don't let it sit unresolved if a build-site choice depends on it.**
