# 01 — Vacant-Land Evaluation Criteria & The Funnel

*Seeded 2026-08-27. Directional. The parent project scores vacant land and cottages
against one shared framework; this file is the vacant-land-only half, sharpened.*

---

## ⚠️ How to read this file — it is a SPEC, not a rubric

**This repo does not evaluate parcels. It produces the card that lets a human evaluate
them.** *(See `00_` §"Two layers" and §"The unit of output is a CARD.")*

**Every criterion below exists to answer one question: what must be measured, and at what
fidelity, so that a tradeoff is visible?** Read each as a field requirement — *"someone
will want to weigh the seasonal high water table against the frontage, therefore the
pipeline must emit `wtdep_spring_min_in` on the building envelope, from SSURGO, tagged
`inferred`."*

**⭐ What that changes in practice:**

| Read as a rubric → | Read as a spec → |
|---|---|
| "score buildability 0–10" | emit `dry_acres`, `wet_acres`, `adjacent`, `dominant_dry_soil`, `dwelling_rating` |
| "reject under 20 acres" | emit `acres` **and** `acres_vs_qfp_20` |
| "unzoned is worth +3 points" | emit `zoning_status` and `zoning_source` |
| "this parcel is a B+" | emit nothing — that sentence belongs in a property file |

**⚠️ The thresholds and weights in this document are illustrative of what people care
about. They are not settings for the code.** Bake one in and the card starts making the
tradeoff instead of showing it.

---

## The two questions, restated for raw land

The parent project asks every candidate:

1. **Is it a good strategic investment?**
2. **Could we enjoy it while it appreciates?**

**On vacant land, question 2 has a concrete sub-test and question 1 has a trap.**

### Q2 → "What can we get out of this immediately, before it's built out?"

The **expansion-mode ladder**, from the parent framework, applied to bare land:

| Rung | Test on raw land | Governed by |
|---|---|---|
| **1. Legal presence** | Can the RV, boat trailer and ORVs sit here year-round unoccupied? | Township ordinance — **or nothing, if unzoned** |
| **2. Legal occupancy** | How many units, how many nights? | Ordinance. ⚠️ Townships diverge ~3.5× on this and no listing mentions it |
| **3. ⚡ Power** | Live meter, or a line at the road? What does a pedestal cost? | Electrical permit + utility |
| **4. Sanitary** | ⭐ **On unzoned land this becomes the entire test.** Vault privy now, septic later — and the septic's **design flow** is the real capacity ceiling on hosting | Health department |

⭐ **On an unzoned parcel, rungs 1 and 2 are unbounded and rung 4 is the whole constraint.
The binding number on "can we host six or seven families" is gallons per day, assigned by
a sanitarian — and it is answerable by phone before an offer is written.**

### ⚠️ Q1's trap: on raw land, "investment" and "use" pull apart

The N 20th Ave verdict, and it should be the standing prior for this repo:

> **The freedom and the weak investment thesis are the same fact seen from two sides.**
> Townships don't regulate markets nobody wants. The absence of regulation that makes a
> parcel wonderfully usable is the same absence that says nobody is competing for it.

**So a vacant parcel is honestly bought as a *use* asset priced like one — not as an
investment that happens to be enjoyable.** Where a real appreciation thesis exists, say
what the mechanism is; where it doesn't, say that out loud rather than manufacturing one.

**⚠️ And vacant land fails the parent project's umbrella tiers hard:**

- **Tier 1 ("it's bad" → sell):** ❌ Weak. Thin buyer pool, no price discovery, seasonal
  illiquidity, and **a half-built parcel is the worst state of all** — septic and
  driveway are invisible to a buyer, and a pole barn with two baths and no house
  appraises poorly.
- **Tier 2 ("holy shit" → retreat):** ❌ Fails outright until built.

**⭐ Which means leverage tolerance is a per-parcel setting here, and it should run low.**
The parent framework's own conclusion: in a thin, high-variance county, headroom has to be
*bought with down payment* because it cannot be *rented from appreciation*.

---

## ⭐⭐ The physical criteria — what this repo actually screens on

Ranked by how much they moved the answer on real parcels.

### Tier A — the thesis. If these fail, nothing else matters.

| # | Criterion | Signal | Source |
|---|---|---|---|
| **A1** | **Groundwater expression** — is the aquifer surfacing here? | Cold/cold-transitional stream reach · designated trout stream · flowing wells nearby in Wellogic · springs/seeps · a pond with a year-round inlet | MiEnviro 1, 32 · Wellogic |
| **A2** | **⭐ Dry buildable ground adjacent to the wet amenity** | Acres of drainage class "somewhat excessively / well drained" **with no water table in profile**, sharing a boundary with the water feature | SSURGO |
| **A3** | **Vertical margin** | Relief from building envelope to water surface. ⚠️ Low relief + artesian head = a property-wide high-water-table question | USGS EPQS transect |
| **A4** | **Wetland footprint and where it sits** | % hydric / NWI / Part 303, **and whether it is between the buildable ground and the water** | MiEnviro 37/38 · WrdOpenData 11 |

**⭐ A2 is the whole search.** State it as an output field: **"X dry acres, adjacent to Y
wet acres, with Z feet of relief between them."** That sentence is the buy/no-buy signal.

### Tier B — makes it usable or not

| # | Criterion | Note |
|---|---|---|
| **B1** | **Zoning presence** | ⭐⭐ **Unzoned township is a first-class attribute, not a footnote.** See `02_` §6 |
| **B2** | **Legal access** | ⚠️ Fee frontage vs. easement. **Where multiple parcels convey, confirm contiguity — a chain with a missing link landlocks the good half.** Michigan's Land Division Act requires each resulting parcel to be accessible (MCL 560.109(1)(e)) |
| **B3** | **Distance from infrastructure to amenity** | ⚠️ **The line prior work missed and it was expensive.** 1,800 ft from road to water = $27–63k of drive plus an electric run, *or* a deliberate standalone plan at $9–28k. **Measure it; don't assume a short approach** |
| **B4** | **Power** | Live meter vs. a line at the road. Worth thousands and a season |
| **B5** | **Septic feasibility** | Soils + relief + the 100-ft setback from every water feature. **Expect a mound where the good ground is thin: $15–35k, not $12–25k** |
| **B6** | **Winter access** | ⭐ **Underrated and it decides the site plan.** 1,800 ft of unplowed two-track in January is not access. Sand drains and doesn't heave; Au Gres and muck do |
| **B7** | **Post bearing** | ⚠️ Carbondale muck is muck over **peat past 60 in with no mineral bottom** — a post sinks forever. Tawas hits sand at ~22 in. **Route boardwalks around the muck, which is also the wetland, which solves both problems with one decision** |

### Tier C — the counterweights, and they must be run

| # | Check | Why |
|---|---|---|
| **C1** | **Part 201 sites / brownfields / landfills / historic dumps** | ⚠️ Liability transfers with the deed. **A Baseline Environmental Assessment before or within 45 days of closing is the only innocent-purchaser defense** — cheap, and it should be a contingency wherever there is visible junk |
| **C2** | **TMDL watersheds** (nitrate, phosphorus, sediment, *E. coli*, PCB) | ⚠️ The honest counterweight to a pretty stream |
| **C3** | **Upstream land use** | ⚠️ **Right to Farm preempts local regulation**, so a feedlot or manure application upstream is unstoppable locally. Sweep the aerial for barnyards, bins, tile-drain outlets |
| **C4** | **Dams upstream** | Thermal and flow disruption |
| **C5** | **Natural Rivers Act district** | Adds setbacks and vegetation strips |
| **C6** | **Floodplain** | FEMA NFHL |
| **C7** | **Mineral reservations, PA 116, conservation easements, utility easements** | ⚠️ Title commitment / Register of Deeds. **Severed minerals are common on Michigan acreage** |

### Tier D — price sanity, not a financial model

| Check | Note |
|---|---|
| $/acre vs. **closed** sales in the same township | ⚠️ **Asks are not sales.** Assessor SEV×2 from tax-sale archives is primary-source and free |
| Water premium implied | Prior finding: an assessor priced river frontage at **+126%** over dry local acreage — well above the 30–40% rule of thumb |
| Acres vs. **20** | QFP threshold — the largest tax lever available on vacant land |
| County FHFA negative-window rate | The region gate. See `02_` §8 |

---

## The funnel

**⭐⭐ The funnel has two halves and they behave differently.**

- **Stages 0–4 define the UNIVERSE.** These are true filters — they drop parcels — and they
  have to, because computing stage 5 for every parcel in Michigan is not tractable.
  **Filter here only on things that are cheap, factual, and not judgment calls:** is it in
  the corridor, is it vacant, does it have legal access.
- **Stages 5–8 ENRICH. They must not drop anything.** Everything they learn becomes a field
  on a card that is already in the set.

**⚠⚠ The argument for that line, and it is a real one: N 20th Ave is 17.37 acres.** A
20-acre floor in stage 4 — defensible, since 20 is the QFP threshold and the largest tax
lever available on vacant land — **would have silently deleted the parcel this entire repo
was inspired by, and nobody would ever have known.** Jordan's own words: *"a potential gem
that I almost overlooked."* ⭐ **A criterion that is a judgment call is a field, never a
filter. Emit `acres_vs_qfp_20 = −2.63` and let a human decide it doesn't matter.**

Each stage should *cheapen* the next. Do not build a later stage before an earlier one
returns something tractable.

```
 0. HYDROLOGY          Cold/cold-transitional + designated trout + natural rivers
                       → reaches                                    [statewide, cheap]
        │
 1. CORRIDOR           Buffer the reaches → the search geography
        │
 2. PARCELS            Intersect with parcel polygons          [⚠️ the expensive step]
        │
 3. VACANCY            Class 402 / no improvement value / confirm against imagery
        │
 4. SIZE & ACCESS      Acreage floor · road frontage · contiguity
        │
 5. BUILDABILITY       SSURGO + DEM + wetland → "X dry acres beside Y wet acres"
        │                                                       [⭐ the actual thesis]
 6. REGULATORY         Zoned vs. unzoned · Natural Rivers · floodplain
        │
 7. COUNTERWEIGHTS     Part 201 · TMDL · dams · upstream ag
        │
 8. PRICE SANITY       $/acre vs. township closed sales · acres vs. 20
        │
 9. HUMAN              Aerial + parcel overlay review, then a site walk
                       ⭐ IN APRIL — the seasonal high water table is invisible
                          June–October, and it is the number the design is governed by
```

**⚠️ Stages 5–8 are labeled with verbs like "score" and "flag" above. Read them as
"measure and attach."** Nothing after stage 4 removes a row.

**⚠️ Stage 9 is not optional and it is not last-resort.** Aerial and parcel-overlay review
is the highest information-per-effort step available and **it belongs before the first
write-up, not after.**

---

## The output — the card

**One card per parcel in the universe. Not a shortlist — the whole set, identically
attributed.** It feeds a `Property_[Region]_[Name].md` upstairs, but the repo's deliverable
ends at the card.

**Four rules for the schema:**

1. **⭐ Emit measurements, not verdicts.** `dry_acres = 6.68` and
   `dwelling_rating = "Not limited"`, never `buildable = true`. **A verdict is a threshold
   someone already applied, and it destroys the information needed to apply a different one.**
2. **⭐ Same fields on every card, always.** Comparison is the entire point, and it breaks
   the moment one card carries a field another one omits.
3. **Nulls are data, and they stay visible.** *"Zoning status not determined"* is more
   useful than a guess and more useful than a missing row — **it is the field that tells
   you where to spend a phone call.**
4. **Every derived field carries provenance.** `verified` / `aggregator` / `listing claim` /
   `inferred` — and **anything this pipeline computed is `inferred` until a human confirms
   it.** Without that tag the card quietly acquires the authority of a survey.

Illustrative fields — the emphasis marks below are how a *reader* would annotate a card,
not something the pipeline should write:

| Field | Example |
|---|---|
| Parcel ID · township · county | `10-003-013-20` · Middle Branch · Osceola |
| Acres · $/acre · acres vs. 20 | 17.37 · $7,772 · −2.63 |
| **Water feature + frontage ft** | Middle Branch River, 390 ft |
| **Thermal class / trout designation** | cold · designated trout stream |
| **⭐ Dry acres / wet acres / adjacency** | 6.68 dry · 6.80 wet · adjacent ✅ |
| **Dominant dry soil + rating** | Kalkaska sand · *Not limited* dwellings |
| **⚠️ Seasonal high water table on the building envelope** | none in profile |
| Relief, envelope → water | 14 ft |
| **Artesian potential** | ⭐ predicted flowing at the low end |
| **Zoning** | ⭐⭐ **UNZONED** |
| Access | ~240 ft fee frontage, county road |
| Infrastructure → amenity distance | 1,800 ft ⚠️ |
| Counterweight flags | junk pile → BEA ⚠️ |
| County negative-window rate | 28% ⚠️ |
| **Two one-liners** | *Could we sell it quickly?* / *Could we live in it?* — ⚠️ **judgments, written upstairs; the card supplies only the inputs** |

---

## ⭐ Standing design principles, earned on N 20th Ave

Not screening criteria — the build philosophy the screen should be selecting *for*. They
change what "good land" means.

1. **Use energy at the grade it arrives. Never upconvert.** The same water carries ~1,900×
   more usable energy as heat than as electricity.
2. **The well is worth most when it lets you avoid buying energy — never when it helps
   you dispose of energy you already bought.** Every good application is avoided
   consumption.
3. **Flow-through beats closed-loop.** Artesian pressure *is* the circulator. No loop,
   nothing to circulate it with.
4. **Mechanical > electric, because of failure modes.** On a property visited seasonally
   the question is not *will it fail* but *how will I find out*. A ram announces its
   health once a second; a dead controller announces nothing until January.
5. **"Consider it all a fountain."** Zero pressure, free water, open systems — a leak is a
   drip, an air gap is the gold-standard backflow prevention, and scrap becomes viable
   because pressure rating and certification stop mattering.
6. **Architecture beats materials.** The right answer to bad water is not exotic alloy,
   it is a wetted part you can reach with a wrench.
7. **Fouling matters ~8× more than metal choice.** Select for corrosion resistance and
   cleanability, never for thermal conductivity.
8. **⭐ Sequence assessable improvements late.** On vacant land nothing is sheltered from
   assessment, so every year of deferral is a year of untaxed improvement. **The tax
   argument and the cash-flow argument point the same direction.**
9. **Keep it free.** Charging anything — even "just to offset costs" — simultaneously
   makes you a campground operator under Part 125 **and** voids the Recreational Land Use
   Act liability shield. One threshold, two regimes.

---

## Open questions this repo should answer for itself

- [ ] Does **MiEnviro layer 1 (Cold/Cold Transitional Streams)** make the Blue Ribbon list
      redundant as a seed? **Check first — it may collapse stages 0–1 into one query.**
- [ ] Is the **Wellogic → artesian-potential surface** real? *(`00_` §central hypothesis)*
- [ ] What is the cheapest tractable route to **parcel polygons at scale** — Regrid API,
      per-county scraping, or a hybrid where GIS narrows to a handful of counties first?
- [ ] Can the **zoned/unzoned township list** be assembled statewide once, as a static
      lookup table? ⭐ **It is a repeatable search filter, not a per-parcel lookup**
- [ ] What acreage floor? ⚠️ **20 is not arbitrary** — it is the QFP threshold, and both
      prior near-misses (17.37 ac) forfeited it.
- [ ] Does the funnel ever return anything **outside** a Blue Ribbon corridor? **If not,
      the screen is too narrow and the indicator has quietly become the objective.**
