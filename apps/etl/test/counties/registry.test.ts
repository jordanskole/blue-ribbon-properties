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

  it("resolves the Roscommon adapter", () => {
    const adapter = getCountyAdapter("Roscommon");
    expect(adapter.county).toBe("Roscommon");
    expect(typeof adapter.fetchParcel).toBe("function");
    expect(typeof adapter.normalize).toBe("function");
  });

  it("resolves the Otsego adapter", () => {
    const adapter = getCountyAdapter("Otsego");
    expect(adapter.county).toBe("Otsego");
    expect(typeof adapter.fetchParcel).toBe("function");
    expect(typeof adapter.normalize).toBe("function");
  });

  it("throws a clear error for an unregistered county", () => {
    expect(() => getCountyAdapter("Wexford")).toThrow(
      'No CountyParcelAdapter registered for county "Wexford"'
    );
  });
});
