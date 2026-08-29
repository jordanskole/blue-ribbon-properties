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
