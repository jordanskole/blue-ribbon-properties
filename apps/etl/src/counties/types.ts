import type { PolygonGeometry } from "@brp/schema";

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
  geometry: PolygonGeometry;
}

// A stream buffer's own geometry can genuinely be a MultiPolygon -- see
// bufferGeometry in duckdb/buffer.ts, whose ST_Buffer output doesn't always
// merge disjoint stream segments into one blob (live-verified 2026-08-29:
// Osceola's Pine River, 23 segments). Esri's own geometry model has no
// separate MultiPolygon type -- see counties/shared/esri-geometry.ts's
// toEsriRings for how each adapter flattens this into a single `rings`
// array when building its ArcGIS query.
export type GeoJSONPolygon =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export interface CountyParcelAdapter {
  county: string;
  fetchParcel(pin: string): Promise<RawParcelFeature>;
  normalize(raw: RawParcelFeature): NormalizedParcelRecord;
  fetchParcelsIntersecting(polygon: GeoJSONPolygon): Promise<RawParcelFeature[]>;
}
