# apps/etl Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/etl`, a TypeScript app that fetches real data (MiEnviro, SSURGO/SDA, a
county parcel FeatureServer), runs the geometry math as DuckDB spatial SQL, and assembles a
validated `CardDef` — proven end to end against N 20th Ave's three real parcels, checked
against `packages/schema`'s existing golden fixture.

**Architecture:** Fetch modules hit real endpoints and return plain data (no geometry math).
A DuckDB in-memory session loads that data and does every spatial computation in SQL. A
`derive.ts` module turns DuckDB's query results into a `CardDef` and validates it. A thin
`index.ts` orchestrates one parcel end to end. Parcels get a per-county adapter (only Osceola
registered this pass) so a second county is "write an adapter," not "rewrite the fetch code."

**Tech Stack:** TypeScript (strict), Vitest, `@duckdb/node-api` + the `spatial` extension,
npm workspaces (this plan adds the root wiring).

**Spec:** `docs/superpowers/specs/2026-08-28-etl-vertical-slice-design.md`

## Global Constraints

- TypeScript strict mode throughout — no `any`, no implicit `undefined` where `null` is meant.
- **Geometry math runs in DuckDB SQL, never in application code.** Fetch modules return raw
  data; only `duckdb/compute.ts` computes `ST_Intersects`/area.
- **Area computations use the verified formula, never `ST_Area_Spheroid` or
  `ST_Transform`-based area** (both proven wrong at this latitude during spec verification):
  `ST_Area(geom) * POWER(111320.0, 2) * COS(RADIANS(ST_Y(ST_Centroid(geom)))) / 4046.8564224`
- **DuckDB client is `@duckdb/node-api`** (verified working on this environment) — not the
  older `duckdb` npm package (its native binding does not load here).
- **Every fetch endpoint/query below is copied from queries already run and verified working
  earlier this session** — do not invent alternate endpoints or query syntax.
- **`groundwater.thermal_class` is `null` for all three N 20th Ave parcels** (corrected
  2026-08-28 in `packages/schema` — see that fixture's note). `designated_trout_stream` is
  `true` on parcel `10-003-008-00` only, `false` on the other two.
- Unit tests run offline (mocked `fetch`, hand-built DuckDB tables) and are part of the
  default `npm test`. Exactly one integration test hits the real network and real DuckDB
  end to end — separate `npm run test:integration` script, not part of default `npm test`.
- Only Osceola gets a `CountyParcelAdapter` in this plan. Roscommon and Oscoda are explicitly
  out of scope (see the spec).

---

### Task 1: Root workspace wiring + apps/etl scaffold

**Files:**
- Create: `package.json` (repo root — does not exist yet)
- Create: `apps/etl/package.json`
- Create: `apps/etl/tsconfig.json`
- Create: `apps/etl/tsconfig.test.json`
- Create: `apps/etl/vitest.config.ts`
- Create: `apps/etl/vitest.integration.config.ts`
- Create: `apps/etl/test/smoke.test.ts`
- Modify: remove `packages/schema/package-lock.json` (superseded by the root lockfile —
  npm workspaces uses one lockfile at the root, not one per package)

**Interfaces:**
- Produces: a working `npm test`, `npm run test:integration`, and `npm run typecheck` in
  `apps/etl/`, run from a workspace root that also still builds `packages/schema` correctly.
  Every later task depends on this.

- [ ] **Step 1: Write the root workspace manifest**

```json
{
  "name": "blue-ribbon-properties",
  "private": true,
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

Save as `package.json` at the repo root.

- [ ] **Step 2: Remove packages/schema's standalone lockfile**

Run: `rm /Users/jordan/code/blue-ribbon-properties/packages/schema/package-lock.json`
Run: `rm -rf /Users/jordan/code/blue-ribbon-properties/packages/schema/node_modules`

(npm workspaces installs and hoists dependencies from the root — a per-package lockfile
would conflict with that. The root install in Step 9 recreates what's needed.)

- [ ] **Step 3: Write apps/etl's package manifest**

```json
{
  "name": "@brp/etl",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.test.json"
  },
  "dependencies": {
    "@brp/schema": "*",
    "@duckdb/node-api": "^1.5.5-r.4"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Save as `apps/etl/package.json`.

- [ ] **Step 4: Write the TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

Save as `apps/etl/tsconfig.json`.

- [ ] **Step 5: Write the test tsconfig**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["src", "test"]
}
```

Save as `apps/etl/tsconfig.test.json`.

- [ ] **Step 6: Write the two Vitest configs**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**", "**/node_modules/**"],
  },
});
```

Save as `apps/etl/vitest.config.ts`.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
  },
});
```

Save as `apps/etl/vitest.integration.config.ts`.

- [ ] **Step 7: Write a smoke test**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain smoke test", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Save as `apps/etl/test/smoke.test.ts`.

- [ ] **Step 8: Create empty directories the later tasks need**

Run: `mkdir -p apps/etl/src/counties apps/etl/src/fetch apps/etl/src/duckdb apps/etl/test/counties apps/etl/test/fetch apps/etl/test/duckdb apps/etl/test/integration`

- [ ] **Step 9: Install from the workspace root**

Run: `cd /Users/jordan/code/blue-ribbon-properties && npm install`
Expected: installs dependencies for both `packages/schema` and `apps/etl` in one pass,
creates a root `package-lock.json`, hoists shared deps into the root `node_modules`.

- [ ] **Step 10: Verify packages/schema still works after the workspace reorganization**

Run: `cd /Users/jordan/code/blue-ribbon-properties/packages/schema && npm test`
Expected: PASS — 38/38 tests still passing (this is a regression check, not new work).

Run: `cd /Users/jordan/code/blue-ribbon-properties/packages/schema && npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Verify apps/etl's toolchain works**

Run: `cd /Users/jordan/code/blue-ribbon-properties/apps/etl && npm test`
Expected: PASS — 1 test passed.

Run: `cd /Users/jordan/code/blue-ribbon-properties/apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add package.json package-lock.json apps/etl/package.json apps/etl/tsconfig.json apps/etl/tsconfig.test.json apps/etl/vitest.config.ts apps/etl/vitest.integration.config.ts apps/etl/test/smoke.test.ts packages/schema/package-lock.json
git commit -m "chore(etl): add npm workspace root and scaffold apps/etl"
```

(The `git add` on `packages/schema/package-lock.json` stages its *removal* — `git add`
correctly stages deletions of tracked files.)

---

### Task 2: counties/ — adapter harness + Osceola adapter

**Files:**
- Create: `apps/etl/src/counties/types.ts`
- Create: `apps/etl/src/counties/osceola.ts`
- Create: `apps/etl/src/counties/registry.ts`
- Test: `apps/etl/test/counties/osceola.test.ts`
- Test: `apps/etl/test/counties/registry.test.ts`

**Interfaces:**
- Consumes: nothing (base module for this app).
- Produces: `RawParcelFeature`, `NormalizedParcelRecord`, `CountyParcelAdapter` types;
  `osceolaAdapter` (implementing `CountyParcelAdapter`); `getCountyAdapter(county: string):
  CountyParcelAdapter`. Task 3's `fetch/parcels.ts` imports `getCountyAdapter` from
  `../counties/registry.js`.

- [ ] **Step 1: Write the type definitions (no test needed — pure types)**

```ts
export interface RawParcelFeature {
  properties: Record<string, unknown>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

export interface NormalizedParcelRecord {
  pin: string; // canonical form: NN-NNN-NNN-NN, e.g. "10-003-008-00"
  county: string;
  township: string;
  acres: number;
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface CountyParcelAdapter {
  county: string;
  fetchParcel(pin: string): Promise<RawParcelFeature>;
  normalize(raw: RawParcelFeature): NormalizedParcelRecord;
}
```

Save as `apps/etl/src/counties/types.ts`.

- [ ] **Step 2: Write the failing test for the Osceola adapter**

```ts
import { describe, it, expect } from "vitest";
import { normalize } from "../../src/counties/osceola.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-85.1302116901917, 44.0682264905314],
          [-85.1297927773973, 44.0676977847693],
          [-85.1284158128495, 44.0676948301085],
          [-85.1302116901917, 44.0682264905314],
        ],
      ],
    },
    properties: {
      PIN: "10 003 008 00",
      OWNER: "SPRAGUE WILLIAM E",
      PROPCLASS: "RESIDENTIAL",
      UNIT: "MIDDLE BRANCH TOWNSHIP",
      Shape__Area: 453941.4482421875,
      ...propertyOverrides,
    },
  };
}

describe("osceola normalize", () => {
  it("converts a raw Osceola feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("10-003-008-00");
    expect(result.county).toBe("Osceola");
    expect(result.township).toBe("Middle Branch");
    expect(result.acres).toBeCloseTo(10.421, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(4);
  });

  it("throws a clear error for a malformed raw PIN", () => {
    const raw = makeRawFeature({ PIN: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('cannot normalize PIN "not-a-pin"');
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});
```

Save as `apps/etl/test/counties/osceola.test.ts`.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../../src/counties/osceola.js'`.

- [ ] **Step 4: Write the Osceola adapter implementation**

```ts
import type {
  CountyParcelAdapter,
  RawParcelFeature,
  NormalizedParcelRecord,
} from "./types.js";

const FEATURE_SERVER_URL =
  "https://services8.arcgis.com/FmKMwUEmDSC75SQm/arcgis/rest/services/OsceolaCountyParcels_view/FeatureServer/0/query";

/** Osceola PINs render canonically as "10-003-013-20", but the county's own
 * FeatureServer splits them into separate Twp/Sec/ID fields to query by. */
function parsePin(pin: string): { twp: string; sec: string; id: string } {
  const match = pin.match(/^(\d{2})-(\d{3})-(\d{3})-(\d{2})$/);
  if (!match) {
    throw new Error(`Osceola adapter: "${pin}" is not a valid NN-NNN-NNN-NN PIN`);
  }
  const [, twp, sec, idPart1, idPart2] = match;
  return { twp, sec, id: `${idPart1} ${idPart2}` };
}

export async function fetchParcel(pin: string): Promise<RawParcelFeature> {
  const { twp, sec, id } = parsePin(pin);
  const where = `Twp='${twp}' AND Sec='${sec}' AND ID='${id}'`;
  const url =
    `${FEATURE_SERVER_URL}?where=${encodeURIComponent(where)}` +
    `&outFields=PIN,OWNER,PROPCLASS,UNIT,Shape__Area&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Osceola FeatureServer request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as { features: RawParcelFeature[] };
  if (body.features.length === 0) {
    throw new Error(`Osceola adapter: no parcel found for PIN "${pin}"`);
  }
  return body.features[0];
}

export function normalize(raw: RawParcelFeature): NormalizedParcelRecord {
  const props = raw.properties;
  const rawPin = String(props.PIN); // e.g. "10 003 008 00"
  const pinMatch = rawPin.match(/^(\d{2})\s+(\d{3})\s+(\d{3})\s+(\d{2})$/);
  if (!pinMatch) {
    throw new Error(`Osceola adapter: cannot normalize PIN "${rawPin}"`);
  }
  const [, twp, sec, idPart1, idPart2] = pinMatch;
  const canonicalPin = `${twp}-${sec}-${idPart1}-${idPart2}`;

  const unit = String(props.UNIT ?? ""); // e.g. "MIDDLE BRANCH TOWNSHIP"
  const townshipRaw = unit.replace(/\s+TOWNSHIP$/i, "").trim();
  const township = townshipRaw
    .split(" ")
    .map((w) => (w.length > 0 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(" ");

  const shapeAreaSqFt = Number(props.Shape__Area);
  const acres = shapeAreaSqFt / 43560;

  if (raw.geometry.type !== "Polygon") {
    throw new Error(
      `Osceola adapter: expected Polygon geometry, got "${raw.geometry.type}"`
    );
  }

  return {
    pin: canonicalPin,
    county: "Osceola",
    township,
    acres,
    geometry: {
      type: "Polygon",
      coordinates: raw.geometry.coordinates as number[][][],
    },
  };
}

export const osceolaAdapter: CountyParcelAdapter = {
  county: "Osceola",
  fetchParcel,
  normalize,
};
```

Save as `apps/etl/src/counties/osceola.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 4 tests passed (3 from this file + 1 smoke test).

- [ ] **Step 6: Write the failing test for the registry**

```ts
import { describe, it, expect } from "vitest";
import { getCountyAdapter } from "../../src/counties/registry.js";

describe("getCountyAdapter", () => {
  it("resolves the Osceola adapter", () => {
    const adapter = getCountyAdapter("Osceola");
    expect(adapter.county).toBe("Osceola");
    expect(typeof adapter.fetchParcel).toBe("function");
    expect(typeof adapter.normalize).toBe("function");
  });

  it("throws a clear error for an unregistered county", () => {
    expect(() => getCountyAdapter("Roscommon")).toThrow(
      'No CountyParcelAdapter registered for county "Roscommon"'
    );
  });
});
```

Save as `apps/etl/test/counties/registry.test.ts`.

- [ ] **Step 7: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../../src/counties/registry.js'`.

- [ ] **Step 8: Write the registry implementation**

```ts
import type { CountyParcelAdapter } from "./types.js";
import { osceolaAdapter } from "./osceola.js";

export const COUNTY_REGISTRY: Record<string, CountyParcelAdapter> = {
  Osceola: osceolaAdapter,
};

export function getCountyAdapter(county: string): CountyParcelAdapter {
  const adapter = COUNTY_REGISTRY[county];
  if (!adapter) {
    throw new Error(`No CountyParcelAdapter registered for county "${county}"`);
  }
  return adapter;
}
```

Save as `apps/etl/src/counties/registry.ts`.

- [ ] **Step 9: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 6 tests passed (2 new + 4 from earlier steps).

- [ ] **Step 10: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/counties apps/etl/test/counties
git commit -m "feat(etl): add county parcel adapter harness with Osceola adapter"
```

---

### Task 3: fetch/parcels.ts

**Files:**
- Create: `apps/etl/src/fetch/parcels.ts`
- Test: `apps/etl/test/fetch/parcels.test.ts`

**Interfaces:**
- Consumes: `getCountyAdapter` from `../counties/registry.js` (Task 2).
- Produces: `fetchParcel(pin: string, county: string): Promise<NormalizedParcelRecord>` from
  `../src/fetch/parcels.js`. `index.ts` (Task 8) imports this.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { fetchParcel } from "../../src/fetch/parcels.js";

vi.mock("../../src/counties/registry.js", () => ({
  getCountyAdapter: vi.fn((county: string) => {
    if (county !== "TestCounty") {
      throw new Error(`No CountyParcelAdapter registered for county "${county}"`);
    }
    return {
      county: "TestCounty",
      fetchParcel: vi.fn(async (pin: string) => ({
        properties: { pin },
        geometry: { type: "Polygon", coordinates: [] },
      })),
      normalize: vi.fn((raw: { properties: { pin: string } }) => ({
        pin: raw.properties.pin,
        county: "TestCounty",
        township: "Test Township",
        acres: 5,
        geometry: { type: "Polygon", coordinates: [] },
      })),
    };
  }),
}));

describe("fetch/parcels", () => {
  it("delegates to the county adapter's fetch + normalize", async () => {
    const result = await fetchParcel("00-000-000-00", "TestCounty");
    expect(result.pin).toBe("00-000-000-00");
    expect(result.county).toBe("TestCounty");
    expect(result.acres).toBe(5);
  });

  it("propagates the registry's error for an unknown county", async () => {
    await expect(fetchParcel("00-000-000-00", "Nowhere")).rejects.toThrow(
      'No CountyParcelAdapter registered for county "Nowhere"'
    );
  });
});
```

Save as `apps/etl/test/fetch/parcels.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../../src/fetch/parcels.js'`.

- [ ] **Step 3: Write the implementation**

```ts
import { getCountyAdapter } from "../counties/registry.js";
import type { NormalizedParcelRecord } from "../counties/types.js";

export async function fetchParcel(
  pin: string,
  county: string
): Promise<NormalizedParcelRecord> {
  const adapter = getCountyAdapter(county);
  const raw = await adapter.fetchParcel(pin);
  return adapter.normalize(raw);
}
```

Save as `apps/etl/src/fetch/parcels.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 8 tests passed (2 new + 6 from Task 2).

- [ ] **Step 5: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/fetch/parcels.ts apps/etl/test/fetch/parcels.test.ts
git commit -m "feat(etl): add fetch/parcels.ts (county-adapter-backed)"
```

---

### Task 4: fetch/mienviro.ts

**Files:**
- Create: `apps/etl/src/fetch/mienviro.ts`
- Test: `apps/etl/test/fetch/mienviro.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses the global `fetch`).
- Produces: `BBox` type, `MiEnviroFeature` type, `bboxFromGeometry(geometry, bufferDeg):
  BBox`, `fetchColdStreams(bbox): Promise<MiEnviroFeature[]>`,
  `fetchDesignatedTroutStreams(bbox): Promise<MiEnviroFeature[]>` from
  `../src/fetch/mienviro.js`. `index.ts` (Task 8) imports all of these; `duckdb/load.ts`
  (Task 6) imports the `MiEnviroFeature` type.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  bboxFromGeometry,
  fetchColdStreams,
  fetchDesignatedTroutStreams,
} from "../../src/fetch/mienviro.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bboxFromGeometry", () => {
  it("computes a buffered bbox from polygon coordinates", () => {
    const geometry = {
      coordinates: [
        [
          [-85.13, 44.068],
          [-85.128, 44.068],
          [-85.128, 44.069],
          [-85.13, 44.069],
          [-85.13, 44.068],
        ],
      ],
    };
    const bbox = bboxFromGeometry(geometry, 0.01);
    expect(bbox[0]).toBeCloseTo(-85.14, 5);
    expect(bbox[1]).toBeCloseTo(44.058, 5);
    expect(bbox[2]).toBeCloseTo(-85.118, 5);
    expect(bbox[3]).toBeCloseTo(44.079, 5);
  });
});

describe("fetchColdStreams", () => {
  it("returns features from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-85.17, 44.12],
              [-85.16, 44.12],
            ],
          },
          properties: {
            NHSStreamName: "Middle Branch River",
            ReachCode: "04060102000219",
            TemperatureGradient: "Cold stream",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockResponse }))
    );
    const features = await fetchColdStreams([-85.18, 44.11, -85.15, 44.13]);
    expect(features).toHaveLength(1);
    expect(features[0].properties.TemperatureGradient).toBe("Cold stream");
  });

  it("returns an empty array when nothing intersects (the real N 20th Ave case)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ type: "FeatureCollection", features: [] }),
      }))
    );
    const features = await fetchColdStreams([-85.14, 44.064, -85.125, 44.072]);
    expect(features).toEqual([]);
  });

  it("throws a clear error on an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }))
    );
    await expect(
      fetchColdStreams([-85.18, 44.11, -85.15, 44.13])
    ).rejects.toThrow("MiEnviro layer 1 request failed: 500 Internal Server Error");
  });
});

describe("fetchDesignatedTroutStreams", () => {
  it("returns features from a successful response", async () => {
    const mockResponse = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-85.134, 44.07],
              [-85.125, 44.056],
            ],
          },
          properties: {
            GNISName: "Middle Branch River",
            RegulationType: "Type 1",
            Designated: 1,
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => mockResponse }))
    );
    const features = await fetchDesignatedTroutStreams([
      -85.14, 44.064, -85.125, 44.072,
    ]);
    expect(features).toHaveLength(1);
    expect(features[0].properties.Designated).toBe(1);
  });
});
```

Save as `apps/etl/test/fetch/mienviro.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../../src/fetch/mienviro.js'`.

- [ ] **Step 3: Write the implementation**

```ts
const MIENVIRO_BASE =
  "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer";

export interface MiEnviroFeature {
  type: "Feature";
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

interface MiEnviroFeatureCollection {
  type: "FeatureCollection";
  features: MiEnviroFeature[];
}

export type BBox = [minLon: number, minLat: number, maxLon: number, maxLat: number];

async function queryLayer(
  layerId: number,
  bbox: BBox,
  outFields: string[]
): Promise<MiEnviroFeature[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const url =
    `${MIENVIRO_BASE}/${layerId}/query?geometry=${minLon},${minLat},${maxLon},${maxLat}` +
    `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326` +
    `&outFields=${outFields.join(",")}&f=geojson`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `MiEnviro layer ${layerId} request failed: ${res.status} ${res.statusText}`
    );
  }
  const body = (await res.json()) as MiEnviroFeatureCollection;
  return body.features;
}

/** Layer 1: Cold/Cold Transitional Streams. */
export function fetchColdStreams(bbox: BBox): Promise<MiEnviroFeature[]> {
  return queryLayer(1, bbox, ["NHSStreamName", "ReachCode", "TemperatureGradient"]);
}

/** Layer 32: Designated Trout Stream. */
export function fetchDesignatedTroutStreams(bbox: BBox): Promise<MiEnviroFeature[]> {
  return queryLayer(32, bbox, ["GNISName", "RegulationType", "Designated"]);
}

export function bboxFromGeometry(
  geometry: { coordinates: number[][][] },
  bufferDeg: number
): BBox {
  const coords = geometry.coordinates[0];
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [
    Math.min(...lons) - bufferDeg,
    Math.min(...lats) - bufferDeg,
    Math.max(...lons) + bufferDeg,
    Math.max(...lats) + bufferDeg,
  ];
}
```

Save as `apps/etl/src/fetch/mienviro.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 13 tests passed (5 new + 8 from Tasks 2–3).

- [ ] **Step 5: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/fetch/mienviro.ts apps/etl/test/fetch/mienviro.test.ts
git commit -m "feat(etl): add fetch/mienviro.ts for layers 1 and 32"
```

---

### Task 5: fetch/ssurgo.ts

**Files:**
- Create: `apps/etl/src/fetch/ssurgo.ts`
- Test: `apps/etl/test/fetch/ssurgo.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (uses the global `fetch`).
- Produces: `ClippedSoilPolygon`, `ComponentInfo` types; `ringToWkt(ring): string`,
  `fetchClippedSoilPolygons(parcelWkt): Promise<ClippedSoilPolygon[]>`,
  `fetchComponents(mukeys): Promise<ComponentInfo[]>`,
  `fetchDwellingRating(cokey): Promise<string | null>` from `../src/fetch/ssurgo.js`.
  `index.ts` (Task 8) and `duckdb/compute.test.ts`'s helper usage (Task 6) both import
  `ringToWkt`; `duckdb/load.ts` (Task 6) imports the `ClippedSoilPolygon` type;
  `derive.ts` (Task 7) imports the `ComponentInfo` type.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ringToWkt,
  fetchClippedSoilPolygons,
  fetchComponents,
  fetchDwellingRating,
} from "../../src/fetch/ssurgo.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ringToWkt", () => {
  it("converts a coordinate ring to WKT POLYGON text", () => {
    const ring = [
      [-85.13, 44.068],
      [-85.128, 44.068],
      [-85.128, 44.069],
      [-85.13, 44.068],
    ];
    expect(ringToWkt(ring)).toBe(
      "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))"
    );
  });
});

describe("fetchClippedSoilPolygons", () => {
  it("parses SDA's Table rows into ClippedSoilPolygon objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Table: [
            [
              "190064",
              "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))",
            ],
            [
              "189980",
              "POLYGON((-85.132 44.068,-85.13 44.068,-85.13 44.069,-85.132 44.068))",
            ],
          ],
        }),
      }))
    );
    const polygons = await fetchClippedSoilPolygons("POLYGON((...))");
    expect(polygons).toEqual([
      {
        mukey: "190064",
        wkt: "POLYGON((-85.13 44.068,-85.128 44.068,-85.128 44.069,-85.13 44.068))",
      },
      {
        mukey: "189980",
        wkt: "POLYGON((-85.132 44.068,-85.13 44.068,-85.13 44.069,-85.132 44.068))",
      },
    ]);
  });

  it("returns an empty array when SDA's Table field is absent (no intersection)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    );
    const polygons = await fetchClippedSoilPolygons("POLYGON((...))");
    expect(polygons).toEqual([]);
  });
});

describe("fetchComponents", () => {
  it("parses component rows, converting numeric/nullable fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          Table: [
            [
              "190064",
              "Kalkaska",
              "95",
              "Somewhat excessively drained",
              null,
              "27171875",
            ],
            [
              "189980",
              "Au Gres",
              "90",
              "Somewhat poorly drained",
              "12",
              "27171661",
            ],
          ],
        }),
      }))
    );
    const components = await fetchComponents(["190064", "189980"]);
    expect(components).toEqual([
      {
        mukey: "190064",
        compname: "Kalkaska",
        comppct_r: 95,
        drainagecl: "Somewhat excessively drained",
        wtdepannmin: null,
        cokey: "27171875",
      },
      {
        mukey: "189980",
        compname: "Au Gres",
        comppct_r: 90,
        drainagecl: "Somewhat poorly drained",
        wtdepannmin: 12,
        cokey: "27171661",
      },
    ]);
  });

  it("returns an empty array for an empty mukey list without making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const components = await fetchComponents([]);
    expect(components).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchDwellingRating", () => {
  it("returns the interphrc rating for a cokey", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ Table: [["Not limited"]] }),
      }))
    );
    const rating = await fetchDwellingRating("27171875");
    expect(rating).toBe("Not limited");
  });

  it("returns null when no rating row is found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ Table: [] }) }))
    );
    const rating = await fetchDwellingRating("00000000");
    expect(rating).toBeNull();
  });
});
```

Save as `apps/etl/test/fetch/ssurgo.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../../src/fetch/ssurgo.js'`.

- [ ] **Step 3: Write the implementation**

```ts
const SDA_URL = "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest";

export interface ClippedSoilPolygon {
  mukey: string;
  wkt: string;
}

export interface ComponentInfo {
  mukey: string;
  compname: string;
  comppct_r: number;
  drainagecl: string | null;
  wtdepannmin: number | null;
  cokey: string;
}

async function sdaQuery(query: string): Promise<string[][]> {
  const res = await fetch(SDA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, format: "JSON" }),
  });
  if (!res.ok) {
    throw new Error(`SDA request failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { Table?: string[][] };
  return body.Table ?? [];
}

/** Converts a GeoJSON polygon ring to WKT POLYGON text. */
export function ringToWkt(ring: number[][]): string {
  const points = ring.map(([lon, lat]) => `${lon} ${lat}`).join(",");
  return `POLYGON((${points}))`;
}

/** SDA's own server-side clip — used to scope what gets fetched, not to
 * compute area. Returns clipped soil-polygon geometry per mukey/segment;
 * DuckDB (duckdb/compute.ts) computes the actual acreage. */
export async function fetchClippedSoilPolygons(
  parcelWkt: string
): Promise<ClippedSoilPolygon[]> {
  const escapedWkt = parcelWkt.replace(/'/g, "''");
  const query = `
WITH geom_data (geom, mukey) AS (
  SELECT mupolygongeo.STIntersection(geometry::STGeomFromText('${escapedWkt}', 4326)) AS geom, mukey
  FROM mupolygon
  WHERE mupolygongeo.STIntersects(geometry::STGeomFromText('${escapedWkt}', 4326)) = 1
)
SELECT mukey, geom.STAsText() AS wkt
FROM geom_data
`;
  const rows = await sdaQuery(query);
  return rows.map(([mukey, wkt]) => ({ mukey, wkt }));
}

export async function fetchComponents(mukeys: string[]): Promise<ComponentInfo[]> {
  if (mukeys.length === 0) return [];
  const mukeyList = mukeys.map((m) => `'${m}'`).join(",");
  const query = `
SELECT mukey, compname, comppct_r, drainagecl, wtdepannmin, cokey
FROM component
WHERE mukey IN (${mukeyList}) AND majcompflag = 'Yes'
`;
  const rows = await sdaQuery(query);
  return rows.map(([mukey, compname, comppct_r, drainagecl, wtdepannmin, cokey]) => ({
    mukey,
    compname,
    comppct_r: Number(comppct_r),
    drainagecl: drainagecl || null,
    wtdepannmin: wtdepannmin ? Number(wtdepannmin) : null,
    cokey,
  }));
}

/** The interpretation rating for "dwellings without basements" — 'ruledepth = 0'
 * selects the top-level rating row and excludes the sub-rule "reason" rows
 * (e.g. "Depth to saturated zone") that share the same mrulename. */
export async function fetchDwellingRating(cokey: string): Promise<string | null> {
  const query = `
SELECT interphrc
FROM cointerp
WHERE cokey = '${cokey}' AND mrulename = 'ENG - Dwellings W/O Basements' AND ruledepth = 0
`;
  const rows = await sdaQuery(query);
  return rows.length > 0 ? rows[0][0] : null;
}
```

Save as `apps/etl/src/fetch/ssurgo.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 20 tests passed (7 new + 13 from Tasks 2–4).

- [ ] **Step 5: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/fetch/ssurgo.ts apps/etl/test/fetch/ssurgo.test.ts
git commit -m "feat(etl): add fetch/ssurgo.ts (SDA clip, components, dwelling rating)"
```

---

### Task 6: duckdb/ — load.ts + compute.ts

**Files:**
- Create: `apps/etl/src/duckdb/load.ts`
- Create: `apps/etl/src/duckdb/compute.ts`
- Test: `apps/etl/test/duckdb/compute.test.ts`

**Interfaces:**
- Consumes: `NormalizedParcelRecord` from `../counties/types.js` (Task 2), `MiEnviroFeature`
  from `../fetch/mienviro.js` (Task 4), `ClippedSoilPolygon` and `ringToWkt` from
  `../fetch/ssurgo.js` (Task 5).
- Produces: `DuckDbSession` type, `openSpatialSession()`, `loadParcel()`,
  `loadMiEnviroFeatures()`, `loadSoilPolygons()` from `../src/duckdb/load.js`;
  `SoilPolygonArea` type, `computeThermalClass()`, `computeDesignatedTroutStream()`,
  `computeSoilPolygonAreas()` from `../src/duckdb/compute.js`. `derive.ts` (Task 7) imports
  `SoilPolygonArea`. `index.ts` (Task 8) imports everything from both files.

This task's test loads real (synthetic but geometrically valid) data through `load.ts` and
queries it through `compute.ts` in one pass — no network involved (DuckDB itself is local),
and it directly verifies the area formula against the spike's own already-proven number.

- [ ] **Step 1: Write load.ts (no isolated test — exercised together with compute.ts below)**

```ts
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { NormalizedParcelRecord } from "../counties/types.js";
import type { MiEnviroFeature } from "../fetch/mienviro.js";
import type { ClippedSoilPolygon } from "../fetch/ssurgo.js";

export interface DuckDbSession {
  connection: DuckDBConnection;
}

export async function openSpatialSession(): Promise<DuckDbSession> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  await connection.run("INSTALL spatial;");
  await connection.run("LOAD spatial;");
  return { connection };
}

export async function loadParcel(
  session: DuckDbSession,
  parcel: NormalizedParcelRecord
): Promise<void> {
  await session.connection.run("CREATE TABLE parcel (pin VARCHAR, geom GEOMETRY)");
  await session.connection.run(
    "INSERT INTO parcel VALUES ($1, ST_GeomFromGeoJSON($2::VARCHAR))",
    [parcel.pin, JSON.stringify(parcel.geometry)]
  );
}

/** Loads MiEnviro features into a named table with one VARCHAR column per
 * requested property (read off each feature's `properties`, missing values
 * become empty strings — callers only ever request properties they know are
 * present in the layer's schema). */
export async function loadMiEnviroFeatures(
  session: DuckDbSession,
  tableName: string,
  features: MiEnviroFeature[],
  propertyColumns: string[]
): Promise<void> {
  const colDefs = ["geom GEOMETRY", ...propertyColumns.map((c) => `"${c}" VARCHAR`)].join(
    ", "
  );
  await session.connection.run(`CREATE TABLE ${tableName} (${colDefs})`);
  for (const feature of features) {
    const geojson = JSON.stringify(feature.geometry);
    const values = propertyColumns.map((c) => String(feature.properties[c] ?? ""));
    const placeholders = values.map((_, i) => `$${i + 2}`).join(", ");
    const columnsClause = values.length > 0 ? `, ${placeholders}` : "";
    await session.connection.run(
      `INSERT INTO ${tableName} VALUES (ST_GeomFromGeoJSON($1::VARCHAR)${columnsClause})`,
      [geojson, ...values]
    );
  }
}

export async function loadSoilPolygons(
  session: DuckDbSession,
  polygons: ClippedSoilPolygon[]
): Promise<void> {
  await session.connection.run("CREATE TABLE soil_polygons (mukey VARCHAR, geom GEOMETRY)");
  for (const p of polygons) {
    await session.connection.run(
      "INSERT INTO soil_polygons VALUES ($1, ST_GeomFromText($2::VARCHAR))",
      [p.mukey, p.wkt]
    );
  }
}
```

Save as `apps/etl/src/duckdb/load.ts`.

- [ ] **Step 2: Write compute.ts**

```ts
import type { DuckDbSession } from "./load.js";

const METERS_PER_DEGREE = 111320.0;
const SQUARE_METERS_PER_ACRE = 4046.8564224;

/** The verified area formula (see the design spec, decision 1) — NOT
 * ST_Area_Spheroid or an ST_Transform-based area, both proven wrong by ~8.4x
 * at this latitude during spec verification. Raw planar shoelace area in
 * degree^2, times meters-per-degree^2 at the equator, times a per-row
 * cos(centroid latitude) longitude-compression correction, divided by m^2
 * per acre. Valid at parcel scale (a few acres, sub-degree extent). */
const AREA_ACRES_SQL = `ST_Area(geom) * POWER(${METERS_PER_DEGREE}, 2) * COS(RADIANS(ST_Y(ST_Centroid(geom)))) / ${SQUARE_METERS_PER_ACRE}`;

export async function computeThermalClass(
  session: DuckDbSession
): Promise<string | null> {
  const reader = await session.connection.runAndReadAll(`
    SELECT m."TemperatureGradient" AS temperature_gradient
    FROM mienviro_1 m, parcel p
    WHERE ST_Intersects(m.geom, p.geom)
    LIMIT 1
  `);
  const rows = reader.getRowObjectsJS();
  return rows.length > 0 ? String(rows[0].temperature_gradient) : null;
}

export async function computeDesignatedTroutStream(
  session: DuckDbSession
): Promise<boolean> {
  const reader = await session.connection.runAndReadAll(`
    SELECT COUNT(*) AS n
    FROM mienviro_32 m, parcel p
    WHERE ST_Intersects(m.geom, p.geom) AND m."Designated" = '1'
  `);
  const rows = reader.getRowObjectsJS();
  return Number(rows[0].n) > 0;
}

export interface SoilPolygonArea {
  mukey: string;
  acres: number;
}

export async function computeSoilPolygonAreas(
  session: DuckDbSession
): Promise<SoilPolygonArea[]> {
  const reader = await session.connection.runAndReadAll(`
    SELECT mukey, ${AREA_ACRES_SQL} AS acres
    FROM soil_polygons
  `);
  const rows = reader.getRowObjectsJS();
  return rows.map((r) => ({ mukey: String(r.mukey), acres: Number(r.acres) }));
}
```

Save as `apps/etl/src/duckdb/compute.ts`.

- [ ] **Step 3: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  openSpatialSession,
  loadParcel,
  loadMiEnviroFeatures,
  loadSoilPolygons,
  type DuckDbSession,
} from "../../src/duckdb/load.js";
import {
  computeThermalClass,
  computeDesignatedTroutStream,
  computeSoilPolygonAreas,
} from "../../src/duckdb/compute.js";
import { ringToWkt } from "../../src/fetch/ssurgo.js";

// Real N 20th Ave parcel 013-20 ring, proven by the spike to be 3.755 acres,
// re-confirmed via the verified area formula during spec verification.
const PARCEL_013_20 = {
  pin: "10-003-013-20",
  county: "Osceola",
  township: "Middle Branch",
  acres: 3.755,
  geometry: {
    type: "Polygon" as const,
    coordinates: [
      [
        [-85.12735272620779, 44.068435572734145],
        [-85.1284002194097, 44.06850159006744],
        [-85.12994981750543, 44.06859923491718],
        [-85.12994658824186, 44.06917724044619],
        [-85.12734858168078, 44.0691716555711],
        [-85.12735272620779, 44.068435572734145],
      ],
    ],
  },
};

describe("duckdb compute", () => {
  let session: DuckDbSession;

  beforeEach(async () => {
    session = await openSpatialSession();
    await loadParcel(session, PARCEL_013_20);
  });

  it("computeThermalClass returns null when no stream reach intersects (the real N 20th Ave case)", async () => {
    await loadMiEnviroFeatures(session, "mienviro_1", [], ["TemperatureGradient"]);
    const result = await computeThermalClass(session);
    expect(result).toBeNull();
  });

  it("computeThermalClass returns the TemperatureGradient when a reach intersects", async () => {
    await loadMiEnviroFeatures(
      session,
      "mienviro_1",
      [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-85.13, 44.068],
                [-85.125, 44.068],
                [-85.125, 44.07],
                [-85.13, 44.07],
                [-85.13, 44.068],
              ],
            ],
          },
          properties: { TemperatureGradient: "Cold stream" },
        },
      ],
      ["TemperatureGradient"]
    );
    const result = await computeThermalClass(session);
    expect(result).toBe("Cold stream");
  });

  it("computeDesignatedTroutStream returns false with no intersecting Designated=1 feature", async () => {
    await loadMiEnviroFeatures(session, "mienviro_32", [], ["Designated"]);
    const result = await computeDesignatedTroutStream(session);
    expect(result).toBe(false);
  });

  it("computeDesignatedTroutStream returns true when an intersecting Designated=1 feature exists", async () => {
    await loadMiEnviroFeatures(
      session,
      "mienviro_32",
      [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-85.13, 44.068],
                [-85.125, 44.068],
                [-85.125, 44.07],
                [-85.13, 44.07],
                [-85.13, 44.068],
              ],
            ],
          },
          properties: { Designated: "1" },
        },
      ],
      ["Designated"]
    );
    const result = await computeDesignatedTroutStream(session);
    expect(result).toBe(true);
  });

  it("computeSoilPolygonAreas returns the verified acreage for the full parcel polygon itself", async () => {
    // Using the parcel's own polygon as a stand-in "soil polygon" proves the
    // area formula against a value independently known from the spike: 3.755 ac.
    await loadSoilPolygons(session, [
      { mukey: "TEST", wkt: ringToWkt(PARCEL_013_20.geometry.coordinates[0]) },
    ]);
    const results = await computeSoilPolygonAreas(session);
    expect(results).toHaveLength(1);
    expect(results[0].mukey).toBe("TEST");
    expect(results[0].acres).toBeCloseTo(3.755, 2);
  });
});
```

Save as `apps/etl/test/duckdb/compute.test.ts`.

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `cd apps/etl && npm test`
Expected first (before Steps 1–2 above are saved): FAIL — modules not found. Since Steps 1–2
already wrote the implementation, running now should go straight to PASS — 25 tests passed
(5 new + 20 from Tasks 2–5). If any test fails, especially the acreage one, check the WKT
ring closes (first and last coordinate identical) and that `ringToWkt`'s coordinate order
matches `[lon, lat]`.

- [ ] **Step 5: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/duckdb apps/etl/test/duckdb
git commit -m "feat(etl): add DuckDB spatial load/compute with the verified area formula"
```

---

### Task 7: derive.ts

**Files:**
- Create: `apps/etl/src/derive.ts`
- Test: `apps/etl/test/derive.test.ts`

**Interfaces:**
- Consumes: `CardDef`, `validateCard` from `@brp/schema`; `NormalizedParcelRecord` from
  `./counties/types.js` (Task 2); `ComponentInfo` from `./fetch/ssurgo.js` (Task 5);
  `SoilPolygonArea` from `./duckdb/compute.js` (Task 6).
- Produces: `DominantDrySoil` type, `summarizeSoil(soilAreas, components)`, `DeriveInput`
  type, `deriveCard(input): CardDef` from `./derive.js`. `index.ts` (Task 8) imports both
  `summarizeSoil` (to find which cokey needs a dwelling-rating fetch before assembly) and
  `deriveCard`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { deriveCard, summarizeSoil } from "../src/derive.js";
import { validateCard } from "@brp/schema";
import type { NormalizedParcelRecord } from "../src/counties/types.js";
import type { ComponentInfo } from "../src/fetch/ssurgo.js";

const PARCEL: NormalizedParcelRecord = {
  pin: "10-003-013-20",
  county: "Osceola",
  township: "Middle Branch",
  acres: 3.755,
  geometry: { type: "Polygon", coordinates: [[[0, 0]]] },
};

const KALKASKA: ComponentInfo = {
  mukey: "190064",
  compname: "Kalkaska",
  comppct_r: 95,
  drainagecl: "Somewhat excessively drained",
  wtdepannmin: null,
  cokey: "27171875",
};

const AU_GRES: ComponentInfo = {
  mukey: "189980",
  compname: "Au Gres",
  comppct_r: 90,
  drainagecl: "Somewhat poorly drained",
  wtdepannmin: 12,
  cokey: "27171661",
};

describe("summarizeSoil", () => {
  it("classifies well-drained, no-water-table components as dry, everything else as wet", () => {
    const result = summarizeSoil(
      [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      [KALKASKA, AU_GRES]
    );
    expect(result.dryAcres).toBeCloseTo(1.638, 3);
    expect(result.wetAcres).toBeCloseTo(2.117, 3);
    expect(result.dominantDry).toEqual({
      mukey: "190064",
      cokey: "27171875",
      series: "Kalkaska",
      acres: 1.638,
    });
  });

  it("aggregates multiple soil-polygon segments sharing the same mukey before comparing totals", () => {
    const fragmentedKalkaska = [
      { mukey: "190064", acres: 0.1 },
      { mukey: "190064", acres: 0.2 },
      { mukey: "190064", acres: 0.3 }, // Kalkaska total: 0.6
    ];
    const result = summarizeSoil(
      [...fragmentedKalkaska, { mukey: "189980", acres: 0.5 }],
      [KALKASKA, { ...AU_GRES, drainagecl: "Somewhat excessively drained", wtdepannmin: null }]
    );
    // Kalkaska's aggregated 0.6 ac beats Au Gres's single 0.5 ac segment --
    // proves aggregation happens before comparison, not per-segment comparison.
    expect(result.dominantDry?.series).toBe("Kalkaska");
    expect(result.dominantDry?.acres).toBeCloseTo(0.6, 3);
    expect(result.dryAcres).toBeCloseTo(1.1, 3);
  });

  it("returns a null dominantDry when no component is dry", () => {
    const result = summarizeSoil(
      [{ mukey: "189980", acres: 2.117 }],
      [AU_GRES]
    );
    expect(result.dominantDry).toBeNull();
    expect(result.dryAcres).toBe(0);
    expect(result.wetAcres).toBeCloseTo(2.117, 3);
  });
});

describe("deriveCard", () => {
  it("assembles a card with no errors from validateCard, given consistent inputs", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      components: [KALKASKA, AU_GRES],
      dominantDrySoilRating: "Not limited",
      fetchedAt: "2026-08-28",
    });
    expect(validateCard(card)).toEqual([]);
  });

  it("populates dry_wet_adjacency and dominant_dry_soil from the soil summary", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [
        { mukey: "190064", acres: 1.638 },
        { mukey: "189980", acres: 2.117 },
      ],
      components: [KALKASKA, AU_GRES],
      dominantDrySoilRating: "Not limited",
      fetchedAt: "2026-08-28",
    });
    expect(card.dry_wet_adjacency.dry_acres.value).toBeCloseTo(1.638, 3);
    expect(card.dry_wet_adjacency.wet_acres.value).toBeCloseTo(2.117, 3);
    expect(card.dry_wet_adjacency.dominant_dry_soil.value).toEqual({
      series: "Kalkaska",
      dwelling_rating: "Not limited",
    });
  });

  it("carries a null thermal_class through when MiEnviro found no intersecting reach", () => {
    const card = deriveCard({
      parcel: PARCEL,
      thermalClass: null,
      designatedTroutStream: false,
      soilAreas: [],
      components: [],
      dominantDrySoilRating: null,
      fetchedAt: "2026-08-28",
    });
    expect(card.groundwater.thermal_class.value).toBeNull();
  });

  it("throws on an unexpected TemperatureGradient value from MiEnviro", () => {
    expect(() =>
      deriveCard({
        parcel: PARCEL,
        thermalClass: "Lukewarm stream",
        designatedTroutStream: false,
        soilAreas: [],
        components: [],
        dominantDrySoilRating: null,
        fetchedAt: "2026-08-28",
      })
    ).toThrow('Unexpected TemperatureGradient value from MiEnviro: "Lukewarm stream"');
  });
});
```

Save as `apps/etl/test/derive.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/etl && npm test`
Expected: FAIL — `Cannot find module '../src/derive.js'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { CardDef } from "@brp/schema";
import type { NormalizedParcelRecord } from "./counties/types.js";
import type { ComponentInfo } from "./fetch/ssurgo.js";
import type { SoilPolygonArea } from "./duckdb/compute.js";

const DRY_DRAINAGE_CLASSES = new Set([
  "Somewhat excessively drained",
  "Excessively drained",
  "Well drained",
]);

function isDryComponent(component: ComponentInfo): boolean {
  return (
    component.drainagecl !== null &&
    DRY_DRAINAGE_CLASSES.has(component.drainagecl) &&
    component.wtdepannmin === null
  );
}

export interface DominantDrySoil {
  mukey: string;
  cokey: string;
  series: string;
  acres: number;
}

export interface SoilSummary {
  dryAcres: number;
  wetAcres: number;
  dominantDry: DominantDrySoil | null;
}

/** Aggregates soil-polygon-segment acreage by mukey, classifies dry vs wet per
 * the A2 rule (well-drained/somewhat-excessively-drained AND no water table in
 * profile), and finds the dominant (largest-area) dry component. Shared between
 * index.ts (which needs the cokey to fetch a dwelling rating before assembling
 * a card) and deriveCard (which needs the same totals to populate the card) so
 * the two never compute this differently. */
export function summarizeSoil(
  soilAreas: SoilPolygonArea[],
  components: ComponentInfo[]
): SoilSummary {
  const componentByMukey = new Map(components.map((c) => [c.mukey, c]));
  const acresByMukey = new Map<string, number>();
  for (const { mukey, acres } of soilAreas) {
    acresByMukey.set(mukey, (acresByMukey.get(mukey) ?? 0) + acres);
  }

  let dryAcres = 0;
  let wetAcres = 0;
  let dominantDry: DominantDrySoil | null = null;

  for (const [mukey, acres] of acresByMukey) {
    const component = componentByMukey.get(mukey);
    const dry = component !== undefined && isDryComponent(component);
    if (dry && component) {
      dryAcres += acres;
      if (dominantDry === null || acres > dominantDry.acres) {
        dominantDry = { mukey, cokey: component.cokey, series: component.compname, acres };
      }
    } else {
      wetAcres += acres;
    }
  }

  return { dryAcres, wetAcres, dominantDry };
}

const VALID_THERMAL_CLASSES = [
  "Cold stream",
  "Cold transitional stream",
  "Cold small river",
  "Cold transitional small river",
  "Cold transitional large river",
] as const;

type ThermalClass = (typeof VALID_THERMAL_CLASSES)[number];

function toThermalClass(value: string | null): ThermalClass | null {
  if (value === null) return null;
  if ((VALID_THERMAL_CLASSES as readonly string[]).includes(value)) {
    return value as ThermalClass;
  }
  throw new Error(`Unexpected TemperatureGradient value from MiEnviro: "${value}"`);
}

export interface DeriveInput {
  parcel: NormalizedParcelRecord;
  thermalClass: string | null;
  designatedTroutStream: boolean;
  soilAreas: SoilPolygonArea[];
  components: ComponentInfo[];
  dominantDrySoilRating: string | null;
  fetchedAt: string; // ISO date
}

export function deriveCard(input: DeriveInput): CardDef {
  const { dryAcres, wetAcres, dominantDry } = summarizeSoil(
    input.soilAreas,
    input.components
  );

  return {
    identity: {
      parcel_id: input.parcel.pin,
      county: input.parcel.county,
      township: input.parcel.township,
      acres: {
        value: input.parcel.acres,
        provenance: "verified",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
    },
    groundwater: {
      thermal_class: {
        value: toThermalClass(input.thermalClass),
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
      designated_trout_stream: {
        value: input.designatedTroutStream,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "continuous" },
      },
      flowing_wells_nearby: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "periodic",
          note: "out of scope for this ETL pass",
        },
      },
    },
    dry_wet_adjacency: {
      dry_acres: {
        value: Math.round(dryAcres * 1000) / 1000,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      wet_acres: {
        value: Math.round(wetAcres * 1000) / 1000,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      dominant_dry_soil: {
        value:
          dominantDry && input.dominantDrySoilRating
            ? { series: dominantDry.series, dwelling_rating: input.dominantDrySoilRating }
            : null,
        provenance: "inferred",
        vintage: { as_of: input.fetchedAt, source_type: "periodic" },
      },
      adjacent: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "periodic",
          note: "out of scope for this ETL pass",
        },
      },
    },
    relief_envelope_to_water_ft: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: input.fetchedAt,
        source_type: "periodic",
        note: "out of scope for this ETL pass",
      },
    },
    wetland: {
      wetland_pct: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "static",
          note: "out of scope for this ETL pass",
        },
      },
      wetland_between_envelope_and_water: {
        value: null,
        provenance: "inferred",
        vintage: {
          as_of: input.fetchedAt,
          source_type: "static",
          note: "out of scope for this ETL pass",
        },
      },
    },
    prominence_ft: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: input.fetchedAt,
        source_type: "static",
        note: "out of scope for this ETL pass",
      },
    },
  };
}
```

Save as `apps/etl/src/derive.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/etl && npm test`
Expected: PASS — 32 tests passed (7 new + 25 from Tasks 2–6).

- [ ] **Step 5: Typecheck**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/derive.ts apps/etl/test/derive.test.ts
git commit -m "feat(etl): add derive.ts (CardDef assembly + soil summarization)"
```

---

### Task 8: index.ts orchestration + the real integration test

**Files:**
- Create: `apps/etl/src/index.ts`
- Create: `apps/etl/test/integration/n20th-ave.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: `runParcelEtl(pin: string, county: string): Promise<CardDef>` from
  `../src/index.js` — the package's one public entry point.

This task has no offline unit test of its own — `index.ts` is pure orchestration wiring, and
its only meaningful test is running it for real. That's this task's integration test, and per
the Global Constraints it's the one test in this app that touches the real network.

- [ ] **Step 1: Write index.ts**

```ts
import type { CardDef } from "@brp/schema";
import { fetchParcel } from "./fetch/parcels.js";
import {
  fetchColdStreams,
  fetchDesignatedTroutStreams,
  bboxFromGeometry,
} from "./fetch/mienviro.js";
import {
  ringToWkt,
  fetchClippedSoilPolygons,
  fetchComponents,
  fetchDwellingRating,
} from "./fetch/ssurgo.js";
import {
  openSpatialSession,
  loadParcel,
  loadMiEnviroFeatures,
  loadSoilPolygons,
} from "./duckdb/load.js";
import {
  computeThermalClass,
  computeDesignatedTroutStream,
  computeSoilPolygonAreas,
} from "./duckdb/compute.js";
import { summarizeSoil, deriveCard } from "./derive.js";

// ~0.01 deg is roughly 1.1 km at Michigan's latitude -- generous margin
// around the parcel bbox for the MiEnviro fetch; the precise test is the
// DuckDB ST_Intersects against the parcel's exact geometry, not this bbox.
const MIENVIRO_BBOX_BUFFER_DEG = 0.01;

export async function runParcelEtl(pin: string, county: string): Promise<CardDef> {
  const fetchedAt = new Date().toISOString().slice(0, 10);

  const parcel = await fetchParcel(pin, county);
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

  const [thermalClass, designatedTroutStream, soilAreas] = await Promise.all([
    computeThermalClass(session),
    computeDesignatedTroutStream(session),
    computeSoilPolygonAreas(session),
  ]);

  const { dominantDry } = summarizeSoil(soilAreas, components);
  const dominantDrySoilRating = dominantDry
    ? await fetchDwellingRating(dominantDry.cokey)
    : null;

  return deriveCard({
    parcel,
    thermalClass,
    designatedTroutStream,
    soilAreas,
    components,
    dominantDrySoilRating,
    fetchedAt,
  });
}
```

Save as `apps/etl/src/index.ts`.

- [ ] **Step 2: Run typecheck before writing the integration test**

Run: `cd apps/etl && npm run typecheck`
Expected: no errors. (This module has no unit test, so typecheck is the only automated
check before the integration test below actually exercises it.)

- [ ] **Step 3: Write the integration test**

This imports `packages/schema`'s golden fixture directly via a relative path (not through
the `@brp/schema` package export, which only exposes `src/index.ts`) — so if that fixture
is ever corrected again, this test picks up the correction automatically instead of drifting
from a second copy of the same numbers.

```ts
import { describe, it, expect } from "vitest";
import { runParcelEtl } from "../../src/index.js";
import {
  PARCEL_013_20,
  PARCEL_009_00,
  PARCEL_008_00,
} from "../../../../packages/schema/test/golden/n20th-ave.fixture.js";

describe("N 20th Ave, real network, real DuckDB (npm run test:integration)", () => {
  it(
    "reproduces packages/schema's golden fixture non-null fields for all three parcels",
    async () => {
      const results = await Promise.all([
        runParcelEtl("10-003-013-20", "Osceola"),
        runParcelEtl("10-003-009-00", "Osceola"),
        runParcelEtl("10-003-008-00", "Osceola"),
      ]);
      const [card013, card009, card008] = results;

      // Identity
      expect(card013.identity.parcel_id).toBe(PARCEL_013_20.identity.parcel_id);
      expect(card013.identity.acres.value).toBeCloseTo(
        PARCEL_013_20.identity.acres.value!,
        2
      );
      expect(card009.identity.parcel_id).toBe(PARCEL_009_00.identity.parcel_id);
      expect(card009.identity.acres.value).toBeCloseTo(
        PARCEL_009_00.identity.acres.value!,
        2
      );
      expect(card008.identity.parcel_id).toBe(PARCEL_008_00.identity.parcel_id);
      expect(card008.identity.acres.value).toBeCloseTo(
        PARCEL_008_00.identity.acres.value!,
        2
      );

      // A1 -- thermal_class is null on all three (corrected 2026-08-28);
      // designated_trout_stream is true on 008-00 only.
      expect(card013.groundwater.thermal_class.value).toBeNull();
      expect(card009.groundwater.thermal_class.value).toBeNull();
      expect(card008.groundwater.thermal_class.value).toBeNull();
      expect(card013.groundwater.designated_trout_stream.value).toBe(
        PARCEL_013_20.groundwater.designated_trout_stream.value
      );
      expect(card009.groundwater.designated_trout_stream.value).toBe(
        PARCEL_009_00.groundwater.designated_trout_stream.value
      );
      expect(card008.groundwater.designated_trout_stream.value).toBe(true);

      // A2 -- dry/wet acres, within a generous tolerance of the spike's own numbers
      // (the spike's SDA clip and this ETL's SDA clip should agree closely, but
      // aren't required to match to the same floating-point precision).
      expect(card013.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_013_20.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card013.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_013_20.dry_wet_adjacency.wet_acres.value!,
        1
      );
      expect(card009.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_009_00.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card009.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_009_00.dry_wet_adjacency.wet_acres.value!,
        1
      );
      expect(card008.dry_wet_adjacency.dry_acres.value).toBeCloseTo(
        PARCEL_008_00.dry_wet_adjacency.dry_acres.value!,
        1
      );
      expect(card008.dry_wet_adjacency.wet_acres.value).toBeCloseTo(
        PARCEL_008_00.dry_wet_adjacency.wet_acres.value!,
        1
      );

      // Dominant dry soil should be Kalkaska on all three, matching the fixture.
      expect(card013.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
      expect(card009.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
      expect(card008.dry_wet_adjacency.dominant_dry_soil.value?.series).toBe("Kalkaska");
    },
    30_000 // real network calls across 3 parcels -- generous timeout
  );
});
```

Save as `apps/etl/test/integration/n20th-ave.test.ts`.

- [ ] **Step 4: Run the integration test**

Run: `cd apps/etl && npm run test:integration`
Expected: PASS — 1 test passed. If it fails, the failure is informative: a wrong acreage
means the SSURGO clip or area formula drifted from what Task 6 verified in isolation; a
non-null `thermal_class` means the MiEnviro bbox or `ST_Intersects` picked up a reach it
shouldn't have; a wrong `designated_trout_stream` means the same for layer 32. Do not
"fix" this test to match whatever the pipeline currently produces — if it fails, the
pipeline has a real bug to find, per the design spec's whole premise.

- [ ] **Step 5: Run the full default test suite once more, to confirm it's unaffected**

Run: `cd apps/etl && npm test`
Expected: PASS — still 32 tests (the integration test is excluded from this run by
`vitest.config.ts`, per Task 1).

- [ ] **Step 6: Commit**

```bash
cd /Users/jordan/code/blue-ribbon-properties
git add apps/etl/src/index.ts apps/etl/test/integration
git commit -m "feat(etl): add index.ts orchestration and the N 20th Ave integration test"
```

---

## Definition of done

- `cd apps/etl && npm test` passes all 32 tests, offline.
- `cd apps/etl && npm run test:integration` passes against the real network and real
  DuckDB, reproducing `packages/schema`'s golden fixture's non-null fields for all three
  N 20th Ave parcels.
- `cd apps/etl && npm run typecheck` reports no errors.
- `cd packages/schema && npm test` still passes 38/38 (unaffected by the workspace change).
- `git log --oneline` shows 8 commits, one per task, each independently buildable.
- No file under `apps/etl/src/` performs geometry math outside `duckdb/compute.ts` —
  per Global Constraints, that's the one place `ST_Intersects`/area computation happens.
