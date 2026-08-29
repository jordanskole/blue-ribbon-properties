export interface BlueRibbonStreamRecord {
  /** Base name to substring-match (case-insensitive) against MiEnviro's
   * NHSStreamName within each listed county. Segment-prefixed names in the
   * live data (e.g. "South Branch Au Sable River") match automatically —
   * this is deliberately not an exact-name list. */
  name: string;
  /** County names exactly as they appear in the state County FeatureServer's
   * Name field (verified live: "Osceola", "Iosco", "Roscommon", etc.). */
  counties: string[];
}

/** Transcribed from 03_BLUE_RIBBON_STREAMS.md's Lower Peninsula table, 2026-08-29.
 * 28 rows, covering the DNR's historical 49-stream LP list (segments of the same
 * river share one row here — see the file header note). */
export const BLUE_RIBBON_STREAMS_LP: BlueRibbonStreamRecord[] = [
  { name: "Au Sable", counties: ["Crawford", "Oscoda", "Otsego", "Roscommon"] },
  { name: "Pere Marquette", counties: ["Mason", "Lake"] },
  { name: "Manistee", counties: ["Kalkaska", "Crawford"] },
  { name: "Pine River", counties: ["Manistee", "Lake", "Osceola"] },
  { name: "Little Manistee", counties: ["Mason", "Lake"] },
  { name: "Pigeon River", counties: ["Cheboygan", "Otsego"] },
  { name: "Black River", counties: ["Cheboygan", "Presque Isle", "Montmorency", "Otsego"] },
  { name: "East Branch Black River", counties: ["Montmorency"] },
  { name: "Jordan River", counties: ["Antrim"] },
  { name: "Boardman", counties: ["Grand Traverse", "Kalkaska"] },
  { name: "Sturgeon River", counties: ["Cheboygan", "Otsego"] },
  { name: "Bear Creek", counties: ["Manistee"] },
  { name: "Big Creek", counties: ["Crawford"] },
  { name: "Big Creek", counties: ["Oscoda"] },
  { name: "Platte River", counties: ["Benzie"] },
  { name: "Canada Creek", counties: ["Presque Isle", "Montmorency"] },
  { name: "Cedar River", counties: ["Antrim"] },
  { name: "Cedar River", counties: ["Clare", "Gladwin"] },
  { name: "Clam River", counties: ["Missaukee"] },
  { name: "Gilchrist Creek", counties: ["Montmorency"] },
  { name: "Hunt Creek", counties: ["Montmorency"] },
  { name: "East Branch Au Gres River", counties: ["Iosco"] },
  { name: "Baldwin Creek", counties: ["Lake"] },
  { name: "Boyne River", counties: ["Charlevoix"] },
  { name: "Maple River", counties: ["Emmet"] },
  { name: "Middle Branch River", counties: ["Osceola"] },
  { name: "White River", counties: ["Newaygo"] },
  { name: "Big Sable River", counties: ["Mason", "Lake"] },
];
