# 04 — Architecture: BRP is an MCP Server

*Added 2026-08-27, after reading `bankql/bankql` (`README.md`, `.claude/rules/start-here.md`,
`.claude/rules/dataset-schema-hash.md`, `packages/mcp`). The pattern transfers almost
whole; this file records what transfers, what doesn't, and why the difference matters.*

---

## The analogy, and a better version of it

**The starting version:** *"What BankQL is to banks, BRP is to Michigan riverfront parcels."*

That's directionally right and it undersells the thing twice. Three sharper framings:

### ⭐ 1. The subject was never the point — the JOIN was

BankQL's own README doesn't lead with "banks." It leads with **"real regulatory data,
properly modeled — joined across sources rather than siloed per-dataset."** Eight feeds
(FDIC BankFind, FDIC SOD bulk, FFIEC NIC ×3, NCUA Call Report) collapse into one coherent
view of an institution. **That view is a card.** So:

> **BankQL turns eight siloed regulatory feeds into one queryable row per institution.
> BRP turns a dozen siloed state GIS layers into one queryable card per parcel.**

⭐ **The card idea we landed on last week is not a BRP invention — it is what BankQL already
does, applied to ground instead of charters.** Which is a good sign: it means the shape is
proven, and it means the schema-as-source-of-truth pattern should transfer directly.

### ⭐⭐ 2. The primary key is where the analogy breaks — and that break is the whole project

| | **BankQL** | **BRP** |
|---|---|---|
| Entity | An institution | A parcel |
| Join key | **An identifier** — FDIC cert, RSSD | **⚠️ Geometry** |
| Joining is | Identity resolution across agencies. Annoying, discrete, correct-or-not | **Spatial intersection. Lossy, area-weighted, CRS-sensitive, and never exactly right** |
| A wrong join looks like | The wrong bank | **⚠️ "62% wet soils" off by fifteen points, silently** |

> **The parcel is the institution. The spatial join is the identity crosswalk — and unlike
> a cert number, it produces a distribution rather than a match.**

**⚠️ This is the hard part of the build, not a detail of it.** Every Tier A field in `01_`
is an *areal statistic over a polygon* — dry acres, wet acres, % hydric, dominant soil,
relief. Each one inherits the error of the parcel boundary, the CRS transform, and the
source layer's own generalization. ⭐ **Which is precisely why the card carries `inferred`
tags and why `explain_field` (below) is a first-class tool rather than a nicety.**

### ⭐⭐⭐ 3. "Riverfront" is too narrow, and `03_` already says so

BankQL's one-liner is **"SQL against the entire US banking system."** Not "SQL against
FDIC-insured commercial banks in the Midwest." The scope is the *system*.

> **BankQL is SQL against the US banking system. BRP is SQL against Michigan's ground.**

**⚠️ "Riverfront parcels" bakes in the exact narrowing `03_BLUE_RIBBON_STREAMS.md` warns
against** — it makes the indicator the objective. Cold/cold-transitional streams are
broader than trout streams, which are broader than Blue Ribbon streams; groundwater
discharge is broader than all three; and the layer we're building answers questions about
soils, elevation, wetlands and zoning that have nothing to do with water at all. **Build
the general thing and let the query be specific.** The riverfront search is a `WHERE`
clause, not the schema.

---

## ⭐⭐ Why MCP specifically — and this is an argument, not a comparison

**Last week we split this work into two layers:** the repo produces a data layer; the
parent project makes judgments. That split was a conceptual claim. **MCP makes it a
runtime boundary.**

```
    ┌─────────────────────────────────────────────┐
    │  JUDGMENT LAYER — the parent project        │
    │  Claude + Jordan. Opinionated, argumentative.│
    │  Writes Property_[Region]_[Name].md          │
    └────────────────────┬────────────────────────┘
                         │  ← MCP is this line
    ┌────────────────────┴────────────────────────┐
    │  DATA LAYER — this repo                      │
    │  Deterministic, re-runnable, boring.         │
    │  Emits cards. Never concludes.               │
    └─────────────────────────────────────────────┘
```

**A protocol boundary enforces the discipline that a document can only request.** The MCP
surface *cannot* return a recommendation, because no tool is defined that returns one. The
architecture makes the rule unbreakable instead of aspirational — which matters, because
the rule ("emit measurements, never verdicts") is exactly the kind of thing that erodes
under deadline pressure.

**⭐ And note the inversion from BankQL.** There, the MCP server is explicitly a side door:
*"an MCP server so the same datasets are queryable from outside the app entirely."* The
primary face is a web app.

**BRP has no app, needs no app, and should not grow one.** Its only consumer is a Claude
session writing a property file. **Here the MCP is the front door — it is the product.**
A web UI would be a distraction and, worse, a place for verdicts to accumulate.

### The other three reasons, briefly

1. **The consumer is already an LLM.** BankQL had to build NL→SQL translation into the app.
   ⭐ **We get it free** — the client *is* Claude, holding the parent project's framework in
   context.
2. **Sessions are the unit of work.** Property research happens in bounded conversations
   that need one parcel deeply, not a dashboard.
3. **It composes.** The same session can hold BRP, the filesystem, and web search at once —
   which is what actually writes a property file.

---

## What transfers from BankQL, concretely

### ⭐⭐ 1. The schema package is load-bearing — and `01_` is already a prose DatasetDef

BankQL's `start-here.md` is unambiguous: `packages/schema` is *"the single source of truth
that drives the entire stack."* One `DatasetDef` derives DuckDB DDL, Parquet output,
TypeScript row types, FK join graphs, LLM system prompts, and agent tool specs — *"so the
ETL pipeline, web app, and AI assistant can never disagree about what a column means."*

**⭐ That is the punchline of the reframe we did last week.** `01_VACANT_LAND_CRITERIA.md`
insists it is a spec and not a rubric. **A spec that drives code is a schema package.**
The criteria doc should become `packages/schema` — and once it does, "the docs and the
code disagree" stops being possible.

**⭐ Two field-level extensions BankQL doesn't need, and BRP can't work without:**

| Extension | Why |
|---|---|
| **`provenance`** | `verified` / `aggregator` / `listing claim` / `inferred`. BankQL's sources are uniformly authoritative; ours are not, and the difference between a county record and a Zillow scrape is load-bearing |
| **`vintage`** | ⚠️ **NWI is 2005. SSURGO survey areas version independently. FHFA is annual, Wellogic is continuous, and a township's zoning status is true until a board meeting.** A twenty-year-old wetland map is a fact the reader must see on the card |

**⚠️ Note this splits BankQL's hash rule in two.** Their `dataset-schema-hash.md` fingerprints
*structure* — `sourceKey` and descriptions deliberately don't affect the hash. **BRP needs
both: a schema hash for structure AND a per-source vintage stamp for content**, because a
BRP card can be structurally current and substantively stale at the same time, and only the
second one is visible to a human reading it.

### 2. ETL republishes hostile sources as clean columnar data

BankQL's ETL fetches bulk ZIPs and paginated APIs and republishes Parquet to public blob
storage (`files.bankql.org/datasets/{name}/latest/{name}.parquet`, anonymous read).

**Same move, worse inputs.** `02_MICHIGAN_GIS_DATA_SOURCES.md` is the source catalog:
ArcGIS REST endpoints, county ZIPs, SSURGO tabular exports, a >1M-row well database, and —
⚠️ **the ones that will not ETL** — scanned PDF zoning maps and millage sheets.

**⭐ Both projects exist for the same reason: the agencies publish authoritatively and will
never join their data to anyone else's.** That gap *is* the product.

### 3. DuckDB, and the `query_data` / `list_*` / `describe_*` triad

BankQL's MCP registers exactly three tools — `query_data`, `list_datasets`,
`describe_dataset` — over read-only DuckDB against remote Parquet, with the query wrapped
in `SELECT * FROM (...) LIMIT 1001`.

**Take that triad unchanged.** ⭐ DuckDB's **spatial extension** covers the geometry work,
and GeoParquet keeps the "no query server" property. ⚠️ The parcel-boundary spatial joins
should be **precomputed in ETL, not at query time** — see "what doesn't transfer."

### 4. The `.claude/` convention

`rules/start-here.md` pointing at the load-bearing directory, `rules/{invariant}.md` for
each pipeline that must round-trip, `memory/` for reference facts, `skills/wrap-it-up`
for pre-PR hygiene. **Adopt wholesale.** A `start-here.md` is seeded in this repo already.

---

## ⚠️ What does NOT transfer — the four honest differences

| # | BankQL | BRP | Consequence |
|---|---|---|---|
| **1** | **All sources free and bulk-downloadable** | ⚠️⚠️ **No free statewide parcel layer exists.** Regrid is commercial; county portals are uneven; BS&A is CAPTCHA-gated | **The single most likely thing to stall this project.** Decide the parcel strategy before building anything downstream. ⚠️ And check licensing — a commercial layer may not be republishable, which could force parcel geometry to stay local while everything else publishes |
| **2** | Joins on keys — cheap | ⚠️ Joins on geometry — expensive, and error-bearing | **Precompute per-parcel statistics in ETL.** The published Parquet should already contain `dry_acres`, not the polygons needed to derive it |
| **3** | Sources are all tabular | ⚠️ DEM and gSSURGO are **rasters**; NWI and parcels are **vectors**; millage is a **PDF**; zoning status is **a phone call** | ⭐ **This is a feature.** Forcing rasters through a per-parcel reduction in ETL *is* the "emit measurements" rule, implemented. And the phone-call fields become explicit nulls — which `01_` already says are data |
| **4** | Data is complete by construction — every insured bank is in FDIC | ⚠️ **Coverage is ragged and county-dependent** | **Every card needs a coverage/confidence field per source, not just a value.** A null because a county has no digital parcels is different from a null because the parcel genuinely has no wetland |

---

## Sketch: the tool surface

Directional. Mirrors BankQL's triad, plus the parcel-shaped ones.

| Tool | Shape | Note |
|---|---|---|
| `list_layers` | → layers, registration status, **vintage** | BankQL's `list_datasets` + vintage |
| `describe_layer` | name → fields, types, units, provenance, relations | BankQL's `describe_dataset`, unchanged |
| `query_data` | SQL → rows | ⭐ Read-only DuckDB + spatial, `LIMIT 1001`. Take their wrapper verbatim |
| **`get_parcel_card`** | APN \| lat/lon \| address → **the full card** | ⭐⭐ **The headline tool.** One call, every field, every provenance tag, every null |
| `find_parcels` | county \| bbox \| corridor + filters → parcel set | ⚠️ Universe filters only — never judgment filters *(`01_`: the 17.37-acre lesson)* |
| **`explain_field`** | parcel + field → source layer, method, vintage, coverage | ⭐⭐ **The card must not argue, but it must be auditable.** This is how a derived number defends itself without editorializing |
| `check_coverage` | county → which layers exist here | ⚠️ Difference #4. Answers *"is this null real?"* |

**⚠️ Note what is absent and must stay absent: no `score_parcel`, no `rank_parcels`, no
`recommend`.** The judgment layer is a different process with a different job.

---

## Sketch: repo shape

```
blue-ribbon-properties/
├── packages/
│   ├── schema/        ⭐⭐ LOAD-BEARING. LayerDef + CardDef.
│   │                     Derives DDL, types, provenance/vintage, MCP tool
│   │                     descriptions, LLM prompts. 01_ becomes this.
│   └── mcp/           The server. bin: brp-mcp. stdio transport.
├── apps/
│   └── etl/           fetch:egle-mienviro · fetch:wellogic · fetch:ssurgo
│                      fetch:parcels-{county} · derive:parcel-stats · upload
├── docs/              00_–04_ (⚠️ currently at repo root — move when apps/ lands)
└── .claude/
    ├── rules/start-here.md
    ├── rules/schema-vintage.md      ⚠️ the two-hash contract
    ├── memory/
    └── skills/wrap-it-up/           lifted from bankql
```

---

## First three questions, in order

1. **⚠️ What is the parcel strategy?** Regrid API, per-county scraping, or GIS-first
   narrowing to a handful of counties before any parcel work at all. **Difference #1 gates
   everything, and the third option may let the project start without solving it.**
2. **Does `MiEnviro` layer 1 (Cold/Cold Transitional Streams) collapse stages 0–1?**
   *(`00_` §What to build first — still the cheapest first experiment in the repo.)*
3. **Is the Wellogic → artesian-potential surface real?** *(`00_` §central hypothesis.)*
   ⭐ **If it is, it becomes a derived layer that exists nowhere else** — and unlike
   everything else in the pipeline, that one is not a republish of someone else's data.
   It is the only genuinely new thing this repo would produce.

---

## Source

Read from `~/code/bankql` on 2026-08-27: `README.md`, `.claude/rules/start-here.md`,
`.claude/rules/dataset-schema-hash.md`, `.claude/memory/reference_storage.md`,
`.claude/skills/wrap-it-up/SKILL.md`, `packages/mcp/{package.json,src/index.ts,src/duckdb.ts}`,
and the workspace layout.
