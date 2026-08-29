import type { CountyParcelAdapter } from "./types.js";
import { osceolaAdapter } from "./osceola.js";
import { ioscoAdapter } from "./iosco.js";
import { roscommonAdapter } from "./roscommon.js";

export const COUNTY_REGISTRY: Record<string, CountyParcelAdapter> = {
  Osceola: osceolaAdapter,
  Iosco: ioscoAdapter,
  Roscommon: roscommonAdapter,
};

export function getCountyAdapter(county: string): CountyParcelAdapter {
  const adapter = COUNTY_REGISTRY[county];
  if (!adapter) {
    throw new Error(`No CountyParcelAdapter registered for county "${county}"`);
  }
  return adapter;
}
