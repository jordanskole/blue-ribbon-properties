import type { VintageSourceType } from "./provenance.js";

export interface LayerDef {
  id: string;
  name: string;
  source: string;
  geometryType: "point" | "polyline" | "polygon" | "raster";
  sourceType: VintageSourceType;
  /** Human-readable CardDef field paths this layer feeds, e.g. "groundwater.thermal_class" */
  feeds: string[];
}

export const LAYER_REGISTRY: readonly LayerDef[] = [
  {
    id: "egle_mienviro_1",
    name: "Cold/Cold Transitional Streams",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/1",
    geometryType: "polyline",
    sourceType: "continuous",
    feeds: ["groundwater.thermal_class"],
  },
  {
    id: "egle_mienviro_32",
    name: "Designated Trout Stream",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/32",
    geometryType: "polyline",
    sourceType: "continuous",
    feeds: ["groundwater.designated_trout_stream"],
  },
  {
    id: "nwi_wetlands",
    name: "National Wetland Inventory 2005",
    source: "https://gisagoegle.state.mi.us/arcgis/rest/services/EGLE/MiEnviro/MapServer/38",
    geometryType: "polygon",
    sourceType: "static",
    feeds: ["wetland.wetland_pct", "wetland.wetland_between_envelope_and_water"],
  },
  {
    id: "wellogic_county",
    name: "Wellogic county water well download",
    source: "https://www.michigan.gov/egle/maps-data/wellogic/water-wells",
    geometryType: "point",
    sourceType: "periodic",
    feeds: ["groundwater.flowing_wells_nearby"],
  },
  {
    id: "ssurgo_sda",
    name: "SSURGO via Soil Data Access",
    source: "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
    geometryType: "polygon",
    sourceType: "periodic",
    feeds: [
      "dryWetAdjacency.dry_acres",
      "dryWetAdjacency.wet_acres",
      "dryWetAdjacency.dominant_dry_soil",
      "dryWetAdjacency.adjacent",
    ],
  },
  {
    id: "parcel_source",
    name: "County parcel FeatureServer (or Regrid fallback)",
    source: "per-county — see county configuration, not a single fixed endpoint",
    geometryType: "polygon",
    sourceType: "continuous",
    feeds: ["identity.parcel_id", "identity.county", "identity.township", "identity.acres"],
  },
  {
    id: "usgs_3dep_dem",
    name: "USGS 3DEP elevation tile",
    source: "https://www.usgs.gov/3d-elevation-program",
    geometryType: "raster",
    sourceType: "static",
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
