import { loadParcelsTable } from "./lib/duckdb.js";
import { checkManifest } from "./lib/manifest.js";
import { initMap, renderParcels, renderStreams } from "./lib/map.js";
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

  const map = initMap("map");
  const layerByPin = await renderParcels(map);
  await renderStreams(map, "/data/streams.geojson");
  console.log(`Rendered ${layerByPin.size} parcel polygon(s)`);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed:", err);
});
