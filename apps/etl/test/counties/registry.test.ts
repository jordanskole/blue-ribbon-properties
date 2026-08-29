import { describe, it, expect } from "vitest";
import { getCountyAdapter } from "../../src/counties/registry.js";

describe("getCountyAdapter", () => {
  it("resolves the Osceola adapter", () => {
    const adapter = getCountyAdapter("Osceola");
    expect(adapter.county).toBe("Osceola");
    expect(typeof adapter.fetchParcel).toBe("function");
    expect(typeof adapter.normalize).toBe("function");
  });

  it("resolves the Iosco adapter", () => {
    const adapter = getCountyAdapter("Iosco");
    expect(adapter.county).toBe("Iosco");
    expect(typeof adapter.fetchParcel).toBe("function");
    expect(typeof adapter.normalize).toBe("function");
  });

  it("throws a clear error for an unregistered county", () => {
    expect(() => getCountyAdapter("Roscommon")).toThrow(
      'No CountyParcelAdapter registered for county "Roscommon"'
    );
  });
});
