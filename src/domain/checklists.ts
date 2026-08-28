import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
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

export type ChecklistItemStatus = (typeof schema.CHECKLIST_ITEM_STATUSES)[number];

export function addChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  checklistId: number,
  input: {
    title: string;
    detail?: string | null;
    dueAt?: Date | null;
    linkUrl?: string | null;
  },
): typeof schema.checklistItems.$inferSelect {
  const [maxRow] = db
    .select({
      maxSort: sql<number | null>`max(${schema.checklistItems.sortOrder})`,
    })
    .from(schema.checklistItems)
    .where(eq(schema.checklistItems.checklistId, checklistId))
    .all();
  const sortOrder = (maxRow?.maxSort ?? -1) + 1;

  const [row] = db
    .insert(schema.checklistItems)
    .values({
      checklistId,
      title: input.title,
      detail: input.detail ?? null,
      dueAt: input.dueAt ?? null,
      linkUrl: input.linkUrl ?? null,
      sortOrder,
    })
    .returning()
    .all();
  return row!;
}

export function updateChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  itemId: number,
  patch: {
    title?: string;
    detail?: string | null;
    dueAt?: Date | null;
    linkUrl?: string | null;
    status?: ChecklistItemStatus;
  },
): void {
  const values: Partial<typeof schema.checklistItems.$inferInsert> = {
    ...patch,
  };
  if (patch.status !== undefined) {
    values.completedAt = patch.status === "done" ? new Date() : null;
  }
  db.update(schema.checklistItems)
    .set(values)
    .where(eq(schema.checklistItems.id, itemId))
    .run();
}

export function deleteChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  itemId: number,
): void {
  db.delete(schema.checklistItems)
    .where(eq(schema.checklistItems.id, itemId))
    .run();
}

export type ChecklistWithItems = {
  checklist: typeof schema.personalChecklists.$inferSelect;
  items: (typeof schema.checklistItems.$inferSelect)[];
};

export function listChecklistsForSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
): ChecklistWithItems[] {
  const checklists = db
    .select()
    .from(schema.personalChecklists)
    .where(eq(schema.personalChecklists.savedProgramId, savedProgramId))
    .orderBy(desc(schema.personalChecklists.createdAt))
    .all();
  const checklistIds = checklists.map((c) => c.id);
  const items = checklistIds.length
    ? db
        .select()
        .from(schema.checklistItems)
        .where(inArray(schema.checklistItems.checklistId, checklistIds))
        .orderBy(asc(schema.checklistItems.sortOrder))
        .all()
    : [];

  return checklists.map((checklist) => ({
    checklist,
    items: items.filter((item) => item.checklistId === checklist.id),
  }));
}

export type DueItem = {
  item: typeof schema.checklistItems.$inferSelect;
  program: Pick<typeof schema.programs.$inferSelect, "slug" | "name">;
  school: Pick<typeof schema.schools.$inferSelect, "slug" | "name">;
};

export function listDueItems(
  db: BetterSQLite3Database<typeof schema>,
): DueItem[] {
  return db
    .select({
      item: schema.checklistItems,
      program: { slug: schema.programs.slug, name: schema.programs.name },
      school: { slug: schema.schools.slug, name: schema.schools.name },
    })
    .from(schema.checklistItems)
    .innerJoin(
      schema.personalChecklists,
      eq(schema.checklistItems.checklistId, schema.personalChecklists.id),
    )
    .innerJoin(
      schema.savedPrograms,
      eq(schema.personalChecklists.savedProgramId, schema.savedPrograms.id),
    )
    .innerJoin(
      schema.programs,
      eq(schema.savedPrograms.programId, schema.programs.id),
    )
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        inArray(schema.checklistItems.status, ["todo", "in_progress", "blocked"]),
      ),
    )
    .orderBy(
      sql`${schema.checklistItems.dueAt} is null`,
      asc(schema.checklistItems.dueAt),
    )
    .all();
}
