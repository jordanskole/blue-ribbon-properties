# blue-ribbon-properties

**Produces a data layer: one card per Michigan vacant parcel, so that tradeoffs between
parcels can actually be seen.**

Seeded 2026-08-27 from the "Cabins, Cottages, Vacation Property" project, and specifically
from `Property_MiddleBranchRiver_N20thAve.md` (a.k.a. `14_n_20th_ave`) — the parcel where
the most valuable thing on the property was a moss-covered pipe running 46 °F water by
itself, and where that fact was discovered *late*, from a photograph, after the file was
already written.

## ⭐ What this repo is, in one line

> **Every property is a bundle of tradeoffs, and tradeoffs are impossible to make in the
> absence of information. This repo does not weigh parcels against each other — it builds
> a card for each one, in the same shape every time, so a human can.**

**It is a data layer, not an evaluator.** It measures; it does not conclude. The verdict —
*is this the one, and at what price* — lives one layer up, in the parent project, where
opinions are allowed to change without anyone re-running a pipeline.

## Read in this order

| File | What it is |
|---|---|
| `00_OBJECTIVE.md` | **Start here.** What we are hunting (aquifers), why trout are a proxy and not the goal, ⭐ **the two-layer split and the card**, and what to build first |
| `01_VACANT_LAND_CRITERIA.md` | **The spec.** What has to go on the card, and why — plus the funnel that populates it. ⚠️ **A requirements document, not a scoring rubric** |
| `02_MICHIGAN_GIS_DATA_SOURCES.md` | Every Michigan-specific source, endpoint, and known gotcha. What the implementation is built against |
| `03_BLUE_RIBBON_STREAMS.md` | The 62 Blue Ribbon streams as a seed geography, with the caveats that keep them from becoming the objective |
| `04_ARCHITECTURE_MCP.md` | ⭐ **How it gets built: as an MCP server.** Modeled on `~/code/bankql`, with the four differences that don't transfer |

## Scope

**In:** vacant land, in Michigan, measured on physical and regulatory attributes.

**Out:** developed cottages, financing models, region sentiment, family preferences,
rankings, scores, and recommendations. Those live in the parent project, which handles
vacant land and cottages side by side.

**The relationship:** a parcel whose card looks interesting gets written up over there, in
the `Property_[Region]_[Name].md` format. **This repo fills in the card. That project
argues about it.**

## Two rules that fall out of that split

1. **⭐ Emit measurements, never verdicts.** `dry_acres = 6.68`, not `buildable = true`. A
   verdict is a threshold someone already applied, and it destroys the information needed
   to apply a different one.
2. **⚠️ Filter only on the universe, never on judgment.** N 20th Ave is **17.37 acres** — a
   defensible 20-acre floor would have silently deleted the parcel that inspired this
   entire repo. **A judgment call is a field, not a filter.**

## Shape

**An MCP server.** `packages/schema` (load-bearing) → `apps/etl` (republish hostile public
sources as columnar data) → `packages/mcp` (read-only DuckDB + spatial over it). The client
is a Claude session working in the parent project.

**⭐ MCP is not a side door here — it is the boundary between the two layers.** The surface
defines no tool that returns a verdict, which makes rule 1 above architectural rather than
aspirational. See `04_ARCHITECTURE_MCP.md`.

> **BankQL is SQL against the US banking system. BRP is SQL against Michigan's ground.**

## Status

Direction only. No implementation yet — see `00_OBJECTIVE.md` §"What to build first".
