import { loadParcelsTable, runQuery } from "./lib/duckdb.js";
import { checkManifest } from "./lib/manifest.js";
import { computeSchemaHash } from "@brp/schema";

async function bootstrap(): Promise<void> {
  const { hash } = await computeSchemaHash();
  const manifestResult = await checkManifest("/data/manifest.json", hash);
  if (!manifestResult.ok) {
    console.error("Manifest check failed:", manifestResult.reason);
    document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">${manifestResult.reason}</p>`;
    return;
  }
  console.log(
    `Loading ${manifestResult.manifest.cardCount} cards from ${manifestResult.manifest.counties.join(", ")}, exported ${manifestResult.manifest.exportedAt}`
  );

  await loadParcelsTable("/data/blue-ribbon-corridor.parquet");
  // Note: runQuery's `rowCount` is the number of rows in the *result set*
  // (always 1 for this aggregate query) -- the actual card count is the
  // value of the `n` column in that single row, read from `rows` instead.
  const { rows } = await runQuery("SELECT COUNT(*) AS n FROM cards");
  const cardCount = Number(rows[0]?.n);
  console.log(`duckdb-wasm loaded ${cardCount} row(s) into the cards table`);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
});
