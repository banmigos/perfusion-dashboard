import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { recordChange } from "../changeLog";

export type SchoolInput = {
  slug: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string;
  websiteUrl?: string | null;
};
export type SchoolPatch = Partial<SchoolInput>;
export type School = typeof schema.schools.$inferSelect;

export function createSchool(
  db: BetterSQLite3Database<typeof schema>,
  input: SchoolInput,
): School {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.schools)
      .values({
        slug: input.slug,
        name: input.name,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? "US",
        websiteUrl: input.websiteUrl ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "schools",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateSchool(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: SchoolPatch,
): School {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    if (!before) {
      throw new Error(`school ${id} not found`);
    }

    tx.update(schema.schools).set(patch).where(eq(schema.schools.id, id)).run();

    const [after] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "schools",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveSchool(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    if (!before) {
      throw new Error(`school ${id} not found`);
    }

    tx.update(schema.schools)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.schools.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "schools",
      subjectId: id,
      before,
      after,
    });
  });
}
