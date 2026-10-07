import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import Database from "better-sqlite3";
import { formatBackupStamp, selectRetention } from "./backup/retention";

// Host-side backup per docs/deployment.md §10. Never `cp` a live WAL database:
// db.backup() takes a consistent snapshot under concurrent access.

function resolveDatabasePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;
}

function checkBackupCopy(file: string): void {
  const copy = new Database(file, { fileMustExist: true });
  try {
    // backup() preserves WAL mode; switch the copy to a single self-contained
    // file so no -wal/-shm sidecars are left behind once it is gzipped.
    copy.pragma("journal_mode = DELETE");
    const integrity = copy.pragma("integrity_check") as {
      integrity_check: string;
    }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new Error(
        `integrity_check failed: ${JSON.stringify(integrity.slice(0, 10))}`,
      );
    }
    const fkViolations = copy.pragma("foreign_key_check") as unknown[];
    if (fkViolations.length > 0) {
      throw new Error(
        `foreign_key_check reported ${fkViolations.length} violation(s): ${JSON.stringify(fkViolations.slice(0, 10))}`,
      );
    }
  } finally {
    copy.close();
  }
}

async function gzipFile(source: string): Promise<string> {
  const target = `${source}.gz`;
  const partial = `${target}.partial`;
  await pipeline(
    fs.createReadStream(source),
    createGzip({ level: 9 }),
    fs.createWriteStream(partial, { mode: 0o600 }),
  );
  fs.renameSync(partial, target);
  fs.unlinkSync(source);
  return target;
}

async function main(): Promise<void> {
  const databasePath = path.resolve(
    resolveDatabasePath(process.env.DATABASE_URL ?? "file:./data/app.db"),
  );
  const backupDir = path.resolve(process.env.BACKUP_DIR ?? "./data/backups");
  const remote = process.env.BACKUP_REMOTE?.trim();

  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });

  const base = `app-${formatBackupStamp(new Date())}`;
  const dbCopy = path.join(backupDir, `${base}.db`);
  if (fs.existsSync(dbCopy) || fs.existsSync(`${dbCopy}.gz`)) {
    throw new Error(`Refusing to overwrite existing backup ${base}.`);
  }

  const source = new Database(databasePath, { fileMustExist: true });
  try {
    await source.backup(dbCopy);
  } finally {
    source.close();
  }
  fs.chmodSync(dbCopy, 0o600);

  try {
    checkBackupCopy(dbCopy);
  } catch (error) {
    console.error(`Backup verification FAILED; left for inspection: ${dbCopy}`);
    throw error;
  }

  const archive = await gzipFile(dbCopy);
  console.log(`Backup written: ${archive}`);

  const { prune } = selectRetention(fs.readdirSync(backupDir));
  for (const name of prune) {
    fs.unlinkSync(path.join(backupDir, name));
    console.log(`Pruned: ${name}`);
  }

  if (remote) {
    // No shell: BACKUP_REMOTE is passed as a single argv entry.
    execFileSync("rsync", ["-a", "--", archive, remote], { stdio: "inherit" });
    console.log(`Copied off-box to ${remote}`);
  } else {
    console.warn(
      "WARN  BACKUP_REMOTE is not set: this backup exists only on this disk.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    "Backup FAILED:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
