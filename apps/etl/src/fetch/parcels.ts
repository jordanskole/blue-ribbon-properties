import { getCountyAdapter } from "../counties/registry.js";
import type { NormalizedParcelRecord } from "../counties/types.js";

export async function fetchParcel(
  pin: string,
  county: string
): Promise<NormalizedParcelRecord> {
  const adapter = getCountyAdapter(county);
  const raw = await adapter.fetchParcel(pin);
  return adapter.normalize(raw);
}
