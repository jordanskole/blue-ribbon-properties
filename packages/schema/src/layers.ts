import type { VintageSourceType } from "./provenance.js";

export interface LayerDef {
  id: string;
  name: string;
  source: string;
  geometry_type: "point" | "polyline" | "polygon" | "raster";
  source_type: VintageSourceType;
  /** Human-readable CardDef field paths this layer feeds, e.g. "groundwater.thermal_class" */
  feeds: string[];
}

export const LAYER_REGISTRY: readonly LayerDef[] = [
  {
    id: "egle_mienviro_1",
    name: "Cold/Cold Transitional Streams",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/1",
    geometry_type: "polyline",
    source_type: "continuous",
    feeds: ["groundwater.thermal_class"],
  },
  {
    id: "egle_mienviro_32",
    name: "Designated Trout Stream",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/32",
    geometry_type: "polyline",
    source_type: "continuous",
    feeds: ["groundwater.designated_trout_stream"],
  },
  {
    id: "nwi_wetlands",
    name: "National Wetland Inventory 2005",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/38",
    geometry_type: "polygon",
    source_type: "static",
    feeds: ["wetland.wetland_pct", "wetland.wetland_between_envelope_and_water"],
  },
  {
    id: "wellogic_county",
    name: "Wellogic county water well download",
    source: "https://www.michigan.gov/egle/maps-data/wellogic/water-wells",
    geometry_type: "point",
    source_type: "periodic",
    feeds: ["groundwater.flowing_wells_nearby"],
  },
  {
    id: "ssurgo_sda",
    name: "SSURGO via Soil Data Access",
    source: "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
    geometry_type: "polygon",
    source_type: "periodic",
    feeds: [
      "dry_wet_adjacency.dry_acres",
      "dry_wet_adjacency.wet_acres",
      "dry_wet_adjacency.dominant_dry_soil",
      "dry_wet_adjacency.adjacent",
    ],
  },
  {
    id: "parcel_source",
    name: "County parcel FeatureServer (or Regrid fallback)",
    // TODO(spec): this entry models per-county sourcing as a single prose string.
    // The design spec calls for a real per-county source list (verified for
    // county-run FeatureServers, aggregator for Regrid fallback) — deferred to
    // whichever future task actually wires up per-county ETL config.
    source: "per-county — see county configuration, not a single fixed endpoint",
    geometry_type: "polygon",
    source_type: "continuous",
    feeds: ["identity.parcel_id", "identity.county", "identity.township", "identity.acres"],
  },
  {
    id: "usgs_3dep_dem",
    name: "USGS 3DEP elevation tile",
    source: "https://www.usgs.gov/3d-elevation-program",
    geometry_type: "raster",
    source_type: "static",
    feeds: ["relief_envelope_to_water_ft", "prominence_ft"],
  },
];

export function getLayer(id: string): LayerDef {
  const layer = LAYER_REGISTRY.find((l) => l.id === id);
  if (!layer) {
    throw new Error(`No LayerDef registered for id "${id}"`);
  }
  return layer;
}
