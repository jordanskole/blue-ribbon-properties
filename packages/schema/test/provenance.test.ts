import { describe, it, expect } from "vitest";
import { combineProvenance } from "../src/provenance.js";

describe("combineProvenance", () => {
  it("returns the single input unchanged", () => {
    expect(combineProvenance("verified")).toBe("verified");
  });

  it("returns the weaker of two inputs", () => {
    expect(combineProvenance("verified", "inferred")).toBe("inferred");
    expect(combineProvenance("verified", "aggregator")).toBe("aggregator");
    expect(combineProvenance("inferred", "aggregator")).toBe("aggregator");
    expect(combineProvenance("aggregator", "listing claim")).toBe("listing claim");
  });

  it("is order-independent", () => {
    expect(combineProvenance("aggregator", "verified")).toBe("aggregator");
  });

  it("handles more than two inputs, taking the overall weakest", () => {
    expect(combineProvenance("verified", "inferred", "listing claim", "aggregator")).toBe(
      "listing claim"
    );
  });

  it("throws on zero inputs", () => {
    expect(() => combineProvenance()).toThrow(
      "combineProvenance requires at least one provenance value"
    );
  });
});
