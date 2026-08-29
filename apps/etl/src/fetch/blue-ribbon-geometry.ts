import type { BlueRibbonStreamRecord } from "../data/blue-ribbon-streams.js";
import type { CountyBoundary } from "./county-boundaries.js";
import { fetchColdStreams, bboxFromGeometry } from "./mienviro.js";

export interface ResolvedStreamGeometry {
  record: BlueRibbonStreamRecord;
  geometry: { type: "MultiLineString"; coordinates: number[][][] };
  matchedNames: string[];
}

// ~2.2km at Michigan's latitude -- generous margin around the county boundary's
// own bbox, since a stream running right along a county line should still be
// captured even though the county polygon's bbox is drawn tight to its extent.
const BBOX_BUFFER_DEG = 0.02;

export async function resolveStreamGeometry(
  record: BlueRibbonStreamRecord,
  countyBoundaries: CountyBoundary[]
): Promise<ResolvedStreamGeometry | null> {
  const segments: number[][][] = [];
  const matchedNames = new Set<string>();
  const needle = record.name.toLowerCase();

  for (const countyName of record.counties) {
    const boundary = countyBoundaries.find((c) => c.name === countyName);
    if (!boundary) {
      throw new Error(
        `blue-ribbon-geometry: no county boundary found for "${countyName}" (needed by "${record.name}")`
      );
    }
    const bbox = bboxFromGeometry(boundary.geometry, BBOX_BUFFER_DEG);
    const features = await fetchColdStreams(bbox);
    for (const feature of features) {
      const streamName = feature.properties.NHSStreamName;
      if (typeof streamName !== "string" || !streamName.toLowerCase().includes(needle)) {
        continue;
      }
      matchedNames.add(streamName);
      if (feature.geometry.type === "LineString") {
        segments.push(feature.geometry.coordinates as number[][]);
      } else if (feature.geometry.type === "MultiLineString") {
        segments.push(...(feature.geometry.coordinates as number[][][]));
      }
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return {
    record,
    geometry: { type: "MultiLineString", coordinates: segments },
    matchedNames: [...matchedNames],
  };
}
