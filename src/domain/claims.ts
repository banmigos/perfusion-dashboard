import "server-only";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { SUBJECT_TABLES } from "@/db/schema/provenance";

export type SubjectTable = (typeof SUBJECT_TABLES)[number];

export type SubjectRef = {
  subjectTable: SubjectTable;
  subjectId: number;
};

/**
 * The field keys a requirement's claim can be recorded under — one per
 * value_* column. Legacy/lead imports key claims on empty requirements by
 * value_number/value_bool, so readers must search all four.
 */
export const REQUIREMENT_CLAIM_FIELD_KEYS = [
  "value_text",
  "value_number",
  "value_bool",
  "value_date",
] as const;
export type RequirementClaimFieldKey =
  (typeof REQUIREMENT_CLAIM_FIELD_KEYS)[number];

export type ClaimWithSource = typeof schema.claims.$inferSelect & {
  source: typeof schema.sources.$inferSelect | null;
};

export function claimKey(
  subjectTable: SubjectTable,
  subjectId: number,
  fieldKey: string,
): string {
  return `${subjectTable}:${subjectId}:${fieldKey}`;
}

export function loadClaims(
  db: BetterSQLite3Database<typeof schema>,
  subjects: SubjectRef[],
): Map<string, ClaimWithSource> {
  const map = new Map<string, ClaimWithSource>();
  if (subjects.length === 0) {
    return map;
  }

  const idsByTable = new Map<SubjectTable, number[]>();
  for (const subject of subjects) {
    const ids = idsByTable.get(subject.subjectTable) ?? [];
    ids.push(subject.subjectId);
    idsByTable.set(subject.subjectTable, ids);
  }

  const conditions: SQL[] = [...idsByTable.entries()].map(([table, ids]) =>
    and(
      eq(schema.claims.subjectTable, table),
      inArray(schema.claims.subjectId, ids),
    )!,
  );

  const rows = db
    .select()
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(or(...conditions))
    .all();

  for (const row of rows) {
    const key = claimKey(
      row.claims.subjectTable,
      row.claims.subjectId,
      row.claims.fieldKey,
    );
    map.set(key, { ...row.claims, source: row.sources });
  }

  return map;
}
