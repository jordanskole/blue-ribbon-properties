import { describe, it, expect } from "vitest";
import { computeSchemaHash } from "../src/hash.js";
import { CARD_COLUMNS } from "../src/duckdb-columns.js";

describe("computeSchemaHash", () => {
  it("has exactly 68 columns (3 top-level identity fields + 13 Field<T> groups x 5 columns)", () => {
    expect(CARD_COLUMNS).toHaveLength(68);
  });

  it("produces a stable 64-char hex hash for the current column list", async () => {
    const { hash, short } = await computeSchemaHash();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(short).toBe(hash.slice(0, 8));
  });

  it("is deterministic across repeated calls", async () => {
    const a = await computeSchemaHash();
    const b = await computeSchemaHash();
    expect(a.hash).toBe(b.hash);
  });

  it("starts with the three unwrapped top-level columns", () => {
    expect(CARD_COLUMNS.slice(0, 3)).toEqual(["parcel_id", "county", "township"]);
  });

  it("includes the new boundary columns immediately after the acres group", () => {
    const idx = CARD_COLUMNS.indexOf("identity_acres_vintage_note");
    expect(CARD_COLUMNS[idx + 1]).toBe("identity_boundary_value");
  });
});
