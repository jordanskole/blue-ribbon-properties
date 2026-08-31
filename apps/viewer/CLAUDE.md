# @brp/viewer

Static Vite + TypeScript site. No UI framework, no backend. Loads the corridor store's
published Parquet directly in-browser via `@duckdb/duckdb-wasm` and renders it with
Leaflet. See `docs/superpowers/specs/2026-08-31-parcel-map-viewer-design.md` for the full
design.

## Dev Commands

```bash
npm run dev --workspace=apps/viewer        # vite dev server
npm run build --workspace=apps/viewer      # production build
npm run typecheck --workspace=apps/viewer  # tsc --noEmit
```

## Data

`public/data/` (gitignored) holds the exported `blue-ribbon-corridor.parquet`,
`streams.geojson`, and `manifest.json` — produced by `npm run export:viewer
--workspace=apps/etl`. Run that before `npm run dev` here, or the map has nothing to show.

## File Layout

```
src/
  main.ts              # entry point: init map, load data, wire click handler
  lib/
    duckdb.ts           # getDB() / runQuery() singleton — CDN-hosted WASM bundles
    manifest.ts         # fetch manifest.json, compare schemaHash, expose vintage/count
    map.ts              # Leaflet init: OSM base layer, parcel layer, streams layer
    card-panel.ts       # renders a full CardDef into the side panel DOM
```

## What this app must never become

No score, rank, or recommendation. Parcel styling is by county only. See the design spec's
"What this is not" section before adding any new UI.
