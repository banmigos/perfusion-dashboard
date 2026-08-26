import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function resolveDatabasePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const databasePath = resolveDatabasePath(databaseUrl);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema, casing: "snake_case" });
