import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { getProgramDetail } from "./programs";
import { CURRENT_USER_ID } from "./user";
import { buildProgramRow, type ProgramTableRow } from "@/lib/programRows";
import type { ApplicationStatus } from "./saved";

type ChecklistItem = typeof schema.checklistItems.$inferSelect;

export type ChecklistProgress = {
  total: number;
  done: number;
  /** Items neither done nor skipped. */
  open: number;
};

/**
 * One program as every application view sees it: canonical facts (with their
 * claims, via `buildProgramRow`) beside the user's personal state. The two
 * stay separate fields so a view can never mistake a checklist tick for an
 * official requirement.
 */
export type ApplicationRow = ProgramTableRow & {
  programId: number;
  numbers: { lengthMonths: number | null; classSize: number | null };
  cycle: {
    id: number;
    opensDate: string | null;
    decisionDate: string | null;
  } | null;
  /** Null when the program is not being tracked. */
  saved: {
    id: number;
    status: ApplicationStatus;
    statusChangedAt: Date | null;
    priority: (typeof schema.PRIORITIES)[number] | null;
    note: string | null;
  } | null;
  /** Items from the current cycle's checklist; empty when there is none. */
  items: ChecklistItem[];
  progress: ChecklistProgress;
};

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  const done = items.filter((i) => i.status === "done").length;
  const skipped = items.filter((i) => i.status === "skipped").length;
  return {
    total: items.length - skipped,
    done,
    open: items.length - done - skipped,
  };
}

export function listApplicationRows(
  db: BetterSQLite3Database<typeof schema>,
): ApplicationRow[] {
  const programs = db
    .select({ school: schema.schools, program: schema.programs })
    .from(schema.programs)
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(
      and(
        ne(schema.programs.status, "archived"),
        ne(schema.schools.status, "archived"),
      ),
    )
    .orderBy(schema.schools.name, schema.programs.name)
    .all();

  const savedRows = db
    .select()
    .from(schema.savedPrograms)
    .where(eq(schema.savedPrograms.userId, CURRENT_USER_ID))
    .all();
  const savedByProgram = new Map(savedRows.map((s) => [s.programId, s]));

  const itemRows = db
    .select({
      item: schema.checklistItems,
      savedProgramId: schema.personalChecklists.savedProgramId,
      cycleId: schema.personalChecklists.cycleId,
    })
    .from(schema.checklistItems)
    .innerJoin(
      schema.personalChecklists,
      eq(schema.checklistItems.checklistId, schema.personalChecklists.id),
    )
    .where(eq(schema.personalChecklists.userId, CURRENT_USER_ID))
    .orderBy(schema.checklistItems.sortOrder)
    .all();

  return programs.flatMap(({ school, program }) => {
    const detail = getProgramDetail(db, school.slug, program.slug);
    if (!detail) return [];
    const current = detail.cycles[0]?.cycle ?? null;
    const saved = savedByProgram.get(program.id) ?? null;
    const items = saved
      ? itemRows
          .filter(
            (r) =>
              r.savedProgramId === saved.id &&
              (current === null || r.cycleId === current.id),
          )
          .map((r) => r.item)
      : [];

    return [
      {
        ...buildProgramRow(detail),
        programId: program.id,
        numbers: {
          lengthMonths: program.programLengthMonths,
          classSize: program.classSize,
        },
        cycle: current && {
          id: current.id,
          opensDate: current.applicationOpensDate,
          decisionDate: current.decisionNotificationDate,
        },
        saved: saved && {
          id: saved.id,
          status: saved.applicationStatus,
          statusChangedAt: saved.statusChangedAt,
          priority: saved.priority,
          note: saved.personalNote,
        },
        items,
        progress: checklistProgress(items),
      },
    ];
  });
}
