import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { CAS_SERVICES, DEADLINE_TYPES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type CycleInput = {
  programId: number;
  cycleLabel: string;
  entryYear?: number | null;
  applicationOpensDate?: string | null;
  deadlineDate?: string | null;
  deadlineTimeLocal?: string | null;
  deadlineTimezone?: string | null;
  deadlineType?: (typeof DEADLINE_TYPES)[number] | null;
  casService?: (typeof CAS_SERVICES)[number] | null;
  decisionNotificationDate?: string | null;
};
export type CyclePatch = Partial<CycleInput>;
export type Cycle = typeof schema.applicationCycles.$inferSelect;

export function createCycle(
  db: BetterSQLite3Database<typeof schema>,
  input: CycleInput,
): Cycle {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.applicationCycles)
      .values({
        programId: input.programId,
        cycleLabel: input.cycleLabel,
        entryYear: input.entryYear ?? null,
        applicationOpensDate: input.applicationOpensDate ?? null,
        deadlineDate: input.deadlineDate ?? null,
        deadlineTimeLocal: input.deadlineTimeLocal ?? null,
        deadlineTimezone: input.deadlineTimezone ?? null,
        deadlineType: input.deadlineType ?? null,
        casService: input.casService ?? null,
        decisionNotificationDate: input.decisionNotificationDate ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "application_cycles",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateCycle(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: CyclePatch,
): Cycle {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    if (!before) {
      throw new Error(`application cycle ${id} not found`);
    }

    tx.update(schema.applicationCycles)
      .set(patch)
      .where(eq(schema.applicationCycles.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "application_cycles",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveCycle(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    if (!before) {
      throw new Error(`application cycle ${id} not found`);
    }

    tx.update(schema.applicationCycles)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.applicationCycles.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "application_cycles",
      subjectId: id,
      before,
      after,
    });
  });
}
