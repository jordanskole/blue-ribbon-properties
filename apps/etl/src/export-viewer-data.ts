import { mkdirSync, copyFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { computeSchemaHash } from "@brp/schema";

interface Manifest {
  schemaHash: string;
  exportedAt: string;
  cardCount: number;
  counties: string[];
}

export async function writeManifest(
  cardCount: number,
  counties: string[],
  outDir: string
): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const { hash } = await computeSchemaHash();
  const manifest: Manifest = {
    schemaHash: hash,
    exportedAt: new Date().toISOString().slice(0, 10),
    cardCount,
    counties: [...counties].sort(),
  };
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export function copyParquet(storeParquetPath: string, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  copyFileSync(storeParquetPath, join(outDir, "blue-ribbon-corridor.parquet"));
}
