import "server-only";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";
import {
  REQUIREMENT_CLAIM_FIELD_KEYS,
  type RequirementClaimFieldKey,
} from "../claims";
import { demoteVerifiedClaimsForEdit } from "./claims";

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
    demoteVerifiedClaimsForEdit(
      tx,
      "requirements",
      id,
      before,
      after!,
      requirementValueFieldKey,
    );
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

// Only the value_* columns carry a requirement's sourced fact; label,
// category, unit and isRequired edits do not demote a verified claim.
const REQUIREMENT_VALUE_COLUMN_KEYS: Record<string, string> = {
  valueText: "value_text",
  valueNumber: "value_number",
  valueBool: "value_bool",
  valueDate: "value_date",
};

function requirementValueFieldKey(column: string): string | null {
  return REQUIREMENT_VALUE_COLUMN_KEYS[column] ?? null;
}

type RequirementValues = {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueDate: string | null;
};

export function requirementClaimFieldKey(
  req: RequirementValues,
): RequirementClaimFieldKey {
  if (req.valueText !== null) return "value_text";
  if (req.valueNumber !== null) return "value_number";
  if (req.valueBool !== null) return "value_bool";
  if (req.valueDate !== null) return "value_date";
  return "value_text";
}

/**
 * Which claim backs this requirement's value. When a value_* column is
 * populated, its claim is the one keyed by that column. When every column is
 * NULL the requirement is either unresearched (no claim) or `unknown` /
 * `not_published` (a claim exists under whichever key its importer chose), so
 * search all four keys. The single source of truth for the public program
 * page and the admin cycle page.
 */
export function resolveRequirementClaim<C>(
  req: RequirementValues,
  claimFor: (fieldKey: RequirementClaimFieldKey) => C | undefined,
): { fieldKey: RequirementClaimFieldKey | null; claim: C | undefined } {
  const hasValue =
    req.valueText !== null ||
    req.valueNumber !== null ||
    req.valueBool !== null ||
    req.valueDate !== null;
  if (hasValue) {
    const fieldKey = requirementClaimFieldKey(req);
    return { fieldKey, claim: claimFor(fieldKey) };
  }
  for (const fieldKey of REQUIREMENT_CLAIM_FIELD_KEYS) {
    const claim = claimFor(fieldKey);
    if (claim !== undefined) {
      return { fieldKey, claim };
    }
  }
  return { fieldKey: null, claim: undefined };
}
