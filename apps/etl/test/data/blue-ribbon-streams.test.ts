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
