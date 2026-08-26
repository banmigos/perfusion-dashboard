import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export function runMigrations<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema>,
): void {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
