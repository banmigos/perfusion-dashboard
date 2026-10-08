import crypto from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

/**
 * Staleness sweep (docs/research-workflow.md §6). Re-fetches every source that
 * has a stored `content_hash`; when the page changed, every `verified` claim
 * citing it is demoted to `needs_review` and the new hash is stored.
 *
 * It only ever writes `claims.verification`, `sources.content_hash` and
 * `sources.fetched_at` (plus change_log rows). It never touches a value
 * column. Claims that are not `verified` are left alone: drafts are already in
 * the /verify queue, and the DB forbids a non-draft claim without `checked_at`.
 *
 * `src/domain/**` is server-only and cannot be imported from tsx, so the
 * change_log row is written inline here, as in scripts/lead-import.
 */

type Db = BetterSQLite3Database<typeof schema>;

export type Fetcher = (url: string) => Promise<Uint8Array>;

export interface SweepOptions {
  /** Compute and report, write nothing. */
  dryRun: boolean;
  /** Also hash sources that have no `content_hash` yet; flags nothing. */
  baseline: boolean;
}

export type SourceOutcome = "unchanged" | "changed" | "baselined" | "error";

export interface SourceResult {
  url: string;
  outcome: SourceOutcome;
  /** Verified claims demoted (or that would be, on a dry run). */
  demoted: number;
  error?: string;
}

export interface SweepReport {
  results: SourceResult[];
}

export const hashContent = (bytes: Uint8Array): string =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

/** Production fetcher: http(s) only, bounded time and size, follows redirects. */
export const httpFetcher: Fetcher = async (url) => {
  const { protocol } = new URL(url);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error(`unsupported protocol ${protocol}`);
  }
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": "perfusion-path-staleness-sweep" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`response exceeds ${MAX_BYTES} bytes`);
  }
  return bytes;
};

export async function runSweep(
  db: Db,
  fetcher: Fetcher,
  opts: SweepOptions,
): Promise<SweepReport> {
  const sources = db
    .select()
    .from(schema.sources)
    .where(opts.baseline ? undefined : isNotNull(schema.sources.contentHash))
    .orderBy(schema.sources.url)
    .all();

  const results: SourceResult[] = [];

  for (const source of sources) {
    let hash: string;
    try {
      hash = hashContent(await fetcher(source.url));
    } catch (error) {
      results.push({
        url: source.url,
        outcome: "error",
        demoted: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (source.contentHash === null) {
      if (!opts.dryRun) {
        db.update(schema.sources)
          .set({ contentHash: hash, fetchedAt: new Date() })
          .where(eq(schema.sources.id, source.id))
          .run();
      }
      results.push({ url: source.url, outcome: "baselined", demoted: 0 });
      continue;
    }

    if (hash === source.contentHash) {
      results.push({ url: source.url, outcome: "unchanged", demoted: 0 });
      continue;
    }

    const apply = (tx: Db): number => {
      const verified = tx
        .select()
        .from(schema.claims)
        .where(
          and(
            eq(schema.claims.sourceId, source.id),
            eq(schema.claims.verification, "verified"),
          ),
        )
        .all();
      if (opts.dryRun) return verified.length;

      for (const claim of verified) {
        tx.update(schema.claims)
          .set({ verification: "needs_review" })
          .where(eq(schema.claims.id, claim.id))
          .run();
        tx.insert(schema.changeLog)
          .values({
            actor: null,
            action: "update",
            subjectTable: claim.subjectTable,
            subjectId: claim.subjectId,
            fieldKey: claim.fieldKey,
            beforeJson: claim,
            afterJson: { ...claim, verification: "needs_review" },
            note: `staleness sweep: content of ${source.url} changed`,
          })
          .run();
      }
      tx.update(schema.sources)
        .set({ contentHash: hash, fetchedAt: new Date() })
        .where(eq(schema.sources.id, source.id))
        .run();
      return verified.length;
    };

    const demoted = opts.dryRun ? apply(db) : db.transaction(apply);
    results.push({ url: source.url, outcome: "changed", demoted });
  }

  return { results };
}

// Re-exported so callers can report on sources a baseline pass would pick up.
export const countUnhashed = (db: Db): number =>
  db
    .select({ id: schema.sources.id })
    .from(schema.sources)
    .where(isNull(schema.sources.contentHash))
    .all().length;
