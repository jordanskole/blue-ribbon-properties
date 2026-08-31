/** Renders one parcel's full row (every CARD_COLUMNS column, not a curated
 * subset) into the #card-panel element -- the same measurements the
 * (still-deferred) MCP server's get_parcel_card would return, just shown
 * instead of returned as JSON. Grouped the same way CardDef groups them. */
export const FIELD_GROUPS: Array<{ label: string; prefix: string; fields: string[] }> = [
  { label: "Identity", prefix: "identity", fields: ["acres", "boundary"] },
  {
    label: "Groundwater (A1)",
    prefix: "groundwater",
    fields: ["thermal_class", "designated_trout_stream", "flowing_wells_nearby"],
  },
  {
    label: "Dry/Wet Adjacency (A2)",
    prefix: "dry_wet_adjacency",
    fields: ["dry_acres", "wet_acres", "dominant_dry_soil", "adjacent"],
  },
  { label: "Relief (A3)", prefix: "", fields: ["relief_envelope_to_water_ft"] },
  {
    label: "Wetland (A4)",
    prefix: "wetland",
    fields: ["wetland_pct", "wetland_between_envelope_and_water"],
  },
  { label: "Prominence (A5)", prefix: "", fields: ["prominence_ft"] },
];

export function columnPrefix(groupPrefix: string, field: string): string {
  return groupPrefix ? `${groupPrefix}_${field}` : field;
}

function formatValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "null";
  if (typeof raw === "string") {
    try {
      // dominant_dry_soil, flowing_wells_nearby, and boundary are stored as
      // JSON strings -- pretty-print if this value parses as JSON, display
      // as-is otherwise (a plain string field like thermal_class).
      return JSON.stringify(JSON.parse(raw), null, 1);
    } catch {
      return raw;
    }
  }
  return String(raw);
}

export function renderCardPanel(row: Record<string, unknown>): void {
  const panel = document.getElementById("card-panel");
  if (!panel) return;

  const sections: string[] = [
    `<h2>${row.parcel_id}</h2>`,
    `<p>${row.county} County — ${row.township}</p>`,
  ];

  for (const group of FIELD_GROUPS) {
    sections.push(`<h3>${group.label}</h3>`);
    for (const field of group.fields) {
      const col = columnPrefix(group.prefix, field);
      const value = formatValue(row[`${col}_value`]);
      const provenance = row[`${col}_provenance`];
      const asOf = row[`${col}_vintage_as_of`];
      const sourceType = row[`${col}_vintage_source_type`];
      const note = row[`${col}_vintage_note`];
      sections.push(
        `<div><strong>${field}</strong>: <pre>${value}</pre>` +
          `<small>${provenance} · ${sourceType} · as of ${asOf}` +
          `${note ? ` · ${note}` : ""}</small></div>`
      );
    }
  }

  panel.innerHTML = sections.join("\n");
  panel.style.display = "block";
}
