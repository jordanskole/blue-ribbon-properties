/** A single (non-multi) GeoJSON polygon — a parcel's own boundary is always
 * one shape (every county adapter's `normalize()` already rejects
 * MultiPolygon parcels), unlike a stream-buffer corridor, which genuinely
 * can be MultiPolygon (see apps/etl's own `GeoJSONPolygon` union, a
 * different, wider type for that different case — do not conflate them). */
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}
