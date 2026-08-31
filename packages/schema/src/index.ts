export type { Provenance, VintageSourceType, Vintage, Field } from "./provenance.js";
export { combineProvenance } from "./provenance.js";

export type { PolygonGeometry } from "./geometry.js";

export type { ParcelIdentity } from "./identity.js";
export { validateIdentity } from "./identity.js";

export type {
  GroundwaterExpression,
  DryWetAdjacency,
  WetlandFootprint,
  CardDef,
} from "./card.js";
export { validateCard } from "./card.js";

export type { LayerDef } from "./layers.js";
export { LAYER_REGISTRY, getLayer } from "./layers.js";

export { CARD_COLUMNS } from "./duckdb-columns.js";
export { computeSchemaHash, type SchemaHash } from "./hash.js";
