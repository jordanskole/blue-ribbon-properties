import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    // Same exclusion bankql's apps/web uses -- duckdb-wasm's dynamic worker
    // imports don't survive Vite's dependency pre-bundling.
    exclude: ["@duckdb/duckdb-wasm"],
  },
});
