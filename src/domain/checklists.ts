import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CURRENT_USER_ID } from "./user";

export function generateChecklist(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
): typeof schema.personalChecklists.$inferSelect {
  const [savedProgram] = db
    .select()
    .from(schema.savedPrograms)
    .where(eq(schema.savedPrograms.id, savedProgramId))
    .all();
  if (!savedProgram) {
    throw new Error(`saved_programs row ${savedProgramId} not found`);
  }

  const [currentCycle] = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, savedProgram.programId),
        ne(schema.applicationCycles.status, "archived"),
      ),
    )
    .orderBy(desc(schema.applicationCycles.cycleLabel))
    .limit(1)
    .all();
  if (!currentCycle) {
    throw new Error(
      `program ${savedProgram.programId} has no non-archived application cycle`,
    );
  }

  const [existing] = db
    .select()
    .from(schema.personalChecklists)
    .where(
      and(
        eq(schema.personalChecklists.savedProgramId, savedProgramId),
        eq(schema.personalChecklists.cycleId, currentCycle.id),
      ),
    )
    .all();
  if (existing) {
    return existing;
  }

  const [program] = db
    .select()
    .from(schema.programs)
    .where(eq(schema.programs.id, savedProgram.programId))
    .all();

  const requirementRows = db
    .select()
    .from(schema.requirements)
    .where(
      and(
        eq(schema.requirements.cycleId, currentCycle.id),
        ne(schema.requirements.status, "archived"),
      ),
    )
    .orderBy(asc(schema.requirements.sortOrder))
    .all();

  return db.transaction((tx) => {
    const [checklist] = tx
      .insert(schema.personalChecklists)
      .values({
        userId: CURRENT_USER_ID,
        savedProgramId,
        cycleId: currentCycle.id,
        title: `${program!.name} — ${currentCycle.cycleLabel}`,
      })
      .returning()
      .all();

    if (requirementRows.length > 0) {
      tx.insert(schema.checklistItems)
        .values(
          requirementRows.map((req, index) => ({
            checklistId: checklist!.id,
            title: req.label,
            category: req.category,
            derivedFromRequirementId: req.id,
            sortOrder: index,
          })),
        )
        .run();
    }

    return checklist!;
  });
}
