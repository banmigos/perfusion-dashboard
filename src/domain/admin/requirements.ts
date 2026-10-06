import "server-only";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type RequirementInput = {
  cycleId: number;
  category: (typeof REQUIREMENT_CATEGORIES)[number];
  label: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  unit?: string | null;
  isRequired?: boolean | null;
};
export type RequirementPatch = Partial<RequirementInput>;
export type Requirement = typeof schema.requirements.$inferSelect;

export function createRequirement(
  db: BetterSQLite3Database<typeof schema>,
  input: RequirementInput,
): Requirement {
  return db.transaction((tx) => {
    const [maxRow] = tx
      .select({
        maxSort: sql<number | null>`max(${schema.requirements.sortOrder})`,
      })
      .from(schema.requirements)
      .where(eq(schema.requirements.cycleId, input.cycleId))
      .all();
    const sortOrder = (maxRow?.maxSort ?? -1) + 1;

    const [row] = tx
      .insert(schema.requirements)
      .values({
        cycleId: input.cycleId,
        category: input.category,
        label: input.label,
        valueText: input.valueText ?? null,
        valueNumber: input.valueNumber ?? null,
        valueBool: input.valueBool ?? null,
        valueDate: input.valueDate ?? null,
        unit: input.unit ?? null,
        isRequired: input.isRequired ?? null,
        sortOrder,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "requirements",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateRequirement(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: RequirementPatch,
): Requirement {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    if (!before) {
      throw new Error(`requirement ${id} not found`);
    }

    tx.update(schema.requirements)
      .set(patch)
      .where(eq(schema.requirements.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "requirements",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveRequirement(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    if (!before) {
      throw new Error(`requirement ${id} not found`);
    }

    tx.update(schema.requirements)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.requirements.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "requirements",
      subjectId: id,
      before,
      after,
    });
  });
}

export function requirementClaimFieldKey(req: {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueDate: string | null;
}): "value_text" | "value_number" | "value_bool" | "value_date" {
  if (req.valueText !== null) return "value_text";
  if (req.valueNumber !== null) return "value_number";
  if (req.valueBool !== null) return "value_bool";
  if (req.valueDate !== null) return "value_date";
  return "value_text";
}
