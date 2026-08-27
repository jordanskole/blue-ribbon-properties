# 00 — Objective

*Seeded 2026-08-27. Directional. Nothing here is implementation.*

---

## The one-line version

**We are hunting aquifers. Trout are the indicator species, not the objective.**

A blue-ribbon trout stream is a *sensor reading*. It says: there is cold, clean,
continuously-discharging groundwater here, and it has been reliable long enough to
support a self-sustaining wild fishery. That is a statement about buried geology, and
buried geology is the thing we actually want to own.

## Why the aquifer is the asset — the N 20th Ave derivation

The Osceola County parcel (`14_n_20th_ave`) had a flowing artesian well: a pipe driven
through a clay confining layer into a sand aquifer whose potentiometric surface sits
*above* local ground level. No pump. No power. Moss growing on the pipe because it had
been running for decades.

That single fact generated, in one property file:

| What it gave | Why it matters |
|---|---|
| **Water with no pump and no power** | The hardest problem on any off-grid site is "where does water come from in January." Solved before you buy |
| **~46 °F, year-round, ±nothing** | Groundwater equilibrates to mean annual air temperature. It is a heat source in winter and a heat sink in summer, permanently |
| **~1,900× more usable energy as heat than as electricity** | 5 GPM at 10 ft of head is ~4 watts of turbine. The same 5 GPM at a 10 °F usable ΔT is ~7,300 watts of thermal. **Use energy at the grade it arrives** |
| **Direct cooling with no compressor** | A fan-coil and a circulator draw ~100–150 W where a 3-ton AC compressor draws 3,000–3,500 W. On solar, that is the difference between "we can't run AC" and "we can" |
| **Battery thermal management with zero parasitic draw** | The classic northern off-grid failure — a LiFePO4 bank that refuses to charge below freezing in December, exactly when solar is at annual minimum |
| **Free refrigeration** | A spring house removes the single largest continuous load from an off-grid system |
| **A 65 °F river on a July afternoon** | The stream and the well are the *same fact*. Nothing anyone builds upstream can move it |

**And the same geology explains the fishery.** Groundwater discharge is thermally stable
and hydraulically damped — it does not spike after a storm and it does not warm in
August. That is the difference between a trout stream and a drainage ditch that happens
to hold water. **The trout are downstream of the aquifer in every sense.**

### ⚠️ The failure this repo exists to prevent

**On N 20th Ave the aquifer was found from a photograph, after the property file was
already written.** It was described in an earlier draft as iron bacteria — "the gross
thing floating in the river." The most valuable and most durable attribute of the parcel
was, for a while, a mistake in the notes.

**That is not a research failure, it is a sequencing failure.** The process started at a
listing and worked backward to the geology. This repo inverts it: **start at the geology,
and build the data layer that makes the geology visible on every parcel at once — before
anyone has an opinion about any particular one.**

---

## What "good" looks like — the shape of the target

The parcel we are looking for has **two adjacent things, and needs both**:

1. **Wet ground with groundwater expression** — the stream, the spring, the seep, the
   flowing well, the pond that never freezes over its inlet. **This is the amenity and
   the reason to be there.**
2. **Dry, buildable, high ground immediately beside it** — sand, no seasonal water
   table, real vertical margin. **This is where anything with plumbing, a foundation, or
   a winter roof actually goes.**

**⭐ The whole search reduces to a spatial adjacency question, and that is why it is a GIS
problem and not a listing-search problem.** No MLS field encodes "62% wet soils, but the
3.75 acres at the road are 93% Kalkaska sand rated *Not limited* for dwellings." That
sentence is the entire buy/no-buy signal on a parcel, and it is derivable from public
data before anyone drives anywhere.

### The lesson stated as a rule

> **Wet is the amenity. Dry is the building envelope. A parcel needs both, touching.
> A parcel that is all wet is a canoe trip. A parcel that is all dry is a field.**

---

## ⭐⭐ Two layers — and this repo is the lower one

*Added 2026-08-27, and it is the most important structural point in this file.*

| | **This repo** | **The parent project** |
|---|---|---|
| **Produces** | **A data layer** — one card per parcel | **Judgments** — property files, offers, a decision |
| **Answers** | *What is true about this ground?* | *Is this the one, and at what price?* |
| **Output** | Measurements with provenance | `Property_[Region]_[Name].md` |
| **Changes when** | The data changes, or a new source is found | Priorities, budget or circumstances change |
| **Should be** | Deterministic, re-runnable, boring | Opinionated, argumentative, human |

**⭐ The repo's product is the layer, not the recommendation.** Its job is to make every
parcel in the search geography legible on the attributes that matter, cheaply and
repeatably. It does not decide which attributes matter *more* this month.

### ⭐⭐ The unit of output is a CARD

Jordan, 2026-08-27, and this is the clearest statement of the purpose in either project:

> *"Every property will result in tradeoffs, but it's hard to make tradeoffs in the absence
> of information. This is not to weigh one property against the other — it's to create a
> **card** for each property so that I can compare one against the other."*

**A card, in the baseball-card sense: the same fields, in the same order, for every parcel,
whether or not they flatter it.** That uniformity is the entire feature. Two cards side by
side make a tradeoff visible; two prose write-ups do not, because each one silently
emphasizes whatever its author happened to find.

**Three things follow, and they are design constraints on the pipeline:**

1. **⚠️ The card must not argue.** It reports 62% wet soils and it reports 390 ft of
   frontage. It does not conclude. The conclusion is the human's, and it is different for
   a $135,000 ask than for a $90,000 one.
2. **⚠️ Every card carries every field, including the ones that came back empty.** A
   blank `zoning_status` is not a gap in the card — **it is the card telling you where to
   spend a phone call.** Dropping the field hides the question.
3. **⭐ A tradeoff is only visible if both sides are measured.** "Great water, no dry
   ground" and "perfect building site, ordinary creek" are the same card with two numbers
   swapped — and **neither is legible unless the pipeline measured both on both parcels.**

### So why is `01_VACANT_LAND_CRITERIA.md` in here at all?

**Because the criteria are the SPEC — they are how we know what goes on the card.** They
are the only way to determine which fields the layer must carry, at what fidelity, and in
what units. ⭐ **Read that file as a requirements document — *"here is what someone
downstream will want to trade off, therefore here is what must be measured"* — and not as a
scoring rubric this repo implements.**

**⚠️ The failure mode to avoid, stated plainly: do not bake thresholds into the pipeline.**
The moment the code decides that under 20 acres is out, or that a 28% negative-decade rate
disqualifies a county, the layer has stopped being a layer and become one frozen opinion —
and revisiting that opinion means re-running the pipeline instead of re-sorting a table.

**Emit the measurement. Let the judgment live upstairs, where it can change its mind.**

---

## What we are NOT doing

- **Not buying trout fishing.** The Blue Ribbon list is a seed geography and a sanity
  check on water quality. If the search only ever returns parcels on the 62 named
  streams, the screen is too narrow — see `03_BLUE_RIBBON_STREAMS.md`.
- **Not evaluating cottages.** Structures, deferred maintenance, uncapping on an existing
  improvement, STR economics — parent project.
- **⚠️ Not ranking, and not scoring.** A rank is a weighting, a weighting is an opinion, and
  the opinion belongs one layer up. **Fill in the card; let the sort happen elsewhere.**
- **Not modeling money here.** Carry, leverage, headroom, the $200k cap and the monthly
  bands live in the parent project's `00_Investment_Framework_and_Regions.md`. This repo
  can carry a *price sanity filter* (see `01_`), not a financial model.
- **Not replacing ground truth.** Every output of this pipeline is a **screening**
  result. SSURGO is not a perc test, NWI is not a delineation, and a DEM is not a survey.
  The pipeline's job is to decide *where to spend a Saturday*, not what to sign.

---

## ⭐⭐ The central hypothesis worth building the repo around

**Michigan already publishes a map of where the aquifer surfaces — it just doesn't call
it that.**

EGLE's **Wellogic** database holds >1,000,000 water well records, filed electronically by
licensed drillers since 2000, with **static water level, well depth, casing, and
lithology**, downloadable **by county**. A flowing artesian well is a well whose static
water level is *at or above ground surface*.

So:

> **Join Wellogic static water levels against a bare-earth DEM. Every record where the
> potentiometric surface exceeds ground elevation is a point where the confined aquifer
> is under positive head. Interpolate those points and you have a statewide map of
> artesian potential.**

**If that works, it is the single highest-value artifact this repo could produce**, and
nothing else in the funnel comes close — because it identifies the asset directly instead
of inferring it from a proxy species.

**⚠️ Treat it as a hypothesis, not a plan.** Before building on it, verify:

- Does the county download actually carry static water level, and in what datum — depth
  below grade, elevation, or a flag? Are flowing wells recorded as negative depth, zero,
  or a separate field?
- Are well coordinates real GPS or address-interpolated? (Older records are often
  section-centroid or worse. **Positional error may swamp the signal.**)
- Are the wells that matter — shallow flowing wells on rural parcels — even *in* the
  database, or did they predate 2000 and never get filed? *(N 20th Ave's well is decades
  old and its record status was an open question in that file.)*
- Does EGLE's own **Cold/Cold Transitional Streams** layer (`MiEnviro` layer 1) already
  encode the same signal more cheaply, having been derived by fisheries staff who were
  answering a related question?

**⭐ That last one may be the shortcut.** A statewide layer classifying streams by thermal
regime is, functionally, a statewide map of groundwater-dominated reaches — and it is one
REST query away. **Check it before building anything.**

---

## What to build first

Directional, in dependency order. Implementation details are deliberately absent.

1. **Confirm the cheap signal exists.** Query `MiEnviro` layers 1 (Cold/Cold Transitional
   Streams), 32 (Designated Trout Stream), 34 (State Natural Rivers). Compare their
   footprints against the 62 Blue Ribbon streams. **If layer 1 is materially broader than
   the Blue Ribbon list, the Blue Ribbon list stops being the seed and becomes a
   validation set.**
2. **Buffer to a search geography.** Reaches → a corridor. This is the universe.
3. **Intersect with parcels.** The hard part, and the part where Michigan makes you work
   county by county — see `02_` §Parcels.
4. **Filter to vacant.** Property class 402 / no improvement value / no structure in
   imagery.
5. **Score buildability.** SSURGO drainage class + depth to water table + DEM relief, per
   parcel, producing the "dry acres adjacent to wet acres" number that is the actual
   thesis.
6. **Flag the regulatory environment.** Zoned vs. unzoned township — see `02_` §Zoning.
7. **Emit — do not rank.** The output is the card set: every parcel that survived the
   universe filters, every field populated or explicitly blank, every provenance tag.
   **A human sorts it, walks the interesting ones, and writes the property file upstairs.**

**⚠️ Do not build 3–7 before 1–2 returns something interesting.** If the hydrology screen
does not produce a tractable universe, everything downstream is wasted engineering.

---

## Provenance convention — carried over from the parent project, unchanged

- **verified** — county/township/state primary record
- **aggregator** — Zillow / Redfin / LandSearch / Regrid scrape
- **listing claim** — seller or agent assertion, unchecked
- **inferred** — reasoned from other facts

**Every derived field this pipeline emits is `inferred` until a human confirms it.**
Label it that way in the output schema, or the shortlist will quietly acquire the
authority of a survey.
