import { DuckDBClient } from "npm:@observablehq/duckdb";
export { DuckDBClient };

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
export type { AsyncDuckDB };
export async function getDuckDB(client?: DuckDBClient): Promise<AsyncDuckDB> {
  let db = client;
  if (!db) {
    db = await DuckDBClient.of();
  }
  return db._db;
}


