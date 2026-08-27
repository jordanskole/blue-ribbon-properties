# 02 — Michigan GIS & Public Data Sources

*Seeded 2026-08-27. Endpoints marked **✅ verified 2026-08-27** were queried live while
writing this file. Everything else is carried from prior property work and should be
re-checked before code depends on it.*

---

## 0. The two services that matter most

Michigan publishes almost everything environmental through two ArcGIS map/feature
services on one host. **Learn these two and you have most of the state.**

### ✅ `EGLE/MiEnviro` — the big one

```
https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer
https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/FeatureServer
```

**Layer inventory ✅ verified 2026-08-27** *(add `/<id>?f=pjson` for the schema, or
`/<id>/query?...` for features)*:

| ID | Layer | Why we care |
|---|---|---|
| 0 | WRD Dams | Impoundments warm water and break flow continuity — a dam upstream is a thermal red flag |
| **1** | **⭐⭐ Cold / Cold Transitional Streams** | **Possibly the single most valuable layer in the state for this project.** A thermal-regime classification of streams = a proxy map of groundwater-dominated reaches. **Check this before building anything else** |
| 2 | Local Wetland Ordinances | ⚠️ Some municipalities regulate wetlands *below* the Part 303 state thresholds. This layer tells you where local rules bite harder than state ones |
| 5 | High Risk Erosion Zones | Great Lakes shoreline; mostly irrelevant to inland river parcels |
| 6 | Ecoregions | Coarse context |
| 7 | Section 10 Waters | Federal navigability — Corps jurisdiction |
| 8 | Part 201 Sites | ⚠️ **Contaminated sites.** Run before any purchase — Part 201 liability transfers with the deed unless a Baseline Environmental Assessment is done before or within 45 days of closing |
| 10 | Federal Wild and Scenic River | Adds a federal management overlay (e.g. Pine River, Bear Creek) |
| 15 | Environmental Areas | Part 303-adjacent designated areas |
| 16 | Conservation and Recreation Lands | Public land adjacency — a real amenity and a real constraint |
| 18 | Brownfields | Same concern as layer 8 |
| 21–22 | Tribal Reservation Boundaries / Tribal Notification Hydro Features | ⚠️ Permitting adds a notification step |
| 25–31 | **TMDL watersheds** (copper, DO, nitrate, phosphorus, sediment, *E. coli*, PCB) | ⚠️⚠️ **An impairment screen.** A parcel inside a nitrate or *E. coli* TMDL watershed is downstream of something. **Read this as the counterweight to a pretty stream** |
| **32** | **Designated Trout Stream** | ⭐ The **regulatory** designation (DNR fisheries order), distinct from the unofficial "Blue Ribbon" list. **This is the layer to actually query** — see `03_` |
| 33 | Trout Lakes | Lake analogue of 32 |
| **34** | **State Natural Rivers** | ⚠️ **Cuts both ways.** Natural Rivers Act districts impose real setbacks, vegetation strips and lot-width minimums — protection *and* restriction. Must be checked per parcel |
| 35 | Fisheries Mgmt Units | Administrative |
| 36 | Wildlife Mgmt Units | Administrative |
| **37** | **⭐ Hydric Soils** | Fast pre-screen for wetland likelihood without pulling full SSURGO |
| **38** | **National Wetland Inventory 2005** | ⭐ The workhorse wetland screen. ⚠️ See §Wetlands for what it is and isn't |
| 39–40 | Part 115 Landfills / Historic Dumps and Landfills | ⚠️ Same class of concern as 8 and 18 |
| 44 | PBC Priority Waters | Consumption advisories |
| 45 | Cisco Lakes 2011 | Another coldwater indicator, lakes |
| 47 | Watershed Basin HUC8 | Rollup geography |
| 51 | Outstanding Resource State Waters | Highest state protection tier |
| 52 | CWS Intake Locations | Public water supply intakes |

### ✅ `EGLE/WrdOpenData` — Water Resources Division

```
https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/WrdOpenData/MapServer
https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/WrdOpenData/FeatureServer
```

**Layer inventory ✅ verified 2026-08-27:**

| ID | Layer | Note |
|---|---|---|
| 0 | Environmental Areas | |
| 1 | EGLE Conservation Easements | ⚠️ Encumbrance check |
| 2 | Critical Dune Areas | Lakeshore only |
| 3 | Eco Regions | |
| 4 | High Risk Erosion Zones | |
| **5** | **Hydric Soils** | |
| **6** | **Local Wetland Ordinances** | |
| 7 | MIRIS Wetland Classes | Older Michigan-specific inventory; sometimes catches things NWI misses |
| 8 | Mitigation Banking Watersheds | |
| **9** | **National Wetland Inventory 2005** | |
| 10 | National Wetland Inventory **Plus** 2005 | Extended attribution |
| **11** | **⭐ Part 303 State Wetland Inventory** | ⚠️ **Not the same thing as NWI.** This is the state's own regulatory inventory. Where they disagree, this is the one with teeth |
| 12 | Potential Wetland Restoration Areas | |
| 13 | Coastal Zone Management Area | |
| 15–16 | Part 31 Outstanding State / International Resource Waters (Rule 98) | Highest protection |
| **17–19** | **Watershed Boundary HUC8 / HUC10 / HUC12** | ⭐ HUC12 is the right grain for "what drains into my stream reach" |

**Also:** `EGLE/WetlandsMapViewer/MapServer` — the service behind the public viewer
(NWI at layer 2 ✅). Human-facing viewers: <https://www.michigan.gov/egle/maps-data/wetlands-map-viewer>
and the older <https://www.mcgi.state.mi.us/wetlands/>.

**Hub / discovery:** <https://gis-egle.hub.arcgis.com/> · <https://www.michigan.gov/egle/maps-data>

---

## 1. ⭐⭐ Groundwater — Wellogic

**The most under-exploited data source available to this project.** See `00_` for the
central hypothesis built on it.

| What | Where |
|---|---|
| Overview | <https://www.michigan.gov/egle/maps-data/wellogic> |
| **County downloads, with lithology** | <https://www.michigan.gov/egle/maps-data/wellogic/water-wells> |
| Regional downloads, no lithology | <https://gis-michigan.opendata.arcgis.com/search?q=Wellogic> |
| Interactive Water Well Viewer | <https://www.michigan.gov/egle/maps-data/waterwellviewer> |
| Search application (no account needed) | <https://www.egle.state.mi.us/wellogic/> |
| Data questions | `Wellogic@Michigan.gov` |

**What it holds:** >1,000,000 records — water wells, pump records, and abandoned-well
plugging records, filed electronically by licensed drillers since 2000. 22 searchable
fields. ~12,000–14,000 new submissions a year, ~90% filed online.

**What we want out of it:**

1. **Static water level vs. ground elevation → artesian potential.** The core idea.
2. **Lithology logs → aquifer depth, thickness, and the confining layer.** Free, and it
   tells a driller's story about a section before you pay one.
3. **Well cost predictor.** Shallow, productive, abundant groundwater means the
   $8–16k well line comes in low. That is often the cheapest good news on a parcel.
4. **Well-record existence check** on a specific parcel — the N 20th Ave question ("is
   this flowing well registered, exempted, or an abandonment liability?").

**⚠️ Cautions.** Pre-2000 wells may not be present. Coordinate quality varies and may be
address- or section-derived on older records. Verify the static-water-level field's datum
and sign convention before trusting any derived surface.

**Related EGLE guidance worth having on hand** (all cited in `Property_MiddleBranchRiver_N20thAve.md`):
flowing wells, the Flowing Well Handbook, plugging abandoned wells, and geothermal heat
pump systems — under
<https://www.michigan.gov/egle/about/organization/drinking-water-and-environmental-health/water-well-construction>.

---

## 2. Soils — SSURGO

**The layer that decided N 20th Ave.** It produced the finding that the parcel the
mockups were drawn on was 66% Au Gres sand with a 12-inch seasonal water table, while the
small frontage parcel was 93% Kalkaska sand rated *Not limited* for dwellings.

| Route | Use |
|---|---|
| **Web Soil Survey** <https://websoilsurvey.nrcs.usda.gov/> | Human-in-the-loop. Draw an AOI, export `soilmu_a_aoi` polygons + `muaggatt`. **Proven workflow** |
| **Soil Data Access (SDA)** — REST/SOAP + SQL against the SSURGO tabular schema | ⭐ The programmatic route. This is what an automated funnel should use |
| Web Coverage / gSSURGO raster | Statewide raster, easier for large-area screening |
| EGLE `Hydric Soils` layer (MiEnviro 37 / WrdOpenData 5) | Fast pre-screen when you only need wet/not-wet |

**The fields that carry the signal:**

| Field | Meaning | Why |
|---|---|---|
| `drainagecl` | Drainage class | "Somewhat excessively drained" = the good ground |
| **`wtdepannmin`** | **Minimum annual depth to water table** | ⚠️⚠️ **This is the SEASONAL HIGH — the shallowest it gets, i.e. spring. It is the number Michigan septic and foundation design is governed by, and it is invisible on an August site visit** |
| `wtdepaprjunmin` | April–June minimum | Confirms whether the annual minimum is a spring condition |
| `pondfreqprs` | Ponding frequency | 100% = it is a wetland whatever the map says |
| `hydgrp` | Hydrologic soil group | **A** = sand, good. **D** (or A/D) = the wetness signature |
| `hydclprs` | Hydric class present | Wetland proxy |
| Interpretations | Dwellings w/ and w/o basements, small commercial, septic absorption fields, local roads | ⭐ **Read the pattern, not one rating** |

**⭐⭐ The interpretation trick worth encoding as a rule.** Nearly every Michigan sand
rates *Very limited* for septic absorption fields — that rating alone means almost
nothing. **Read it against the dwelling ratings:**

- *Very limited* septic + **`Not limited` dwellings** = a **permeability** limit (sand
  filters too fast). Routinely engineered around. **This is good ground.**
- *Very limited* septic + *Very limited* dwellings + hydrologic group D = a **wetness**
  limit. **This is not good ground, and a mound system is a $15,000–35,000 problem
  rather than a $12,000–25,000 one.**

**Michigan soil names to recognize on sight:** **Kalkaska sand** (the state soil; dry,
buildable, sand to 80 in — build here), **Au Gres sand** (12-inch spring water table;
camp here, don't build here), **Roscommon mucky sand**, **Carbondale muck** (⚠️ muck over
peat past 60 in — *no mineral bottom*; a post sinks and keeps sinking), **Tawas muck**
(muck to ~22 in then sand — a 4-ft post reaches bearing), **Plainfield sand**, **Rubicon**,
**Allendale / Pinconning / Pickford** (⚠️ *Epi*aquods — perched water table near the
surface).

**⭐ Soil taxonomy is readable and it names the mechanism.** `aqu-` = aquic moisture
regime. `epi-` = a **perched** water table on a restrictive layer near the surface.
`endo-` = a regional water table. An *Epiaquod* is wet on top and better deeper down —
which is exactly why a 130-ft drinking well is not evidence against a shallow seasonal
water table.

---

## 3. Wetlands

Three inventories, and **they disagree**:

| Source | What it is |
|---|---|
| **NWI 2005** (MiEnviro 38 / WrdOpenData 9, "Plus" at 10) | USFWS national inventory. Photo-interpreted, dated, **screening only** |
| **⭐ Part 303 State Wetland Inventory** (WrdOpenData 11) | Michigan's own regulatory inventory. **Where it disagrees with NWI, this is the one with consequences** |
| MIRIS Wetland Classes (WrdOpenData 7) | Older Michigan mapping; occasionally catches what NWI missed |
| Hydric soils (MiEnviro 37) + SSURGO `hydclprs` | The soil-based prediction. Often the earliest warning |

**⚠️ None of them is a delineation.** EGLE's own framing: the maps are for planning; the
jurisdictional line is set by a delineation or an EGLE wetland identification. **Budget a
professional delineation as a purchase contingency on any parcel where the plan puts
structures near water.**

**The regulatory thresholds that make wetland status bind** (Part 303, NREPA):

- Wetlands **contiguous to, or within 500 feet of,** an inland lake, pond, river or
  stream are state-regulated.
- Non-contiguous wetlands **over 5 acres** are regulated in counties over a population
  threshold.
- **Fill and "development" in a regulated wetland requires a permit** — and **concrete
  post footings and the paths between them are fill and development.**
- ⚠️ **Penalties reported up to $10,000/day plus restoration orders, and unlike a
  building permit you cannot cure it after the fact.**

**⭐ The asymmetry that decides site planning:** an unpermitted deck on high dry ground is
a $200 problem. The same deck 80 feet away in a mapped wetland is a five-figure problem
with a restoration order attached. **The delineation is not paperwork — it is the map
that tells you where you can build without thinking.**

Related: **Part 301** (inland lakes & streams — anything in, over, or altering the
channel: docks, footbridges, bank work), **Part 31** (floodplain, water quality
standards), **Part 91** (soil erosion & sedimentation control — ⚠️ **any earth change
within 500 ft of a stream needs a county SESC permit, and that binds you too**).

Reference: <https://www.michigan.gov/egle/about/organization/water-resources/wetlands/state-and-federal-wetland-regulations>

---

## 4. Elevation & terrain

| Source | Use |
|---|---|
| **USGS EPQS** (Elevation Point Query Service) | ⭐ Point elevations against the 1-m bare-earth DEM. The transect method — sample a line of points from road to water and read the relief. **⚠️ Flaky; retry works** |
| **USGS 3DEP** | The underlying DEM if you need raster |
| Regrid parcel record | Carries elevation min/max per parcel — coarse but free and instant |
| FEMA NFHL / Flood Map Service Center | ⚠️ Floodplain. Mandatory check on any river-adjacent parcel |

**What relief actually tells you** (from the N 20th Ave transect — 14 ft over 1,800 ft):

1. **Vertical margin for septic.** Little relief + an aquifer under positive head = a
   property-wide high-water-table question, not a river-corridor one.
2. **Where the plumbed building goes.** The high ground, measured rather than guessed.
3. **Where the floodplain and regulated wetland will be.** Ground at river grade is going
   to come back wet. **You can predict the delineation before you pay for it.**
4. **Whether there is a view.** ⚠️ Do the canopy arithmetic — 14 ft of relief against
   60–80 ft of mature hardwood means no view, ever.
5. **⭐ Flat is a feature for camping and platforms and a problem for a hydraulic ram** —
   which needs ~5 ft of drive head.

---

## 5. Parcels — the hard part

**⚠️ Michigan has no free, complete, statewide parcel layer.** This is the friction point
in the whole pipeline and it should be planned for, not discovered.

| Source | Reality |
|---|---|
| **Regrid** | ⭐ **The highest-value single source in prior sessions.** One lookup returns parcel ID, township, owner, assessed value, property class, calculated acreage, elevation min/max, census geography, and legal description. Commercial; API available. **Start here.** *(Detroit-founded, out of the blight/tax-foreclosure mapping world — the founders are reachable and are worth asking about Michigan-specific sources that aren't publicly documented)* |
| **County GIS portals** | ⚠️ Wildly uneven. Roscommon's ArcGIS Experience viewer is good (parcel search by PIN, plus state forest / wetlands / ORV / snowmobile layers). Gladwin's FetchGIS is weaker. Montmorency, Manistee: repeated dead ends. **⚠️ None of them carry zoning** — see §6 |
| **BS&A Online** | The assessing/tax record for most Michigan municipalities. ⚠️ **CAPTCHA-gated and sometimes 403s automated access; some records cost ~$6.95.** Often faster to phone the assessor |
| **Michigan GIS Open Data** <https://gis-michigan.opendata.arcgis.com/> | Boundaries, PLSS, county/township geography, DNR and MDOT layers. **No statewide parcels** |
| **US Census geocoder** (`Public_AR_Current`) | Address → coordinates. ⚠️ Times out; **retry works**. **⭐ Geocode the parcel polygon centroid, not the street address** |

**⭐ The free crosswalk trick, from prior work:** county **tax-sale result CSVs** are a
free township ↔ parcel-prefix ↔ PLSS crosswalk. Middle Branch Twp = prefix `10`, all
T19N R7W, verified across 42 records 2010–2025. **It verified jurisdiction without the
geocoder and produced primary-source SEV/acre for the township at the same time.** Where
we hold the archive, use it first. *(It also surfaces the tax-foreclosure channel as a
live alternative acquisition route.)*

**Property class:** vacant residential is Michigan class **402**. Useful as a vacancy
filter, but confirm against imagery — "vacant" parcels routinely have trailers, junk, and
two-tracks on them.

---

## 6. ⭐⭐ Zoning — the Michigan-specific finding that should be a search filter

**Zoning in Michigan is an *optional* township power.** Many rural townships never
adopted it. Where none exists, there is **no zoning ordinance at all** — no districts, no
setbacks, no lot coverage, no accessory-building cap, no minimum dwelling size, no
"principal before accessory" rule, no ZBA, and nothing to apply for.

**⭐ For a vacant-land project whose plan is platforms, a pole barn, guest camping and an
elevated trail network, an unzoned township is worth more than almost any physical
attribute of a parcel.** N 20th Ave: *"For the first time in this project the answer to
'what's permitted' is not in a township ordinance."*

**Where to look it up:**

| Source | Note |
|---|---|
| **The county's own zoning page** | Counties that lack countywide zoning usually publish the list of townships that adopted their own. Osceola does — and that list *is* the filter |
| **energyzoning.org** | Repository of Michigan local ordinances with a jurisdiction status field ("Unzoned"). ⚠️ Aggregator, but the one prior work treats as authoritative for Michigan ordinances |
| **The township's own ordinance list** | Corroboration — an unzoned township typically has blight, cemetery, dangerous-building, noise and sign ordinances **and no zoning ordinance** |
| **The county building department's zoning-administrator table** | An unzoned township has no administrator listed |
| ☎️ The township supervisor | ⭐ **Get it in writing. A one-line email reply is a document; a county web page is not** |

**Worked example — Osceola County (verified 2026-08-25):** no countywide zoning. **Zoned:**
Burdell, Cedar, Hartwick, Highland, LeRoy, Osceola, Richmond, Sherman. **Unzoned:**
Evart, Lincoln, Marion, **Middle Branch**, Orient, Rose Lake, Sylvan.

**⚠️ Both symmetric risks, and they are real:**

1. **An unzoned township can adopt zoning at any time** under the Michigan Zoning Enabling
   Act. **Nothing built under no-zoning is protected by a variance, because none was ever
   needed.** Nonconforming-use protection covers what exists, not what you planned to add
   later. **Build early or accept the window can close.** Ask the supervisor whether
   adoption is under discussion.
2. **Your neighbors are equally unconstrained.** Nothing stops a gravel pit, a junkyard,
   a shooting range or a hog barn next door.

**⚠️ And what zoning never controlled anyway:** Michigan's **Right to Farm Act** preempts
local regulation of GAAMP-compliant farms outright — so an upstream livestock or manure
operation is an equal risk in a zoned township. **On water quality, the unzoned finding
costs you nothing.**

**⚠️ Zoning maps and millage sheets are the two things that consistently resist automated
retrieval** (PDFs, often scanned). Batch them into a manual pass rather than fighting them
per-parcel.

---

## 7. What still regulates an unzoned parcel

With zoning gone, these are the real layers — and they are the ones this repo should
model:

1. **County Building Department** — Michigan construction code applies statewide.
   ⚠️ Building, electrical, plumbing and mechanical are **separate permits with separate
   fees**. Deck exemption threshold: **≤200 sq ft AND ≤30 in above grade AND
   free-standing AND ≥36 in clear AND not serving an egress door** — *all five*.
   Michigan frost depth **42 in**.
2. **District Health Department** (DHD#10, CMDHD, etc.) — **well and septic. Usually the
   binding constraint, and it is geometric.** Isolation distances: **100 ft drainfield to
   lake/stream**, 50 ft to well, 5 ft to property line. ⚠️ **Non-dwelling structures size
   to daily flow, not bedroom count** — so the sanitarian's question is *"how many people,
   how often,"* which means **design for the guest weekend, not the couple.** ⚠️ Holding
   tanks / pump-and-haul are **not** permitted for new development. ✅ **A vault privy is
   permitted and is a legitimate Phase 1.**
3. **EGLE** — Parts 303, 301, 31, 91 (see §3).
4. **State campground licensing, Part 125 (MCL 333.12501)** — ⚠️ **read the statute, not
   the shorthand.** It is a **two-element test**: sites *"offered for the use of the
   public or members of an organization"* **AND** 5+ recreational units. **Private
   hosting of invited guests never opens element ①, at any unit count.** ⚠️ It flips the
   moment you list it anywhere or charge anything — **and the same threshold
   simultaneously voids the Recreational Land Use Act liability shield (MCL 324.73301),
   which protects only users who pay no valuable consideration. One decision, two
   regimes.**
5. **Michigan Natural Rivers Act districts** (MiEnviro 34) — where they apply, they add
   setbacks and vegetation strips that function like zoning.

---

## 8. Market & valuation data

| Source | Use |
|---|---|
| **FHFA HPI, county series** (`ATNHPIUS26XXXA` via FRED) | ⭐⭐ **The region gate.** Compute the **% of 10-year windows that are negative** and the **worst window**. Benchmarks established by prior work: **Grand Traverse 5% / −0.28%/yr · Osceola 28% / −2.22%/yr · Roscommon 30% / −2.89%/yr.** ⭐ Method reproduces those exactly, so new counties are directly comparable |
| **Census building permits** (`BPRIV026XXX` via FRED) | ⚠️ **Weak in exactly our counties.** Cannot capture areas without permit requirements; non-responders are imputed; manufactured homes often move through installation rather than building permits; and counties with fewer zoned jurisdictions report worse — **which biases the very comparison you want to draw.** Direction is probably robust; magnitude is not. **Let the HPI carry the argument** |
| County tax-sale result archives | ⭐ Primary-source SEV/acre by township, plus the foreclosure acquisition channel |
| LandSearch / Land.com / LandWatch / Michigan Whitetail Properties | Asks and some sold data. ⚠️ **Asks are not sales** |
| County equalization millage sheets (PDF) | ⚠️ Resists automation. **The PRE / non-PRE spread is the school operating levy — 18.000 mills — which is how you fix the orientation when a table looks transposed** |

**⚠️ The recurring tax trap, and it has bitten more than once:** a seller holding a
**contiguous-parcel PRE** loses it on transfer, moving the bill from homestead to
non-homestead millage — on the order of a **60%+ increase**. **Ask the assessor for the
PRE% directly.**

**⚠️ And the vacant-land-specific tax finding:** Michigan's **Mathieu-Gast**
(MCL 211.27(2)) shelter covers *maintenance and repair of an existing structure*. **A
well, septic, driveway or pole barn on raw land is none of those** — they are additions
under MCL 211.34d, they land **outside the cap**, and they raise SEV by their contribution
to value. **On vacant land there is no sheltering apparatus. Every improvement is fully
assessable, and deferring one is the only lever.**

**QFP:** the Qualified Forest Program's **20-acre minimum** is the project's largest tax
lever on vacant land. ⭐ **A worthwhile output column: acres vs. 20.**

---

## 9. Known gotchas — carried forward, do not rediscover

- ⚠️ **BS&A is CAPTCHA-gated** and returns 403 to automation. Phone the assessor.
- ⚠️ **PDF zoning maps and millage sheets** resist retrieval. Batch as a manual pass.
- ⚠️ **Census geocoder times out** — retry succeeds.
- ⚠️ **Some prior sessions had no outbound network from the shell**, which silently
  blocked SSURGO / NWI / EPQS. **Verify network early rather than discovering the gap late.**
- ⚠️ **Zillow rate-limits.**
- ⚠️ **Geocode the parcel polygon, not the street address.** A PLSS grid-fit was ~0.6 mi
  off on N 20th Ave — far too coarse for an elevation transect.
- ⚠️ **Watch AOI coverage when hand-tracing soil polygons.** The N 20th Ave AOIs covered
  81% / 62% / 82% of the real parcels and **stopped short of the riverbank — understating
  the muck**, because the wettest ground is nearest the water. **Automate the AOI from the
  parcel polygon.**
- ⭐ **Aerial + parcel-overlay review is the highest information-per-effort step available,
  and it should run BEFORE the first write-up, not after.** On N 20th Ave one hour of it
  resolved the parcel count, the chain geometry, a frontage figure the listing had wrong
  by 6×, the road-to-water distance, and the fact that the site plan was drawn on the
  wrong parcel.

---

## 10. Contacts worth having in the template

Not sources, but they close the questions GIS cannot:

- **Township supervisor** — zoning status in writing; is adoption under discussion
- **County assessor** — SEV, TV, **PRE%**, parcel count/acreage, and *"how would you
  assess a pole barn with two bathrooms, plus a well and septic, on this parcel?"*
- **District Health Department sanitarian** — prior soil evaluation / perc / septic
  permit, well record, seasonal high water table, **design flow**. ⭐ **Ask them to walk
  it before closing; schedule it in spring**
- **County Road Commission** — driveway permit feasibility
- **County Building Department** — the deck/trail-structure threshold question
- **A local well driller** — aquifer continuity, depth, and what a proper well actually
  costs here
- **EGLE Campground Program** — Part 125 in writing

---

## Sources

- [EGLE Maps and Data](https://www.michigan.gov/egle/maps-data) · [EGLE Maps & Data Hub](https://gis-egle.hub.arcgis.com/)
- [EGLE/MiEnviro MapServer](https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer) ✅ layer list verified 2026-08-27
- [EGLE/WrdOpenData MapServer](https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/WrdOpenData/MapServer) ✅ layer list verified 2026-08-27
- [EGLE/WetlandsMapViewer MapServer](https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/WetlandsMapViewer/MapServer) · [Wetlands Map Viewer](https://www.michigan.gov/egle/maps-data/wetlands-map-viewer) · [legacy viewer](https://www.mcgi.state.mi.us/wetlands/)
- [Wellogic](https://www.michigan.gov/egle/maps-data/wellogic) · [county well downloads](https://www.michigan.gov/egle/maps-data/wellogic/water-wells) · [Water Well Viewer](https://www.michigan.gov/egle/maps-data/waterwellviewer)
- [EGLE — State and Federal Wetland Regulations](https://www.michigan.gov/egle/about/organization/water-resources/wetlands/state-and-federal-wetland-regulations)
- [State of Michigan GIS Open Data](https://gis-michigan.opendata.arcgis.com/) · [about](https://www.mcgi.state.mi.us/AGOOpenData/about.html) · [Michigan Open Data Portal](https://data.michigan.gov/)
- [MDNR GIS Open Data](https://gis-midnr.opendata.arcgis.com/) — incl. [Trout and Salmon Inland Stream Regulation Types](https://gis-midnr.opendata.arcgis.com/datasets/midnr::trout-and-salmon-inland-stream-regulation-types-layer-1-of-3-main/about)
- [Michigan DNR Natural Rivers](https://www.michigan.gov/dnr/managing-resources/fisheries/natural-rivers)
- [USDA Web Soil Survey](https://websoilsurvey.nrcs.usda.gov/)
- [MDOT GIS Open Data](https://www.michigan.gov/mdot/business/gis-open-data)

*⚠️ Mechanics and data-source research — not legal, tax, or financial advice. Zoning
status, septic feasibility, wetland extent and assessment treatment all need confirmation
from the named officials before money moves.*
