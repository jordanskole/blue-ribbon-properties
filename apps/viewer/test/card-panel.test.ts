import { describe, it, expect } from "vitest";
import { CARD_COLUMNS } from "@brp/schema";
import { FIELD_GROUPS, columnPrefix } from "../src/lib/card-panel.js";

describe("FIELD_GROUPS coverage against CARD_COLUMNS", () => {
  it("reaches every CARD_COLUMNS `_value` column via some group/prefix/field", () => {
    // parcel_id, county, township are shown directly in renderCardPanel's
    // header, not via FIELD_GROUPS -- everything else that stores a measured
    // value (every `*_value` column) must be reachable, per this project's
    // rule that every card shows the same fields, always. A field added to
    // CardDef/CARD_COLUMNS but never added here would fail this test instead
    // of silently never appearing in the panel.
    const nonFieldValueColumns = new Set(["parcel_id", "county", "township"]);

    const expectedValueColumns = CARD_COLUMNS.filter(
      (col) => col.endsWith("_value") && !nonFieldValueColumns.has(col)
    );

    const reachedValueColumns = new Set(
      FIELD_GROUPS.flatMap((group) =>
        group.fields.map((field) => `${columnPrefix(group.prefix, field)}_value`)
      )
    );

    const missing = expectedValueColumns.filter((col) => !reachedValueColumns.has(col));
    expect(missing).toEqual([]);
  });

  it("does not reach any column that isn't actually in CARD_COLUMNS", () => {
    // Guards the other direction: a stale/typo'd group/prefix/field entry
    // that no longer corresponds to a real column.
    const cardColumnSet = new Set(CARD_COLUMNS);

    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const col = `${columnPrefix(group.prefix, field)}_value`;
        expect(cardColumnSet.has(col)).toBe(true);
      }
    }
  });
});
