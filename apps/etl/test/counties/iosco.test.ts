import { describe, it, expect, vi, afterEach } from "vitest";
import {
  normalize,
  webMercatorToWgs84,
  fetchParcelsIntersecting,
} from "../../src/counties/iosco.js";
import type { RawParcelFeature } from "../../src/counties/types.js";

function makeRawFeature(
  propertyOverrides: Record<string, unknown> = {}
): RawParcelFeature {
  return {
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-83.43396303570957, 44.4396825950131],
          [-83.43610488884151, 44.439693306162795],
          [-83.4361026430533, 44.44150763113336],
          [-83.43395432205132, 44.44149736927274],
          [-83.43395513053508, 44.44132182704021],
          [-83.43396303570957, 44.4396825950131],
        ],
      ],
    },
    properties: {
      TaxID: "062-026-300-020-00",
      Shape_Area: 370596.150263,
      township: "Oscoda",
      ...propertyOverrides,
    },
  };
}

describe("webMercatorToWgs84", () => {
  it("matches DuckDB's ST_Transform for a known EPSG:3857 point", () => {
    // Verified live against DuckDB ST_Transform('EPSG:3857' -> 'EPSG:4326')
    // for the target parcel's first vertex (PIN 062-026-300-020-00).
    const [lng, lat] = webMercatorToWgs84(-9287826.28, 5533738.12);
    expect(lng).toBeCloseTo(-83.43396303570957, 9);
    expect(lat).toBeCloseTo(44.4396825950131, 9);
  });
});

describe("iosco normalize", () => {
  it("converts a raw Iosco feature to a NormalizedParcelRecord", () => {
    const result = normalize(makeRawFeature());
    expect(result.pin).toBe("062-026-300-020-00");
    expect(result.county).toBe("Iosco");
    expect(result.township).toBe("Oscoda");
    expect(result.acres).toBeCloseTo(8.508, 3);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0]).toHaveLength(6);
  });

  it("throws a clear error for a malformed TaxID", () => {
    const raw = makeRawFeature({ TaxID: "not-a-pin" });
    expect(() => normalize(raw)).toThrow('"not-a-pin" is not a valid');
  });

  it("accepts a platted-subdivision PIN with a letter+2-digit second segment", () => {
    const raw = makeRawFeature({ TaxID: "051-A20-000-033-00" });
    const result = normalize(raw);
    expect(result.pin).toBe("051-A20-000-033-00");
  });

  it("throws a clear error for non-Polygon geometry", () => {
    const raw = makeRawFeature();
    raw.geometry.type = "MultiPolygon";
    expect(() => normalize(raw)).toThrow(
      'expected Polygon geometry, got "MultiPolygon"'
    );
  });
});

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

  it("throws a clear error on an HTTP-200-with-in-body-error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          error: { code: 400, message: "Cannot perform query. Invalid query parameters." },
        }),
      }))
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    await expect(fetchParcelsIntersecting(polygon)).rejects.toThrow(
      /ArcGIS error 400: Cannot perform query/
    );
  });

  it("flattens a MultiPolygon buffer into one flat rings array in the request geometry", async () => {
    let requestedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => ({ features: [] }) };
        }
        requestedUrl = url;
        return { ok: true, json: async () => ({ features: [] }) };
      })
    );
    const multiPolygon = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[-83.44, 44.43], [-83.43, 44.43], [-83.43, 44.44], [-83.44, 44.43]]],
        [[[-83.2, 44.6], [-83.19, 44.6], [-83.19, 44.61], [-83.2, 44.6]]],
      ],
    };
    await fetchParcelsIntersecting(multiPolygon);
    const match = requestedUrl.match(/geometry=([^&]+)/);
    const geometry = JSON.parse(decodeURIComponent(match![1]));
    expect(geometry.rings).toHaveLength(2);
  });

  it("pages through results when the server reports exceededTransferLimit at the top level", async () => {
    // Unlike Osceola/Roscommon's f=geojson responses (flag nested under
    // .properties), Iosco's f=json proxy response carries the flag at the
    // top level -- verified live 2026-08-29 against the FetchGIS proxy.
    const page1 = {
      exceededTransferLimit: true,
      features: [
        { attributes: { TaxID: "062-026-300-020-01", Shape_Area: 1000 }, geometry: { rings: [[[-9287826.28, 5533738.12], [-9288064.71, 5533739.79], [-9287825.31, 5534021.07], [-9287826.28, 5533738.12]]] } },
        { attributes: { TaxID: "062-026-300-020-02", Shape_Area: 1000 }, geometry: { rings: [[[-9287826.28, 5533738.12], [-9288064.71, 5533739.79], [-9287825.31, 5534021.07], [-9287826.28, 5533738.12]]] } },
      ],
    };
    const page2 = {
      exceededTransferLimit: false,
      features: [
        { attributes: { TaxID: "062-026-300-020-03", Shape_Area: 1000 }, geometry: { rings: [[[-9287826.28, 5533738.12], [-9288064.71, 5533739.79], [-9287825.31, 5534021.07], [-9287826.28, 5533738.12]]] } },
      ],
    };
    const mcdResponse = { features: [{ attributes: { Name: "Oscoda" } }] };
    const seenOffsets: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("MinorCivilDivision")) {
          return { ok: true, json: async () => mcdResponse };
        }
        const match = url.match(/resultOffset=(\d+)/);
        const offset = match![1];
        seenOffsets.push(offset);
        return { ok: true, json: async () => (offset === "0" ? page1 : page2) };
      })
    );
    const polygon = { type: "Polygon" as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
    const features = await fetchParcelsIntersecting(polygon);
    expect(features).toHaveLength(3);
    expect(seenOffsets).toEqual(["0", "2"]);
  });
});
