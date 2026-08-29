# Blue Ribbon Corridor Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate a local DuckDB + Parquet store with real, validated `CardDef` cards for
every parcel within 1km of a Lower Peninsula Blue Ribbon trout stream, across Osceola,
Iosco, and Roscommon counties — plus a byproduct report of which other Michigan counties
those streams pass through.

**Architecture:** Resolve each of 28 LP Blue Ribbon stream table-rows (03_'s own rows,
covering 49 individually-named segments) to real MiEnviro geometry, buffer 1km in a
projected CRS, ask each county's FeatureServer for parcels intersecting the buffer, run the
existing single-parcel derive pipeline on every candidate not already in the store, and
persist. Every new query pattern this plan uses was live-verified during planning — see
each task's "Verified live" note.

**Tech Stack:** TypeScript, `@duckdb/node-api` (spatial + json extensions), Vitest, existing
`apps/etl` fetch/derive modules.

**Spec:** `docs/superpowers/specs/2026-08-29-blue-ribbon-corridor-store-design.md`

## Global Constraints

- Reuse existing verified formulas and query patterns exactly: the equirectangular area
  formula (`duckdb/compute.ts`'s `AREA_ACRES_SQL`), the Iosco Web-Mercator reprojection and
  MCD township lookup, each adapter's existing endpoint/header/query mechanics. Never
  re-derive something already proven working in this repo.
- EPSG:3078 (Michigan GeoRef) is the buffering CRS — verified live to round-trip correctly
  through DuckDB's `ST_Transform`/`ST_Buffer` (see Task 4).
- No property-class filtering at candidate-discovery time (spec decision — Iosco's
  FeatureServer has no property-class field at all, so filtering would be inconsistent
  across counties).
- `apps/etl/store/` is gitignored — nothing in this plan publishes or uploads data anywhere.
- Every task that adds a network query includes the exact verified request shape in its
  code — no task guesses an endpoint or parameter format that wasn't checked live during
  planning.

---

### Task 1: Blue Ribbon stream static data

**Files:**
- Create: `apps/etl/src/data/blue-ribbon-streams.ts`
- Test: `apps/etl/test/data/blue-ribbon-streams.test.ts`

**Interfaces:**
- Produces: `BlueRibbonStreamRecord { name: string; counties: string[] }`,
  `BLUE_RIBBON_STREAMS_LP: BlueRibbonStreamRecord[]` (28 entries) — consumed by Task 3.

**Note on scope:** `03_BLUE_RIBBON_STREAMS.md`'s Lower Peninsula section is headed "49
streams" but presents them as 28 table rows (multi-segment rivers like Au Sable share one
row across Main/North Branch/South Branch/East Branch). This plan transcribes the 28 rows
as-is — Task 3's substring name-matching (not exact-name matching) naturally captures every
segment under one row's base name during geometry resolution, so no row needs to be split
further by hand.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { BLUE_RIBBON_STREAMS_LP } from "../../src/data/blue-ribbon-streams.js";

describe("BLUE_RIBBON_STREAMS_LP", () => {
  it("has exactly 28 records, matching 03_BLUE_RIBBON_STREAMS.md's LP table rows", () => {
    expect(BLUE_RIBBON_STREAMS_LP).toHaveLength(28);
  });

  it("every record has a non-empty name and at least one county", () => {
    for (const record of BLUE_RIBBON_STREAMS_LP) {
      expect(record.name.trim().length).toBeGreaterThan(0);
      expect(record.counties.length).toBeGreaterThan(0);
      for (const county of record.counties) {
        expect(county.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("includes Osceola's Middle Branch River and Pine River (already ground-truthed)", () => {
    const names = BLUE_RIBBON_STREAMS_LP.filter((r) => r.counties.includes("Osceola")).map(
      (r) => r.name
    );
    expect(names).toContain("Middle Branch River");
    expect(names).toContain("Pine River");
  });

  it("includes Iosco's East Branch Au Gres River", () => {
    const names = BLUE_RIBBON_STREAMS_LP.filter((r) => r.counties.includes("Iosco")).map(
      (r) => r.name
    );
    expect(names).toContain("East Branch Au Gres River");
  });

  it("includes Roscommon's Au Sable (South Branch reaches it, not the mainstem)", () => {
    const names = BLUE_RIBBON_STREAMS_LP.filter((r) => r.counties.includes("Roscommon")).map(
      (r) => r.name
    );
    expect(names).toContain("Au Sable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- blue-ribbon-streams`
Expected: FAIL with "Cannot find module '../../src/data/blue-ribbon-streams.js'"

- [ ] **Step 3: Write the data file**

```typescript
export interface BlueRibbonStreamRecord {
  /** Base name to substring-match (case-insensitive) against MiEnviro's
   * NHSStreamName within each listed county. Segment-prefixed names in the
   * live data (e.g. "South Branch Au Sable River") match automatically —
   * this is deliberately not an exact-name list. */
  name: string;
  /** County names exactly as they appear in the state County FeatureServer's
   * Name field (verified live: "Osceola", "Iosco", "Roscommon", etc.). */
  counties: string[];
}

/** Transcribed from 03_BLUE_RIBBON_STREAMS.md's Lower Peninsula table, 2026-08-29.
 * 28 rows, covering the DNR's historical 49-stream LP list (segments of the same
 * river share one row here — see the file header note). */
export const BLUE_RIBBON_STREAMS_LP: BlueRibbonStreamRecord[] = [
  { name: "Au Sable", counties: ["Crawford", "Oscoda", "Otsego", "Roscommon"] },
  { name: "Pere Marquette", counties: ["Mason", "Lake"] },
  { name: "Manistee", counties: ["Kalkaska", "Crawford"] },
  { name: "Pine River", counties: ["Manistee", "Lake", "Osceola"] },
  { name: "Little Manistee", counties: ["Mason", "Lake"] },
  { name: "Pigeon River", counties: ["Cheboygan", "Otsego"] },
  { name: "Black River", counties: ["Cheboygan", "Presque Isle", "Montmorency", "Otsego"] },
  { name: "East Branch Black River", counties: ["Montmorency"] },
  { name: "Jordan River", counties: ["Antrim"] },
  { name: "Boardman", counties: ["Grand Traverse", "Kalkaska"] },
  { name: "Sturgeon River", counties: ["Cheboygan", "Otsego"] },
  { name: "Bear Creek", counties: ["Manistee"] },
  { name: "Big Creek", counties: ["Crawford"] },
  { name: "Big Creek", counties: ["Oscoda"] },
  { name: "Platte River", counties: ["Benzie"] },
  { name: "Canada Creek", counties: ["Presque Isle", "Montmorency"] },
  { name: "Cedar River", counties: ["Antrim"] },
  { name: "Cedar River", counties: ["Clare", "Gladwin"] },
  { name: "Clam River", counties: ["Missaukee"] },
  { name: "Gilchrist Creek", counties: ["Montmorency"] },
  { name: "Hunt Creek", counties: ["Montmorency"] },
  { name: "East Branch Au Gres River", counties: ["Iosco"] },
  { name: "Baldwin Creek", counties: ["Lake"] },
  { name: "Boyne River", counties: ["Charlevoix"] },
  { name: "Maple River", counties: ["Emmet"] },
  { name: "Middle Branch River", counties: ["Osceola"] },
  { name: "White River", counties: ["Newaygo"] },
  { name: "Big Sable River", counties: ["Mason", "Lake"] },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- blue-ribbon-streams`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/data/blue-ribbon-streams.ts apps/etl/test/data/blue-ribbon-streams.test.ts
git commit -m "feat(etl): add Lower Peninsula Blue Ribbon stream static data"
```

---

### Task 2: County boundary fetch

**Files:**
- Create: `apps/etl/src/fetch/county-boundaries.ts`
- Test: `apps/etl/test/fetch/county-boundaries.test.ts`

**Interfaces:**
- Produces: `CountyBoundary { name: string; peninsula: "Lower" | "Upper"; geometry: { type: "Polygon"; coordinates: number[][][] } }`,
  `fetchLowerPeninsulaCounties(): Promise<CountyBoundary[]>` — consumed by Task 3 (per-stream
  county bbox lookup) and Task 9 (county-intersection byproduct).

**Verified live:** `services3.arcgis.com/dxRQUfTDNtfqZ301/.../County/FeatureServer/0/query`
with `f=geojson&where=Peninsula='Lower'&outFields=Name,Peninsula&returnGeometry=true`
returns full-precision WGS84 polygons (Osceola's boundary alone has 954 vertices) with
`Name`/`Peninsula` properties intact.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchLowerPeninsulaCounties } from "../../src/fetch/county-boundaries.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchLowerPeninsulaCounties", () => {
  it("returns parsed county boundaries from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { Name: "Osceola", Peninsula: "Lower" },
          geometry: { type: "Polygon", coordinates: [[[-85.5, 43.8], [-85.1, 43.8], [-85.1, 44.2], [-85.5, 44.2], [-85.5, 43.8]]] },
        },
      ],
    };
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requestedUrl = url;
        return { ok: true, json: async () => mockResponse };
      })
    );
    const counties = await fetchLowerPeninsulaCounties();
    expect(counties).toHaveLength(1);
    expect(counties[0]).toEqual({
      name: "Osceola",
      peninsula: "Lower",
      geometry: { type: "Polygon", coordinates: mockResponse.features[0].geometry.coordinates },
    });
    expect(requestedUrl).toContain("Peninsula%3D%27Lower%27");
    expect(requestedUrl).toContain("f=geojson");
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, statusText: "Service Unavailable" }))
    );
    await expect(fetchLowerPeninsulaCounties()).rejects.toThrow(
      "County FeatureServer request failed: 503 Service Unavailable"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- county-boundaries`
Expected: FAIL with "Cannot find module '../../src/fetch/county-boundaries.js'"

- [ ] **Step 3: Write the implementation**

```typescript
export interface CountyBoundary {
  name: string;
  peninsula: "Lower" | "Upper";
  geometry: { type: "Polygon"; coordinates: number[][][] };
}

const COUNTY_FEATURESERVER_QUERY_URL =
  "https://services3.arcgis.com/dxRQUfTDNtfqZ301/arcgis/rest/services/County/FeatureServer/0/query";

interface CountyGeoJsonResponse {
  features: Array<{
    type: "Feature";
    properties: { Name: string; Peninsula: string };
    geometry: { type: string; coordinates: number[][][] };
  }>;
}

export async function fetchLowerPeninsulaCounties(): Promise<CountyBoundary[]> {
  const url =
    `${COUNTY_FEATURESERVER_QUERY_URL}?f=geojson&where=${encodeURIComponent("Peninsula='Lower'")}` +
    `&outFields=Name,Peninsula&returnGeometry=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`County FeatureServer request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as CountyGeoJsonResponse;
  return body.features.map((f) => ({
    name: f.properties.Name,
    peninsula: f.properties.Peninsula as "Lower" | "Upper",
    geometry: { type: "Polygon", coordinates: f.geometry.coordinates },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- county-boundaries`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/fetch/county-boundaries.ts apps/etl/test/fetch/county-boundaries.test.ts
git commit -m "feat(etl): add statewide county boundary fetch"
```

---

### Task 3: Blue Ribbon stream geometry resolution

**Files:**
- Create: `apps/etl/src/fetch/blue-ribbon-geometry.ts`
- Test: `apps/etl/test/fetch/blue-ribbon-geometry.test.ts`

**Interfaces:**
- Consumes: `BlueRibbonStreamRecord` (Task 1), `CountyBoundary` (Task 2),
  `fetchColdStreams(bbox: BBox): Promise<MiEnviroFeature[]>` and
  `bboxFromGeometry(geometry: {coordinates: number[][][]}, bufferDeg: number): BBox` (both
  already exported from `src/fetch/mienviro.ts` — `fetchColdStreams` already requests
  `NHSStreamName` in its `outFields`, so no change to `mienviro.ts` is needed).
- Produces: `ResolvedStreamGeometry { record: BlueRibbonStreamRecord; geometry: {type: "MultiLineString"; coordinates: number[][][]}; matchedNames: string[] }`,
  `resolveStreamGeometry(record, countyBoundaries): Promise<ResolvedStreamGeometry | null>` —
  consumed by Task 9.

**Verified live:** county-bbox-scoped `fetchColdStreams` + substring match against
`NHSStreamName` correctly isolates the target stream in every one of the 3 corridor
counties — Osceola's bbox returns exactly `Middle Branch River` and `Pine River` among its
matches (plus many unrelated creeks, correctly excluded by the name filter); Iosco's
returns `East Branch Au Gres River`; Roscommon's returns `South Branch Au Sable River`
(confirmed correct — the Au Sable mainstem runs Crawford → Oscoda → Iosco and never
reaches Roscommon, only its South Branch does, per the Mason Tract geography).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveStreamGeometry } from "../../src/fetch/blue-ribbon-geometry.js";
import type { CountyBoundary } from "../../src/fetch/county-boundaries.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OSCEOLA_BOUNDARY: CountyBoundary = {
  name: "Osceola",
  peninsula: "Lower",
  geometry: {
    type: "Polygon",
    coordinates: [[[-85.56, 43.81], [-85.09, 43.81], [-85.09, 44.17], [-85.56, 44.17], [-85.56, 43.81]]],
  },
};

describe("resolveStreamGeometry", () => {
  it("matches by substring, collecting every segment under one base name", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-85.13, 44.068], [-85.12, 44.07]] },
          properties: { NHSStreamName: "Middle Branch River", ReachCode: "x", TemperatureGradient: null },
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[-85.2, 44.0], [-85.19, 44.01]] },
          properties: { NHSStreamName: "Hersey Creek", ReachCode: "y", TemperatureGradient: null },
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => mockResponse })));

    const result = await resolveStreamGeometry(
      { name: "Middle Branch River", counties: ["Osceola"] },
      [OSCEOLA_BOUNDARY]
    );

    expect(result).not.toBeNull();
    expect(result!.matchedNames).toEqual(["Middle Branch River"]);
    expect(result!.geometry.type).toBe("MultiLineString");
    expect(result!.geometry.coordinates).toEqual([[[-85.13, 44.068], [-85.12, 44.07]]]);
  });

  it("returns null when nothing matches in any listed county", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ type: "FeatureCollection", features: [] }) }))
    );
    const result = await resolveStreamGeometry(
      { name: "Nonexistent River", counties: ["Osceola"] },
      [OSCEOLA_BOUNDARY]
    );
    expect(result).toBeNull();
  });

  it("throws a clear error when a listed county has no boundary in the supplied list", async () => {
    await expect(
      resolveStreamGeometry({ name: "Middle Branch River", counties: ["Roscommon"] }, [OSCEOLA_BOUNDARY])
    ).rejects.toThrow('no county boundary found for "Roscommon"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- blue-ribbon-geometry`
Expected: FAIL with "Cannot find module '../../src/fetch/blue-ribbon-geometry.js'"

- [ ] **Step 3: Write the implementation**

```typescript
import type { BlueRibbonStreamRecord } from "../data/blue-ribbon-streams.js";
import type { CountyBoundary } from "./county-boundaries.js";
import { fetchColdStreams, bboxFromGeometry } from "./mienviro.js";

export interface ResolvedStreamGeometry {
  record: BlueRibbonStreamRecord;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
  matchedNames: string[];
}

// ~2.2km at Michigan's latitude -- generous margin around the county boundary's
// own bbox, since a stream running right along a county line should still be
// captured even though the county polygon's bbox is drawn tight to its extent.
const BBOX_BUFFER_DEG = 0.02;

export async function resolveStreamGeometry(
  record: BlueRibbonStreamRecord,
  countyBoundaries: CountyBoundary[]
): Promise<ResolvedStreamGeometry | null> {
  const segments: number[][][] = [];
  const matchedNames = new Set<string>();
  const needle = record.name.toLowerCase();

  for (const countyName of record.counties) {
    const boundary = countyBoundaries.find((c) => c.name === countyName);
    if (!boundary) {
      throw new Error(
        `blue-ribbon-geometry: no county boundary found for "${countyName}" (needed by "${record.name}")`
      );
    }
    const bbox = bboxFromGeometry(boundary.geometry, BBOX_BUFFER_DEG);
    const features = await fetchColdStreams(bbox);
    for (const feature of features) {
      const streamName = feature.properties.NHSStreamName;
      if (typeof streamName !== "string" || !streamName.toLowerCase().includes(needle)) {
        continue;
      }
      matchedNames.add(streamName);
      if (feature.geometry.type === "LineString") {
        segments.push(feature.geometry.coordinates as number[][]);
      } else if (feature.geometry.type === "MultiLineString") {
        segments.push(...(feature.geometry.coordinates as number[][][]));
      }
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return {
    record,
    geometry: { type: "MultiLineString", coordinates: segments },
    matchedNames: [...matchedNames],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- blue-ribbon-geometry`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/fetch/blue-ribbon-geometry.ts apps/etl/test/fetch/blue-ribbon-geometry.test.ts
git commit -m "feat(etl): resolve Blue Ribbon stream geometry via county-scoped name match"
```

---

### Task 4: Buffer + county-intersection DuckDB helpers

**Files:**
- Create: `apps/etl/src/duckdb/buffer.ts`
- Test: `apps/etl/test/duckdb/buffer.test.ts`

**Interfaces:**
- Consumes: `DuckDbSession` (already exported from `src/duckdb/load.ts`), `CountyBoundary`
  (Task 2).
- Produces: `bufferGeometry(session, geometry, bufferMeters): Promise<{type: "Polygon"; coordinates: number[][][]}>`,
  `computeIntersectingCounties(session, bufferPolygon, counties): Promise<string[]>` — both
  consumed by Task 9.

**Verified live:** the full `ST_Transform('EPSG:4326'->'EPSG:3078') -> ST_Buffer(1000) ->
ST_Transform('EPSG:3078'->'EPSG:4326')` pipeline was run in this project's real DuckDB
instance against a ~2.66km test line near Osceola: produced a valid `Polygon`, with area
(via the already-verified `AREA_ACRES_SQL` formula) of ~2021 acres — matching the expected
stadium-shape estimate (`length * 2000 + pi * 1000^2`) to within ~3%, well inside the
tolerance expected from a segmented buffer approximation. `EPSG:3078` (Michigan GeoRef) is
the same CRS the state's own County/MinorCivilDivision/Township layers already report
natively (`wkid: 102123, latestWkid: 3078`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { openSpatialSession } from "../../src/duckdb/load.js";
import { bufferGeometry, computeIntersectingCounties } from "../../src/duckdb/buffer.js";
import type { CountyBoundary } from "../../src/fetch/county-boundaries.js";

describe("bufferGeometry", () => {
  it("produces a Polygon whose area matches the verified reference computation", async () => {
    const session = await openSpatialSession();
    const line = {
      type: "LineString",
      coordinates: [
        [-85.13, 44.068],
        [-85.1, 44.075],
      ],
    };
    const buffer = await bufferGeometry(session, line, 1000);
    expect(buffer.type).toBe("Polygon");

    // Cross-check the buffer's own area with the project's verified area
    // formula, against the value confirmed live during planning (~2021 acres).
    const reader = await session.connection.runAndReadAll(`
      SELECT ST_Area(ST_GeomFromGeoJSON('${JSON.stringify(buffer)}'))
        * POWER(111320.0, 2)
        * COS(RADIANS(ST_Y(ST_Centroid(ST_GeomFromGeoJSON('${JSON.stringify(buffer)}')))))
        / 4046.8564224 AS acres
    `);
    const rows = reader.getRowObjectsJS();
    expect(Number(rows[0].acres)).toBeCloseTo(2021, -2); // within ~100 acres
  });
});

describe("computeIntersectingCounties", () => {
  it("returns only the counties whose boundary actually intersects the buffer", async () => {
    const session = await openSpatialSession();
    const overlapping: CountyBoundary = {
      name: "Overlapping",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-85.2, 44.0], [-85.0, 44.0], [-85.0, 44.2], [-85.2, 44.2], [-85.2, 44.0]]],
      },
    };
    const disjoint: CountyBoundary = {
      name: "Disjoint",
      peninsula: "Lower",
      geometry: {
        type: "Polygon",
        coordinates: [[[-83.0, 44.0], [-82.8, 44.0], [-82.8, 44.2], [-83.0, 44.2], [-83.0, 44.0]]],
      },
    };
    const bufferPolygon: { type: "Polygon"; coordinates: number[][][] } = {
      type: "Polygon",
      coordinates: [[[-85.15, 44.05], [-85.05, 44.05], [-85.05, 44.15], [-85.15, 44.15], [-85.15, 44.05]]],
    };

    const result = await computeIntersectingCounties(session, bufferPolygon, [overlapping, disjoint]);
    expect(result).toEqual(["Overlapping"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- duckdb/buffer`
Expected: FAIL with "Cannot find module '../../src/duckdb/buffer.js'"

- [ ] **Step 3: Write the implementation**

```typescript
import type { DuckDbSession } from "./load.js";
import type { CountyBoundary } from "../fetch/county-boundaries.js";

// Michigan GeoRef -- the CRS the state's own County/MinorCivilDivision/Township
// layers already report natively (verified: their query responses carry
// spatialReference {wkid: 102123, latestWkid: 3078}). ST_Buffer needs a metric,
// planar CRS; buffering raw WGS84 degrees would be wrong the same way computing
// area in raw degrees was, before this project's verified equirectangular fix.
const BUFFER_CRS = "EPSG:3078";

export async function bufferGeometry(
  session: DuckDbSession,
  geometry: { type: string; coordinates: unknown },
  bufferMeters: number
): Promise<{ type: "Polygon"; coordinates: number[][][] }> {
  const geojson = JSON.stringify(geometry);
  const reader = await session.connection.runAndReadAll(`
    WITH g AS (SELECT ST_GeomFromGeoJSON('${geojson}') AS geom),
    proj AS (
      SELECT ST_Transform(geom, 'EPSG:4326', '${BUFFER_CRS}', always_xy := true) AS geom FROM g
    ),
    buffered AS (SELECT ST_Buffer(geom, ${bufferMeters}) AS geom FROM proj),
    back AS (
      SELECT ST_Transform(geom, '${BUFFER_CRS}', 'EPSG:4326', always_xy := true) AS geom FROM buffered
    )
    SELECT ST_AsGeoJSON(geom) AS geojson FROM back
  `);
  const rows = reader.getRowObjectsJS();
  return JSON.parse(String(rows[0].geojson));
}

/** Which of the supplied county boundaries the buffer polygon intersects --
 * used to report the "todo list" of counties beyond the 3 with adapters today. */
export async function computeIntersectingCounties(
  session: DuckDbSession,
  bufferPolygon: { type: "Polygon"; coordinates: number[][][] },
  counties: CountyBoundary[]
): Promise<string[]> {
  await session.connection.run(`CREATE OR REPLACE TABLE _county_check (name VARCHAR, geom GEOMETRY)`);
  for (const county of counties) {
    await session.connection.run(
      `INSERT INTO _county_check VALUES ($1, ST_GeomFromGeoJSON($2::VARCHAR))`,
      [county.name, JSON.stringify(county.geometry)]
    );
  }
  const bufferGeojson = JSON.stringify(bufferPolygon);
  const reader = await session.connection.runAndReadAll(`
    SELECT name FROM _county_check
    WHERE ST_Intersects(geom, ST_GeomFromGeoJSON('${bufferGeojson}'))
    ORDER BY name
  `);
  const rows = reader.getRowObjectsJS();
  return rows.map((r) => String(r.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- duckdb/buffer`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/duckdb/buffer.ts apps/etl/test/duckdb/buffer.test.ts
git commit -m "feat(etl): add EPSG:3078 buffer and county-intersection DuckDB helpers"
```

---

### Task 5: Osceola's `fetchParcelsIntersecting`

**Files:**
- Modify: `apps/etl/src/counties/types.ts`
- Modify: `apps/etl/src/counties/osceola.ts`
- Modify: `apps/etl/test/counties/osceola.test.ts`

**Interfaces:**
- Produces: `GeoJSONPolygon { type: "Polygon"; coordinates: number[][][] }` (new, in
  `types.ts`), `CountyParcelAdapter.fetchParcelsIntersecting?(polygon: GeoJSONPolygon): Promise<RawParcelFeature[]>`
  (new **optional** interface member — kept optional until Task 7 makes it required, once
  all three adapters implement it, so `npm run typecheck` stays green after every task in
  this plan, not just the last one).
- Consumes: nothing new.

**Verified live:** `geometry=<Esri JSON polygon>&geometryType=esriGeometryPolygon` against
Osceola's real FeatureServer, scoped to a bbox around the known N 20th Ave parcels, returned
16 real features with correct `PIN`/`UNIT` values.

- [ ] **Step 1: Add the optional interface member**

In `apps/etl/src/counties/types.ts`, add after `NormalizedParcelRecord`:

```typescript
export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
```

And add to `CountyParcelAdapter`:

```typescript
export interface CountyParcelAdapter {
  county: string;
  fetchParcel(pin: string): Promise<RawParcelFeature>;
  normalize(raw: RawParcelFeature): NormalizedParcelRecord;
  fetchParcelsIntersecting?(polygon: GeoJSONPolygon): Promise<RawParcelFeature[]>;
}
```

- [ ] **Step 2: Write the failing test**

Add to `apps/etl/test/counties/osceola.test.ts` (new `describe` block, alongside the
existing `normalize` tests):

```typescript
import { fetchParcelsIntersecting } from "../../src/counties/osceola.js";
// (add to the existing import from "../../src/counties/osceola.js" instead of a new line)

describe("osceola fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query and returns the raw features", async () => {
    const mockResponse = {
      features: [
        {
          type: "Feature",
          properties: { PIN: "10 003 023 00", OWNER: "X", PROPCLASS: "Y", UNIT: "MIDDLE BRANCH TOWNSHIP", Shape__Area: 1000 },
          geometry: { type: "Polygon", coordinates: [[[-85.13, 44.068], [-85.12, 44.068], [-85.12, 44.07], [-85.13, 44.068]]] },
        },
      ],
    };
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requestedUrl = url;
        return { ok: true, json: async () => mockResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-85.135, 44.066], [-85.125, 44.066], [-85.125, 44.07], [-85.135, 44.07], [-85.135, 44.066]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.PIN).toBe("10 003 023 00");
    expect(requestedUrl).toContain("geometryType=esriGeometryPolygon");
    expect(requestedUrl).toContain("spatialRel=esriSpatialRelIntersects");
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, statusText: "Internal Server Error" })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      "Osceola FeatureServer intersects request failed: 500 Internal Server Error"
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- osceola`
Expected: FAIL with "fetchParcelsIntersecting is not a function" (or a TS error if run through typecheck first)

- [ ] **Step 4: Write the implementation**

Add to `apps/etl/src/counties/osceola.ts`, changing the top import to also bring in
`GeoJSONPolygon`:

```typescript
import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
  GeoJSONPolygon,
} from "./types.js";
```

And add the new function (after `fetchParcel`, before `normalize`):

```typescript
export async function fetchParcelsIntersecting(
  polygon: GeoJSONPolygon
): Promise<RawParcelFeature[]> {
  const geometryParam = JSON.stringify({
    rings: polygon.coordinates,
    spatialReference: { wkid: 4326 },
  });
  const url =
    `${FEATURE_SERVER_URL}?geometry=${encodeURIComponent(geometryParam)}` +
    `&geometryType=esriGeometryPolygon&spatialRel=esriSpatialRelIntersects&inSR=4326` +
    `&outFields=PIN,OWNER,PROPCLASS,UNIT,Shape__Area&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Osceola FeatureServer intersects request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { features: RawParcelFeature[] };
  return body.features;
}
```

And add it to the exported adapter:

```typescript
export const osceolaAdapter: CountyParcelAdapter = {
  county: "Osceola",
  fetchParcel,
  normalize,
  fetchParcelsIntersecting,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- osceola && npm run typecheck --workspace=apps/etl`
Expected: PASS (5 tests total in the file), typecheck clean

- [ ] **Step 6: Commit**

```bash
git add apps/etl/src/counties/types.ts apps/etl/src/counties/osceola.ts apps/etl/test/counties/osceola.test.ts
git commit -m "feat(etl): add Osceola fetchParcelsIntersecting and the optional adapter interface member"
```

---

### Task 6: Roscommon's `fetchParcelsIntersecting`

**Files:**
- Modify: `apps/etl/src/counties/roscommon.ts`
- Modify: `apps/etl/test/counties/roscommon.test.ts`

**Interfaces:**
- Consumes: `GeoJSONPolygon` (Task 5).
- Produces: `fetchParcelsIntersecting` on `roscommonAdapter`.

**Verified live:** the same polygon-intersects query pattern against Roscommon's real
FeatureServer (`2027_Parcel_Layer2026515`) returned 303 real features around the target
parcel, with correct `PIN`/`Township` values.

- [ ] **Step 1: Write the failing test**

Add to `apps/etl/test/counties/roscommon.test.ts`:

```typescript
import { fetchParcelsIntersecting } from "../../src/counties/roscommon.js";
// (add to the existing import line)

describe("roscommon fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query, enriches each candidate with township, and returns raw features", async () => {
    const queryResponse = {
      features: [
        {
          type: "Feature",
          properties: { PIN: "011-430-045-0000", Shape__Area: 1046.76 },
          geometry: {
            type: "Polygon",
            coordinates: [[[-84.7755, 44.328], [-84.775, 44.328], [-84.775, 44.3282], [-84.7755, 44.328]]],
          },
        },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Roscommon" } }] };
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        callCount += 1;
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        return { ok: true, json: async () => queryResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-84.78, 44.32], [-84.77, 44.32], [-84.77, 44.33], [-84.78, 44.33], [-84.78, 44.32]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.PIN).toBe("011-430-045-0000");
    expect(features[0].properties.Shape__Area).toBe(1046.76);
    expect(features[0].properties.township).toBe("Roscommon");
    expect(callCount).toBe(2); // parcel query + one MCD lookup for the one candidate
  });

  it("returns an empty array when nothing intersects, without erroring", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- roscommon`
Expected: FAIL with "fetchParcelsIntersecting is not a function"

- [ ] **Step 3: Write the implementation**

Add to `apps/etl/src/counties/roscommon.ts` (after `fetchParcel`, before `normalize`; the
existing `import type { GeoJsonFeature, GeoJsonFeatureCollection }` interfaces already cover
the response shape, and `polygonCentroid`/`fetchTownship` are already imported from
`./shared/township-lookup.js`):

```typescript
export async function fetchParcelsIntersecting(
  polygon: GeoJSONPolygon
): Promise<RawParcelFeature[]> {
  const geometryParam = JSON.stringify({
    rings: polygon.coordinates,
    spatialReference: { wkid: 4326 },
  });
  const url =
    `${PARCEL_FEATURESERVER_QUERY_URL}?f=geojson&geometry=${encodeURIComponent(geometryParam)}` +
    `&geometryType=esriGeometryPolygon&spatialRel=esriSpatialRelIntersects&inSR=4326` +
    `&outFields=PIN,Shape__Area`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Roscommon FeatureServer intersects request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as GeoJsonFeatureCollection;
  const results: RawParcelFeature[] = [];
  for (const feature of body.features) {
    if (feature.geometry.type !== "Polygon") continue;
    const ring = (feature.geometry.coordinates as number[][][])[0] as [number, number][];
    const [centroidLng, centroidLat] = polygonCentroid(ring);
    const township = await fetchTownship(centroidLng, centroidLat);
    results.push({
      properties: {
        PIN: feature.properties.PIN,
        Shape__Area: feature.properties.Shape__Area,
        township,
      },
      geometry: feature.geometry as RawParcelFeature["geometry"],
    });
  }
  return results;
}
```

And add `fetchParcelsIntersecting` to `roscommonAdapter`'s object literal, alongside
`fetchParcel` and `normalize`.

Update the top-level `import type { ..., RawParcelFeature, NormalizedParcelRecord }` line to
also bring in `GeoJSONPolygon` from `./types.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- roscommon && npm run typecheck --workspace=apps/etl`
Expected: PASS (5 tests total in the file), typecheck clean

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/counties/roscommon.ts apps/etl/test/counties/roscommon.test.ts
git commit -m "feat(etl): add Roscommon fetchParcelsIntersecting"
```

---

### Task 7: Iosco's `fetchParcelsIntersecting`, and tighten the interface

**Files:**
- Modify: `apps/etl/src/counties/iosco.ts`
- Modify: `apps/etl/src/counties/types.ts`
- Modify: `apps/etl/test/counties/iosco.test.ts`

**Interfaces:**
- Consumes: `GeoJSONPolygon` (Task 5).
- Produces: `fetchParcelsIntersecting` on `ioscoAdapter`; `CountyParcelAdapter.fetchParcelsIntersecting`
  becomes **required** (drops the `?` added in Task 5) now that all three adapters implement it.

**Verified live:** the same polygon-intersects pattern through the FetchGIS proxy (with the
same `Referer` header `fetchParcel` already uses) returned 7 real features around a test
polygon, with correct `TaxID` values. Building the proxy URL with `encodeURIComponent` on
the geometry parameter only — not on the whole target URL — is required; wrapping the
entire target URL in a second layer of encoding (e.g. via a generic URL-building helper)
breaks the proxy with `"format parameter is invalid"`, confirmed by hitting that exact
error during verification before correcting the construction.

- [ ] **Step 1: Write the failing test**

Add to `apps/etl/test/counties/iosco.test.ts`:

```typescript
import { fetchParcelsIntersecting } from "../../src/counties/iosco.js";
// (add to the existing import line)

describe("iosco fetchParcelsIntersecting", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a polygon-intersects query, reprojects, and enriches each candidate with township", async () => {
    const queryResponse = {
      features: [
        {
          attributes: { TaxID: "062-026-300-020-00", Shape_Area: 370596.15 },
          geometry: { rings: [[[-9287826.28, 5533738.12], [-9288064.71, 5533739.79], [-9287825.31, 5534021.07], [-9287826.28, 5533738.12]]] },
        },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Oscoda" } }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        return { ok: true, json: async () => queryResponse };
      })
    );
    const polygon = {
      type: "Polygon" as const,
      coordinates: [[[-83.44, 44.43], [-83.43, 44.43], [-83.43, 44.44], [-83.44, 44.44], [-83.44, 44.43]]],
    };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(1);
    expect(features[0].properties.TaxID).toBe("062-026-300-020-00");
    expect(features[0].properties.township).toBe("Oscoda");
    expect(features[0].geometry.type).toBe("Polygon");
  });

  it("returns an empty array when nothing intersects, without erroring", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) })));
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- iosco`
Expected: FAIL with "fetchParcelsIntersecting is not a function"

- [ ] **Step 3: Write the implementation**

Add to `apps/etl/src/counties/iosco.ts` (after `fetchParcel`, before `normalize`; update the
top `import type { ..., NormalizedParcelRecord }` line to also import `GeoJSONPolygon`):

```typescript
export async function fetchParcelsIntersecting(
  polygon: GeoJSONPolygon
): Promise<RawParcelFeature[]> {
  const geometryParam = JSON.stringify({
    rings: polygon.coordinates,
    spatialReference: { wkid: 4326 },
  });
  const innerQuery =
    `f=json&geometry=${encodeURIComponent(geometryParam)}&geometryType=esriGeometryPolygon` +
    `&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=TaxID,Shape_Area`;
  const url = `${PROXY_BASE}${PARCEL_FEATURESERVER_QUERY_URL}?${innerQuery}`;
  const res = await fetch(url, { headers: { Referer: FETCHGIS_REFERER } });
  if (!res.ok) {
    throw new Error(
      `Iosco FeatureServer intersects request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as EsriQueryResponse;
  const results: RawParcelFeature[] = [];
  for (const feature of body.features) {
    const ringWgs84 = feature.geometry.rings[0].map(([x, y]) => webMercatorToWgs84(x, y)) as [
      number,
      number,
    ][];
    const [centroidLng, centroidLat] = polygonCentroid(ringWgs84);
    const township = await fetchTownship(centroidLng, centroidLat);
    results.push({
      properties: {
        TaxID: feature.attributes.TaxID,
        Shape_Area: feature.attributes.Shape_Area,
        township,
      },
      geometry: { type: "Polygon", coordinates: [ringWgs84] },
    });
  }
  return results;
}
```

And add `fetchParcelsIntersecting` to `ioscoAdapter`'s object literal.

Then, in `apps/etl/src/counties/types.ts`, drop the `?` added in Task 5:

```typescript
export interface CountyParcelAdapter {
  county: string;
  fetchParcel(pin: string): Promise<RawParcelFeature>;
  normalize(raw: RawParcelFeature): NormalizedParcelRecord;
  fetchParcelsIntersecting(polygon: GeoJSONPolygon): Promise<RawParcelFeature[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl && npm run typecheck --workspace=apps/etl`
Expected: PASS (all tests across the whole `apps/etl` suite), typecheck clean — this is the
first point where dropping the `?` is checked against all three adapters at once.

- [ ] **Step 5: Commit**

```bash
git add apps/etl/src/counties/iosco.ts apps/etl/src/counties/types.ts apps/etl/test/counties/iosco.test.ts
git commit -m "feat(etl): add Iosco fetchParcelsIntersecting, require it on the adapter interface"
```

---

### Task 8: Store schema and persistence

**Files:**
- Create: `apps/etl/src/duckdb/store.ts`
- Test: `apps/etl/test/duckdb/store.test.ts`
- Modify: `apps/etl/.gitignore` (create if it doesn't exist)

**Interfaces:**
- Consumes: `CardDef` from `@brp/schema`.
- Produces: `StoreSession`, `openStore(path): Promise<StoreSession>`,
  `hasCard(session, parcelId): Promise<boolean>`, `insertCard(session, card): Promise<void>`,
  `exportParquet(session, parquetPath): Promise<void>` — all consumed by Task 9.

**Verified live:** `DuckDBInstance.create(<file path>)` creates a real file-backed database
(not just `:memory:`); binding raw JS `null`/`number`/`boolean` values through
`connection.run(sql, params)` round-trips correctly (this codebase's existing DuckDB code
had only ever bound strings before, so this was unverified); a bound JSON string round-trips
through a `JSON` column; `COPY <table> TO '<path>' (FORMAT PARQUET)` followed by
`read_parquet('<path>')` from a separate connection round-trips correctly.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { CardDef } from "@brp/schema";
import { openStore, hasCard, insertCard, exportParquet, type StoreSession } from "../../src/duckdb/store.js";

function makeCard(parcelId: string): CardDef {
  return {
    identity: {
      parcel_id: parcelId,
      county: "Osceola",
      township: "Middle Branch",
      acres: { value: 3.755, provenance: "verified", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
    },
    groundwater: {
      thermal_class: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      designated_trout_stream: { value: false, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "continuous" } },
      flowing_wells_nearby: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" } },
    },
    dry_wet_adjacency: {
      dry_acres: { value: 3.755, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic" } },
      wet_acres: { value: 0, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic" } },
      dominant_dry_soil: {
        value: { series: "Kalkaska", dwelling_rating: "Slight" },
        provenance: "inferred",
        vintage: { as_of: "2026-08-29", source_type: "periodic" },
      },
      adjacent: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "periodic", note: "out of scope" } },
    },
    relief_envelope_to_water_ft: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
    wetland: {
      wetland_pct: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
      wetland_between_envelope_and_water: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
    },
    prominence_ft: { value: null, provenance: "inferred", vintage: { as_of: "2026-08-29", source_type: "static", note: "out of scope" } },
  };
}

describe("duckdb store", () => {
  let dir: string;
  let session: StoreSession;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "brp-store-test-"));
    session = await openStore(join(dir, "test.duckdb"));
  });

  it("hasCard is false before insert and true after", async () => {
    expect(await hasCard(session, "10-003-013-20")).toBe(false);
    await insertCard(session, makeCard("10-003-013-20"));
    expect(await hasCard(session, "10-003-013-20")).toBe(true);
  });

  it("round-trips scalar, boolean, null, and JSON-object fields correctly", async () => {
    await insertCard(session, makeCard("10-003-013-20"));
    const reader = await session.connection.runAndReadAll(
      `SELECT identity_acres_value, groundwater_designated_trout_stream_value,
              groundwater_thermal_class_value,
              dry_wet_adjacency_dominant_dry_soil_value
       FROM cards WHERE parcel_id = $1`,
      ["10-003-013-20"]
    );
    const rows = reader.getRowObjectsJS();
    expect(rows[0].identity_acres_value).toBe(3.755);
    expect(rows[0].groundwater_designated_trout_stream_value).toBe(false);
    expect(rows[0].groundwater_thermal_class_value).toBeNull();
    expect(JSON.parse(String(rows[0].dry_wet_adjacency_dominant_dry_soil_value))).toEqual({
      series: "Kalkaska",
      dwelling_rating: "Slight",
    });
  });

  it("exports to Parquet and the export is independently readable", async () => {
    await insertCard(session, makeCard("10-003-013-20"));
    const parquetPath = join(dir, "test.parquet");
    await exportParquet(session, parquetPath);

    const readBack = await DuckDBInstance.create(":memory:");
    const readConn = await readBack.connect();
    const reader = await readConn.runAndReadAll(
      `SELECT parcel_id FROM read_parquet('${parquetPath}')`
    );
    expect(reader.getRowObjectsJS()).toEqual([{ parcel_id: "10-003-013-20" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=apps/etl -- duckdb/store`
Expected: FAIL with "Cannot find module '../../src/duckdb/store.js'"

- [ ] **Step 3: Write the implementation**

```typescript
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { CardDef } from "@brp/schema";

export interface StoreSession {
  connection: DuckDBConnection;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS cards (
  parcel_id TEXT PRIMARY KEY,
  county TEXT NOT NULL,
  township TEXT NOT NULL,
  identity_acres_value DOUBLE,
  identity_acres_provenance TEXT NOT NULL,
  identity_acres_vintage_as_of TEXT NOT NULL,
  identity_acres_vintage_note TEXT,
  groundwater_thermal_class_value TEXT,
  groundwater_thermal_class_provenance TEXT NOT NULL,
  groundwater_thermal_class_vintage_as_of TEXT NOT NULL,
  groundwater_thermal_class_vintage_note TEXT,
  groundwater_designated_trout_stream_value BOOLEAN,
  groundwater_designated_trout_stream_provenance TEXT NOT NULL,
  groundwater_designated_trout_stream_vintage_as_of TEXT NOT NULL,
  groundwater_designated_trout_stream_vintage_note TEXT,
  groundwater_flowing_wells_nearby_value JSON,
  groundwater_flowing_wells_nearby_provenance TEXT NOT NULL,
  groundwater_flowing_wells_nearby_vintage_as_of TEXT NOT NULL,
  groundwater_flowing_wells_nearby_vintage_note TEXT,
  dry_wet_adjacency_dry_acres_value DOUBLE,
  dry_wet_adjacency_dry_acres_provenance TEXT NOT NULL,
  dry_wet_adjacency_dry_acres_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_dry_acres_vintage_note TEXT,
  dry_wet_adjacency_wet_acres_value DOUBLE,
  dry_wet_adjacency_wet_acres_provenance TEXT NOT NULL,
  dry_wet_adjacency_wet_acres_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_wet_acres_vintage_note TEXT,
  dry_wet_adjacency_dominant_dry_soil_value JSON,
  dry_wet_adjacency_dominant_dry_soil_provenance TEXT NOT NULL,
  dry_wet_adjacency_dominant_dry_soil_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_dominant_dry_soil_vintage_note TEXT,
  dry_wet_adjacency_adjacent_value BOOLEAN,
  dry_wet_adjacency_adjacent_provenance TEXT NOT NULL,
  dry_wet_adjacency_adjacent_vintage_as_of TEXT NOT NULL,
  dry_wet_adjacency_adjacent_vintage_note TEXT,
  relief_envelope_to_water_ft_value DOUBLE,
  relief_envelope_to_water_ft_provenance TEXT NOT NULL,
  relief_envelope_to_water_ft_vintage_as_of TEXT NOT NULL,
  relief_envelope_to_water_ft_vintage_note TEXT,
  wetland_wetland_pct_value DOUBLE,
  wetland_wetland_pct_provenance TEXT NOT NULL,
  wetland_wetland_pct_vintage_as_of TEXT NOT NULL,
  wetland_wetland_pct_vintage_note TEXT,
  wetland_wetland_between_envelope_and_water_value BOOLEAN,
  wetland_wetland_between_envelope_and_water_provenance TEXT NOT NULL,
  wetland_wetland_between_envelope_and_water_vintage_as_of TEXT NOT NULL,
  wetland_wetland_between_envelope_and_water_vintage_note TEXT,
  prominence_ft_value DOUBLE,
  prominence_ft_provenance TEXT NOT NULL,
  prominence_ft_vintage_as_of TEXT NOT NULL,
  prominence_ft_vintage_note TEXT
)`;

export async function openStore(path: string): Promise<StoreSession> {
  const instance = await DuckDBInstance.create(path);
  const connection = await instance.connect();
  await connection.run("INSTALL json;");
  await connection.run("LOAD json;");
  await connection.run(CREATE_TABLE_SQL);
  return { connection };
}

export async function hasCard(session: StoreSession, parcelId: string): Promise<boolean> {
  const reader = await session.connection.runAndReadAll(
    `SELECT COUNT(*) AS n FROM cards WHERE parcel_id = $1`,
    [parcelId]
  );
  const rows = reader.getRowObjectsJS();
  return Number(rows[0].n) > 0;
}

export async function insertCard(session: StoreSession, card: CardDef): Promise<void> {
  const params: unknown[] = [
    card.identity.parcel_id,
    card.identity.county,
    card.identity.township,
    card.identity.acres.value,
    card.identity.acres.provenance,
    card.identity.acres.vintage.as_of,
    card.identity.acres.vintage.note ?? null,
    card.groundwater.thermal_class.value,
    card.groundwater.thermal_class.provenance,
    card.groundwater.thermal_class.vintage.as_of,
    card.groundwater.thermal_class.vintage.note ?? null,
    card.groundwater.designated_trout_stream.value,
    card.groundwater.designated_trout_stream.provenance,
    card.groundwater.designated_trout_stream.vintage.as_of,
    card.groundwater.designated_trout_stream.vintage.note ?? null,
    card.groundwater.flowing_wells_nearby.value === null
      ? null
      : JSON.stringify(card.groundwater.flowing_wells_nearby.value),
    card.groundwater.flowing_wells_nearby.provenance,
    card.groundwater.flowing_wells_nearby.vintage.as_of,
    card.groundwater.flowing_wells_nearby.vintage.note ?? null,
    card.dry_wet_adjacency.dry_acres.value,
    card.dry_wet_adjacency.dry_acres.provenance,
    card.dry_wet_adjacency.dry_acres.vintage.as_of,
    card.dry_wet_adjacency.dry_acres.vintage.note ?? null,
    card.dry_wet_adjacency.wet_acres.value,
    card.dry_wet_adjacency.wet_acres.provenance,
    card.dry_wet_adjacency.wet_acres.vintage.as_of,
    card.dry_wet_adjacency.wet_acres.vintage.note ?? null,
    card.dry_wet_adjacency.dominant_dry_soil.value === null
      ? null
      : JSON.stringify(card.dry_wet_adjacency.dominant_dry_soil.value),
    card.dry_wet_adjacency.dominant_dry_soil.provenance,
    card.dry_wet_adjacency.dominant_dry_soil.vintage.as_of,
    card.dry_wet_adjacency.dominant_dry_soil.vintage.note ?? null,
    card.dry_wet_adjacency.adjacent.value,
    card.dry_wet_adjacency.adjacent.provenance,
    card.dry_wet_adjacency.adjacent.vintage.as_of,
    card.dry_wet_adjacency.adjacent.vintage.note ?? null,
    card.relief_envelope_to_water_ft.value,
    card.relief_envelope_to_water_ft.provenance,
    card.relief_envelope_to_water_ft.vintage.as_of,
    card.relief_envelope_to_water_ft.vintage.note ?? null,
    card.wetland.wetland_pct.value,
    card.wetland.wetland_pct.provenance,
    card.wetland.wetland_pct.vintage.as_of,
    card.wetland.wetland_pct.vintage.note ?? null,
    card.wetland.wetland_between_envelope_and_water.value,
    card.wetland.wetland_between_envelope_and_water.provenance,
    card.wetland.wetland_between_envelope_and_water.vintage.as_of,
    card.wetland.wetland_between_envelope_and_water.vintage.note ?? null,
    card.prominence_ft.value,
    card.prominence_ft.provenance,
    card.prominence_ft.vintage.as_of,
    card.prominence_ft.vintage.note ?? null,
  ];
  const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
  await session.connection.run(`INSERT INTO cards VALUES (${placeholders})`, params);
}

export async function exportParquet(session: StoreSession, parquetPath: string): Promise<void> {
  await session.connection.run(`COPY cards TO '${parquetPath}' (FORMAT PARQUET)`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --workspace=apps/etl -- duckdb/store`
Expected: PASS (3 tests)

- [ ] **Step 5: Gitignore the store directory**

Create or append to `apps/etl/.gitignore`:

```
store/
```

- [ ] **Step 6: Commit**

```bash
git add apps/etl/src/duckdb/store.ts apps/etl/test/duckdb/store.test.ts apps/etl/.gitignore
git commit -m "feat(etl): add local DuckDB/Parquet store matching CardDef's shape"
```

---

### Task 9: Batch runner

**Files:**
- Modify: `apps/etl/src/index.ts` (extract `deriveCardForParcel`, keep `runParcelEtl`
  backward-compatible)
- Create: `apps/etl/src/batch.ts`
- Test: `apps/etl/test/index.test.ts` (extend for the new export)
- Test: `apps/etl/test/integration/blue-ribbon-batch.test.ts` (new, real network — Osceola /
  Middle Branch River only)

**Interfaces:**
- Consumes: everything from Tasks 1–8.
- Produces: `deriveCardForParcel(parcel: NormalizedParcelRecord): Promise<CardDef>` (new,
  from `index.ts`), `BatchSummary`, `runBlueRibbonCorridorBatch(storePath, options?): Promise<BatchSummary>`.

**Why the `index.ts` change:** `fetchParcelsIntersecting` already returns fully-normalized-
ready `RawParcelFeature`s including per-parcel township enrichment (expensive for Iosco and
Roscommon — one MCD lookup per candidate). `runParcelEtl(pin, county)` re-fetches by PIN
internally, which would redo that enrichment a second time for every single candidate parcel
in the batch. Extracting the part of `runParcelEtl` that runs *after* the initial fetch lets
the batch runner reuse the candidate it already has, while `runParcelEtl` itself keeps its
exact existing signature and behavior (both existing integration tests call it unchanged).

- [ ] **Step 1: Refactor `index.ts`, preserving `runParcelEtl`'s existing behavior**

Modify `apps/etl/src/index.ts`. Current body (for reference — this is what's being split):

```typescript
export async function runParcelEtl(pin: string, county: string): Promise<CardDef> {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const parcel = await fetchParcel(pin, county);
  const parcelWkt = ringToWkt(parcel.geometry.coordinates[0]);
  const bbox = bboxFromGeometry(parcel.geometry, MIENVIRO_BBOX_BUFFER_DEG);
  // ...rest of the pipeline...
}
```

Replace it with:

```typescript
import type { NormalizedParcelRecord } from "./counties/types.js";

export async function deriveCardForParcel(parcel: NormalizedParcelRecord): Promise<CardDef> {
  const fetchedAt = new Date().toISOString().slice(0, 10);
  const parcelWkt = ringToWkt(parcel.geometry.coordinates[0]);
  const bbox = bboxFromGeometry(parcel.geometry, MIENVIRO_BBOX_BUFFER_DEG);

  const [coldStreams, troutStreams, soilPolygons] = await Promise.all([
    fetchColdStreams(bbox),
    fetchDesignatedTroutStreams(bbox),
    fetchClippedSoilPolygons(parcelWkt),
  ]);

  const mukeys = [...new Set(soilPolygons.map((p) => p.mukey))];
  const components = await fetchComponents(mukeys);

  const session = await openSpatialSession();
  await loadParcel(session, parcel);
  await loadMiEnviroFeatures(session, "mienviro_1", coldStreams, ["TemperatureGradient"]);
  await loadMiEnviroFeatures(session, "mienviro_32", troutStreams, ["Designated"]);
  await loadSoilPolygons(session, soilPolygons);

  const [thermalClass, designatedTroutStream, soilAreas, verifiedAcres] = await Promise.all([
    computeThermalClass(session),
    computeDesignatedTroutStream(session),
    computeSoilPolygonAreas(session),
    computeParcelAcres(session),
  ]);

  const { dominantDry } = summarizeSoil(soilAreas, components);
  const dominantDrySoilRating = dominantDry
    ? await fetchDwellingRating(dominantDry.cokey)
    : null;

  return deriveCard({
    parcel: { ...parcel, acres: verifiedAcres },
    thermalClass,
    designatedTroutStream,
    soilAreas,
    components,
    dominantDrySoilRating,
    fetchedAt,
  });
}

export async function runParcelEtl(pin: string, county: string): Promise<CardDef> {
  const parcel = await fetchParcel(pin, county);
  return deriveCardForParcel(parcel);
}
```

(Everything else in the file — imports, the `MIENVIRO_BBOX_BUFFER_DEG` constant — stays
unchanged.)

- [ ] **Step 2: Verify the existing integration test still passes unchanged**

Run: `npm run test:integration --workspace=apps/etl -- n20th-ave`
Expected: PASS — this proves the refactor didn't change `runParcelEtl`'s behavior.

- [ ] **Step 3: Write the batch runner**

```typescript
import type { CardDef } from "@brp/schema";
import { BLUE_RIBBON_STREAMS_LP } from "./data/blue-ribbon-streams.js";
import { fetchLowerPeninsulaCounties } from "./fetch/county-boundaries.js";
import { resolveStreamGeometry } from "./fetch/blue-ribbon-geometry.js";
import { openSpatialSession } from "./duckdb/load.js";
import { bufferGeometry, computeIntersectingCounties } from "./duckdb/buffer.js";
import { getCountyAdapter } from "./counties/registry.js";
import { deriveCardForParcel } from "./index.js";
import { openStore, hasCard, insertCard, exportParquet } from "./duckdb/store.js";

const BUFFER_METERS = 1000;
const CORRIDOR_COUNTIES = ["Osceola", "Iosco", "Roscommon"];

export interface BlueRibbonBatchOptions {
  /** Restrict to these counties (default: all 3 corridor counties). */
  counties?: string[];
  /** Restrict to Blue Ribbon stream records with this exact `name` (default: all). */
  streamNames?: string[];
}

export interface BatchSummary {
  candidatesFound: number;
  cardsWritten: number;
  cardsSkipped: number;
  failures: Array<{ pin: string; county: string; error: string }>;
  additionalCountiesFound: string[];
}

export async function runBlueRibbonCorridorBatch(
  storePath: string,
  options: BlueRibbonBatchOptions = {}
): Promise<BatchSummary> {
  const corridorCounties = options.counties ?? CORRIDOR_COUNTIES;
  const summary: BatchSummary = {
    candidatesFound: 0,
    cardsWritten: 0,
    cardsSkipped: 0,
    failures: [],
    additionalCountiesFound: [],
  };

  const lpCounties = await fetchLowerPeninsulaCounties();
  const store = await openStore(storePath);
  const geoSession = await openSpatialSession();
  const additionalCounties = new Set<string>();

  for (const county of corridorCounties) {
    let streamsForCounty = BLUE_RIBBON_STREAMS_LP.filter((s) => s.counties.includes(county));
    if (options.streamNames) {
      streamsForCounty = streamsForCounty.filter((s) => options.streamNames!.includes(s.name));
    }
    const adapter = getCountyAdapter(county);

    for (const record of streamsForCounty) {
      const resolved = await resolveStreamGeometry(record, lpCounties);
      if (resolved === null) {
        summary.failures.push({
          pin: "",
          county,
          error: `No MiEnviro geometry matched for stream "${record.name}" in ${county}`,
        });
        continue;
      }

      const buffer = await bufferGeometry(geoSession, resolved.geometry, BUFFER_METERS);

      const intersectingCounties = await computeIntersectingCounties(geoSession, buffer, lpCounties);
      for (const c of intersectingCounties) {
        if (!corridorCounties.includes(c)) {
          additionalCounties.add(c);
        }
      }

      const candidates = await adapter.fetchParcelsIntersecting(buffer);
      summary.candidatesFound += candidates.length;

      for (const raw of candidates) {
        const normalized = adapter.normalize(raw);
        const alreadyStored = await hasCard(store, normalized.pin);
        if (alreadyStored) {
          summary.cardsSkipped += 1;
          continue;
        }
        try {
          const card: CardDef = await deriveCardForParcel(normalized);
          await insertCard(store, card);
          summary.cardsWritten += 1;
        } catch (err) {
          summary.failures.push({
            pin: normalized.pin,
            county,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  await exportParquet(store, storePath.replace(/\.duckdb$/, ".parquet"));
  summary.additionalCountiesFound = [...additionalCounties].sort();
  return summary;
}
```

- [ ] **Step 4: Write the real integration test (Osceola / Middle Branch River only)**

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBlueRibbonCorridorBatch } from "../../src/batch.js";

describe("Blue Ribbon corridor batch, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "finds real candidate parcels near Osceola's Middle Branch River and writes real cards",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "brp-batch-integration-"));
      const storePath = join(dir, "corridor.duckdb");

      const summary = await runBlueRibbonCorridorBatch(storePath, {
        counties: ["Osceola"],
        streamNames: ["Middle Branch River"],
      });

      expect(summary.failures).toEqual([]);
      expect(summary.candidatesFound).toBeGreaterThan(0);
      expect(summary.cardsWritten).toBeGreaterThan(0);
      expect(summary.cardsWritten).toBe(summary.candidatesFound); // fresh store, nothing skipped
    },
    120_000 // real network + real derive pipeline across every candidate parcel
  );
});
```

- [ ] **Step 5: Run the real integration test**

Run: `npm run test:integration --workspace=apps/etl -- blue-ribbon-batch`
Expected: PASS (this makes real live calls to MiEnviro, the County FeatureServer, Osceola's
parcel FeatureServer, SSURGO SDA, and DuckDB — expect it to take a while)

- [ ] **Step 6: Run the full offline suite and typecheck**

Run: `npm test --workspace=apps/etl && npm run typecheck --workspace=apps/etl`
Expected: PASS, clean

- [ ] **Step 7: Commit**

```bash
git add apps/etl/src/index.ts apps/etl/src/batch.ts apps/etl/test/integration/blue-ribbon-batch.test.ts
git commit -m "feat(etl): add resumable Blue Ribbon corridor batch runner"
```

---

## Self-Review Notes

**Spec coverage:** A (Tasks 1, 3) — done. B (Tasks 4's buffer half, 5–7) — done. C (Tasks
4's county-intersection half, 8, 9) — done. Byproduct county todo list — done (Task 9's
`additionalCountiesFound`, computed via Task 4's `computeIntersectingCounties`). Resumability
— done (Task 9's `hasCard` check before deriving). Small integration test slice — done (Task
9, Osceola/Middle Branch only, matching the spec's explicit choice).

**Type consistency:** `GeoJSONPolygon` (Task 5) is the same shape used by every adapter's
`fetchParcelsIntersecting` (Tasks 5–7) and by `bufferGeometry`'s return type (Task 4).
`DuckDbSession` (existing, `load.ts`) is reused unchanged by Task 4; `StoreSession` (Task 8)
is deliberately a separate, smaller type (just a connection, no spatial extension needed for
the store) rather than overloading `DuckDbSession` for a different purpose.

**Placeholder scan:** no TBD/TODO; every step has real code, real verified endpoints, real
expected values from live checks made during planning.
