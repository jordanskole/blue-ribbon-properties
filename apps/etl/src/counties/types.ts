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

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface CountyParcelAdapter {
  county: string;
  fetchParcel(pin: string): Promise<RawParcelFeature>;
  normalize(raw: RawParcelFeature): NormalizedParcelRecord;
  fetchParcelsIntersecting?(polygon: GeoJSONPolygon): Promise<RawParcelFeature[]>;
}
