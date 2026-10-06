import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { SOURCE_TYPES } from "@/db/schema/provenance";

export type SourceInput = {
  url: string;
  sourceType: (typeof SOURCE_TYPES)[number];
  title?: string | null;
  publisher?: string | null;
  notes?: string | null;
};
export type SourcePatch = Partial<Omit<SourceInput, "url">>;
export type Source = typeof schema.sources.$inferSelect;

// Structural, not the full BetterSQLite3Database: this lets callers pass
// either the outer `db` or an in-progress `tx` (Task 7's upsertClaim calls
// this from inside its own db.transaction((tx) => ...), so this function
// must not open a second transaction of its own — it just runs its two
// queries against whichever executor it is given).
type Executor = Pick<BetterSQLite3Database<typeof schema>, "select" | "insert">;

export function findOrCreateSource(db: Executor, input: SourceInput): Source {
  const [existing] = db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.url, input.url))
    .all();
  if (existing) {
    return existing;
  }

  const [row] = db
    .insert(schema.sources)
    .values({
      url: input.url,
      sourceType: input.sourceType,
      title: input.title ?? null,
      publisher: input.publisher ?? null,
      notes: input.notes ?? null,
    })
    .returning()
    .all();
  return row!;
}

export function updateSource(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: SourcePatch,
): Source {
  db.update(schema.sources).set(patch).where(eq(schema.sources.id, id)).run();
  const [row] = db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, id))
    .all();
  if (!row) {
    throw new Error(`source ${id} not found`);
  }
  return row;
}

export function listSources(
  db: BetterSQLite3Database<typeof schema>,
): Source[] {
  return db.select().from(schema.sources).orderBy(schema.sources.url).all();
}
