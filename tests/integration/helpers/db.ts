import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";
import { applyPragmas } from "@/db/pragmas";

export function createTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfusion-test-"));
  const file = path.join(dir, "test.db");

  const sqlite = new Database(file);
  applyPragmas(sqlite);

  const db = drizzle(sqlite, { schema, casing: "snake_case" });
  runMigrations(db);

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type TestDb = ReturnType<typeof createTestDb>["db"];
