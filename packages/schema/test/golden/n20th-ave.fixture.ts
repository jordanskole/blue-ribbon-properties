import type { CardDef } from "../../src/index.js";

const SPIKE_DATE = "2026-08-27";

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
  dryWetAdjacency: {
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
  dryWetAdjacency: {
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
  },
  groundwater: {
    thermal_class: {
      value: "Cold stream",
      provenance: "verified",
      vintage: {
        as_of: SPIKE_DATE,
        source_type: "continuous",
        note: 'MiEnviro layer 1, NHSStreamName "Middle Branch River"',
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
  dryWetAdjacency: {
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
