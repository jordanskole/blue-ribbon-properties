# Start Here

**This repo produces a data layer, not a recommendation.** One card per Michigan vacant
parcel, same fields every time, so a human one layer up can make tradeoffs. It measures; it
never concludes.

Read `00_OBJECTIVE.md` before touching anything. Then `04_ARCHITECTURE_MCP.md`
for how the pieces fit.

## The load-bearing directory

`packages/schema` — once it exists. Everything derives from it: DuckDB DDL, the card shape,
TypeScript types, provenance and vintage tags, MCP tool descriptions, LLM prompts.
**`01_VACANT_LAND_CRITERIA.md` is the prose version of that package.** When they
disagree, the schema wins and the doc gets fixed.

*(Pattern lifted from `~/code/bankql` — `.claude/rules/start-here.md` there. If in doubt
about how something should be structured, look at how bankql did it.)*

## The four rules that are not negotiable

1. **⭐ Emit measurements, never verdicts.** `dry_acres = 6.68`, never `buildable = true`. A
   verdict is a threshold someone already applied, and it destroys the information needed
   to apply a different one.
2. **⭐ Same fields on every card, always — including the empty ones.** Comparison is the
   whole point and it breaks the moment one card omits a field another one carries. A null
   is data: it says where to spend a phone call.
3. **⚠️ Filter only on the universe, never on judgment.** N 20th Ave is **17.37 acres**. A
   defensible 20-acre floor would have silently deleted the parcel that inspired this repo.
   **A judgment call is a field, not a filter.**
4. **⚠️ Every derived field carries provenance AND vintage.** `verified` / `aggregator` /
   `listing claim` / `inferred` — and anything this pipeline computed is `inferred` until a
   human confirms it. Without those tags the card quietly acquires the authority of a survey.

## No verdict tools

The MCP surface has no `score_parcel`, no `rank_parcels`, no `recommend`, and must not grow
one. **The protocol boundary is what makes rule 1 unbreakable rather than aspirational.**
Judgment happens in the parent project ("Cabins, Cottages, Vacation Property"), which is the
client.

## Watch for

- ⚠️ **Spatial joins are the error source.** Every areal statistic inherits the parcel
  boundary's error, the CRS transform, and the source layer's generalization. Precompute in
  ETL; expose the method through `explain_field`.
- ⚠️ **Coverage is ragged and county-dependent.** A null because a county has no digital
  parcel layer is a different fact from a null because the parcel has no wetland. Carry both.
- ⚠️ **Some fields will never ETL** — scanned PDF zoning maps, millage sheets, a township
  supervisor's email. Those are explicit nulls with a "go ask" pointer, not omissions.
