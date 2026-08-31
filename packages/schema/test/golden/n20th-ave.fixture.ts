import type { CardDef } from "../../src/index.js";

const SPIKE_DATE = "2026-08-27";
const RECHECK_DATE = "2026-08-28";
const BOUNDARY_FETCH_DATE = "2026-08-31";

export const PARCEL_013_20: CardDef = {
  identity: {
    parcel_id: "10-003-013-20",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 3.755,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
    boundary: {
      value: {
        type: "Polygon",
        coordinates: [[[-85.1273579505385, 44.0684439350181], [-85.1284054440688, 44.0685099523038], [-85.129955042651, 44.0686075970831], [-85.1299518134485, 44.0691856027079], [-85.1273538060892, 44.069180017977], [-85.1273579505385, 44.0684439350181]]],
      },
      provenance: "verified",
      vintage: { as_of: BOUNDARY_FETCH_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note:
          "013-20 does not directly touch a mapped MiEnviro layer-1 reach; only 008-00 " +
          "reaches the Middle Branch River per the spike's aerial cross-check.",
      },
    },
    designated_trout_stream: {
      value: false,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "same reasoning as thermal_class — not directly adjacent to a designated reach",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note:
          "spike found flowing wells within 1.5 mi of the general area but did not compute " +
          "per-parcel-centroid distance — not yet computed",
      },
    },
  },
  dry_wet_adjacency: {
    dry_acres: {
      value: 1.638,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 2.117,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "polygon-touch test not run in the spike — not yet computed",
      },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note:
        "spike's relief transect used the wrong line (straight guess, not a real " +
        "road-to-river path) — not a validated null, see 05_SPIKE_FINDINGS.md",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "static",
        note: "NWI/hydric overlay not run in the spike — not yet computed",
      },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "static",
      note: "not yet computed — depends on the same corrected DEM transect as relief",
    },
  },
};

export const PARCEL_009_00: CardDef = {
  identity: {
    parcel_id: "10-003-009-00",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 3.167,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
    boundary: {
      value: {
        type: "Polygon",
        coordinates: [[[-85.129955042651, 44.0686075970831], [-85.1284054403244, 44.0685099523292], [-85.1284158128495, 44.0676948301085], [-85.1297927773973, 44.0676977847693], [-85.1302116901917, 44.0682264905314], [-85.130124743978, 44.068618289395], [-85.129955042651, 44.0686075970831]]],
      },
      provenance: "verified",
      vintage: { as_of: BOUNDARY_FETCH_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "009-00 does not directly touch a mapped reach — only 008-00 reaches the river",
      },
    },
    designated_trout_stream: {
      value: false,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: "same reasoning as thermal_class",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "not yet computed per-parcel",
      },
    },
  },
  dry_wet_adjacency: {
    dry_acres: {
      value: 2.839,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 0.328,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic", note: "not yet computed" },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note: "spike's relief transect used the wrong line — not a validated null",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
  },
};

export const PARCEL_008_00: CardDef = {
  identity: {
    parcel_id: "10-003-008-00",
    county: "Osceola",
    township: "Middle Branch",
    acres: {
      value: 10.421,
      provenance: "verified",
      vintage: { as_of: SPIKE_DATE, source_type: "continuous" },
    },
    boundary: {
      value: {
        type: "Polygon",
        coordinates: [[[-85.1302116901917, 44.0682264905314], [-85.1297927773973, 44.0676977847693], [-85.1284158128495, 44.0676948301085], [-85.1284198600106, 44.0673767222152], [-85.1344284066139, 44.067389493376], [-85.1344504510624, 44.0674128525815], [-85.1347727876588, 44.0675174616174], [-85.1349461099323, 44.0675804701228], [-85.1351573124655, 44.0676572487045], [-85.1351595346786, 44.0678263497881], [-85.1350999215756, 44.0679869714494], [-85.1350291335998, 44.0682366789203], [-85.1302116901917, 44.0682264905314]]],
      },
      provenance: "verified",
      vintage: { as_of: BOUNDARY_FETCH_DATE, source_type: "continuous" },
    },
  },
  groundwater: {
    thermal_class: {
      value: null,
      provenance: "verified",
      vintage: {
        as_of: RECHECK_DATE,
        source_type: "continuous",
        note:
          "Corrected 2026-08-28: the original 'Cold stream' value came from a name " +
          "match, not a spatial one. MiEnviro layer 1 has exactly one 'Middle Branch " +
          "River' statewide (NHSStreamId 00632240, 6 segments, lat 44.079-44.120) and " +
          "its full extent never comes within ~2.8 mi of this parcel (lat ~44.068) — " +
          "confirmed via a multi-km bbox spatial query returning zero features, then " +
          "an exhaustive NHSStreamId check ruling out a partial-listing artifact. " +
          "designated_trout_stream below is unaffected: that value traces to real, " +
          "nearby layer-32 geometry (lon -85.113 to -85.147, lat 44.056 to 44.077), " +
          "independently confirmed. The two EGLE layers simply don't have matching " +
          "coverage for this reach.",
      },
    },
    designated_trout_stream: {
      value: true,
      provenance: "verified",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note:
          'MiEnviro layer 32, GNISName "Middle Branch River", RegulationType "Type 1", ' +
          "Designated=1",
      },
    },
    flowing_wells_nearby: {
      value: null,
      provenance: "inferred",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "periodic",
        note: "not yet computed per-parcel",
      },
    },
  },
  dry_wet_adjacency: {
    dry_acres: {
      value: 2.872,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    wet_acres: {
      value: 7.549,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    dominant_dry_soil: {
      value: { series: "Kalkaska", dwelling_rating: "Not limited" },
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic" },
    },
    adjacent: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "periodic", note: "not yet computed" },
    },
  },
  relief_envelope_to_water_ft: {
    value: null,
    provenance: "inferred",
    vintage: {
      as_of: SPIKE_DATE,
      source_type: "periodic",
      note: "spike's relief transect used the wrong line — not a validated null",
    },
  },
  wetland: {
    wetland_pct: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
    wetland_between_envelope_and_water: {
      value: null,
      provenance: "inferred",
      vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
    },
  },
  prominence_ft: {
    value: null,
    provenance: "inferred",
    vintage: { as_of: SPIKE_DATE, source_type: "static", note: "not yet computed" },
  },
};
