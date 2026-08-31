import * as duckdb from "@duckdb/duckdb-wasm";

let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

async function init(): Promise<duckdb.AsyncDuckDB> {
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = await duckdb.createWorker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (!initPromise) {
    initPromise = init();
  }
  return initPromise;
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

export async function runQuery(sql: string): Promise<QueryResult> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    const rows = table.toArray().map((row) => row.toJSON() as Record<string, unknown>);
    return { rows, rowCount: table.numRows };
  } finally {
    await conn.close();
  }
}

/** Fetches the static Parquet export and registers it as the `cards` table
 * in the in-browser DuckDB instance. Boundary geometry is stored as a plain
 * JSON-serialized GeoJSON string (`identity_boundary_value`, TEXT column)
 * -- no DuckDB spatial extension needed. `JSON.parse()` on that column in
 * calling code hands Leaflet exactly the shape it expects. */
export async function loadParcelsTable(parquetUrl: string): Promise<void> {
  const db = await getDB();
  const res = await fetch(parquetUrl);
  if (!res.ok) {
    throw new Error(`failed to fetch ${parquetUrl}: HTTP ${res.status}`);
  }
  const buffer = new Uint8Array(await res.arrayBuffer());
  await db.registerFileBuffer("cards.parquet", buffer);
  const conn = await db.connect();
  try {
    await conn.query(`CREATE TABLE cards AS SELECT * FROM read_parquet('cards.parquet')`);
  } finally {
    await conn.close();
  }
}
