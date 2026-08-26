import Database from "better-sqlite3";

/**
 * Applies the connection-level PRAGMAs every better-sqlite3 connection in
 * this app must have set — both the production connection (src/db/client.ts)
 * and the integration test harness (tests/integration/helpers/db.ts), so the
 * test suite exercises this exact code path rather than a parallel
 * reimplementation of it.
 *
 * - `foreign_keys = ON`: SQLite defaults this OFF, which would silently void
 *   every FK constraint (docs/data-model.md §7).
 * - `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`:
 *   documented connection settings (docs/data-model.md §7).
 */
export function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
}
