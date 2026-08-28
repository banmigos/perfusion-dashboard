import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CURRENT_USER_ID } from "./user";

export type Priority = (typeof schema.PRIORITIES)[number];

export function saveProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): typeof schema.savedPrograms.$inferSelect {
  db.insert(schema.savedPrograms)
    .values({ userId: CURRENT_USER_ID, programId })
    .onConflictDoNothing()
    .run();

  const [row] = db
    .select()
    .from(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .all();
  return row!;
}

export function unsaveProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): void {
  db.delete(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .run();
}

export function updateSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
  patch: { priority?: Priority | null; personalNote?: string | null },
): void {
  db.update(schema.savedPrograms)
    .set(patch)
    .where(eq(schema.savedPrograms.id, savedProgramId))
    .run();
}

export function getSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): typeof schema.savedPrograms.$inferSelect | null {
  const [row] = db
    .select()
    .from(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .all();
  return row ?? null;
}

export type SavedProgramListItem = {
  savedProgram: typeof schema.savedPrograms.$inferSelect;
  school: Pick<
    typeof schema.schools.$inferSelect,
    "slug" | "name" | "city" | "state"
  >;
  program: Pick<
    typeof schema.programs.$inferSelect,
    "id" | "slug" | "name" | "credential"
  >;
};

export function listSavedPrograms(
  db: BetterSQLite3Database<typeof schema>,
): SavedProgramListItem[] {
  return db
    .select({
      savedProgram: schema.savedPrograms,
      school: {
        slug: schema.schools.slug,
        name: schema.schools.name,
        city: schema.schools.city,
        state: schema.schools.state,
      },
      program: {
        id: schema.programs.id,
        slug: schema.programs.slug,
        name: schema.programs.name,
        credential: schema.programs.credential,
      },
    })
    .from(schema.savedPrograms)
    .innerJoin(
      schema.programs,
      eq(schema.savedPrograms.programId, schema.programs.id),
    )
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(eq(schema.savedPrograms.userId, CURRENT_USER_ID))
    .orderBy(desc(schema.savedPrograms.addedAt))
    .all();
}
