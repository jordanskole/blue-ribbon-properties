import * as L from "leaflet";
import { runQuery } from "./duckdb.js";

const COUNTY_COLORS: Record<string, string> = {
  Osceola: "#1f77b4",
  Iosco: "#ff7f0e",
  Roscommon: "#2ca02c",
  Otsego: "#d62728",
  Manistee: "#9467bd",
};
const DEFAULT_COLOR = "#7f7f7f"; // any county not yet in the palette above

export function initMap(containerId: string): L.Map {
  const map = L.map(containerId).setView([44.3, -85.0], 8); // roughly centered on the corridor
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  return map;
}

interface ParcelRow {
  parcel_id: string;
  county: string;
  identity_boundary_value: string | null;
}

/** Boundary is stored as a plain JSON-serialized GeoJSON string (no DuckDB
 * spatial extension involved) -- JSON.parse() hands Leaflet exactly the
 * {type:"Polygon", coordinates} shape it expects, in [lng,lat] order per
 * GeoJSON, which L.geoJSON() (unlike L.polygon(), which wants [lat,lng])
 * already handles correctly. */
export async function renderParcels(
  map: L.Map,
  onParcelClick: (parcelId: string) => void
): Promise<Map<string, L.Layer>> {
  const { rows } = await runQuery<ParcelRow>(
    "SELECT parcel_id, county, identity_boundary_value FROM cards"
  );
  const layerByPin = new Map<string, L.Layer>();

  for (const row of rows) {
    if (row.identity_boundary_value === null) continue;
    const geometry = JSON.parse(row.identity_boundary_value);
    const color = COUNTY_COLORS[row.county] ?? DEFAULT_COLOR;
    // Typed as a local `GeoJSON.Feature` (rather than passed as an inline
    // object literal) because L.geoJSON()'s parameter type is the base
    // `GeoJsonObject`, which doesn't declare `properties`/`geometry` --
    // TS's excess-property check on a fresh literal rejects those against
    // that base type even though `Feature` (which does declare them) is a
    // valid GeoJsonObject at runtime.
    const feature: GeoJSON.Feature = { type: "Feature", properties: {}, geometry };
    const layer = L.geoJSON(feature, {
      style: { color, weight: 1, fillOpacity: 0.3 },
    })
      .on("click", () => onParcelClick(row.parcel_id))
      .addTo(map);
    layerByPin.set(row.parcel_id, layer);
  }

  return layerByPin;
}

export async function renderStreams(map: L.Map, geojsonUrl: string): Promise<void> {
  const res = await fetch(geojsonUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch ${geojsonUrl}: HTTP ${res.status}`);
  }
  const geojson = await res.json();
  L.geoJSON(geojson, { style: { color: "#0000ff", weight: 2 } }).addTo(map);
}
