import "server-only";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "./_helpers";

export const SOURCE_TYPES = [
  "program_site",
  "accreditor",
  "cas",
  "pdf",
  "email",
  "phone",
  "other",
] as const;
export const CLAIM_STATES = ["known", "unknown", "not_published", "not_applicable"] as const;
export const VERIFICATION_STATES = [
  "draft",
  "needs_review",
  "verified",
  "stale",
  "archived",
] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const SUBJECT_TABLES = [
  "schools",
  "programs",
  "application_cycles",
  "requirements",
  "prerequisite_courses",
  "tuition_estimates",
] as const;

export const sources = sqliteTable(
  "sources",
  {
    id: id(),
    url: text().notNull(),
    canonicalUrl: text(),
    title: text(),
    publisher: text(),
    sourceType: text({ enum: SOURCE_TYPES }).notNull(),
    fetchedAt: integer({ mode: "timestamp_ms" }),
    contentHash: text(),
    snapshotPath: text(),
    notes: text(),
    createdAt: createdAt(),
  },
  (t) => [unique("sources_url_unique").on(t.url)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: id(),
    subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
    subjectId: integer().notNull(),
    fieldKey: text().notNull(),
    state: text({ enum: CLAIM_STATES }).notNull(),
    sourceId: integer().references(() => sources.id, { onDelete: "restrict" }),
    quote: text(),
    note: text(),
    checkedAt: integer({ mode: "timestamp_ms" }),
    verification: text({ enum: VERIFICATION_STATES }).notNull().default("draft"),
    locked: integer({ mode: "boolean" }).notNull().default(false),
    confidence: text({ enum: CONFIDENCE_LEVELS }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("claims_subject_field_unique").on(t.subjectTable, t.subjectId, t.fieldKey),
    index("claims_verification_idx").on(t.verification),
    index("claims_checked_at_idx").on(t.checkedAt),
    index("claims_subject_idx").on(t.subjectTable, t.subjectId),
    check(
      "claims_known_requires_source",
      sql`(${t.state} != 'known') OR (${t.sourceId} IS NOT NULL)`,
    ),
    check(
      "claims_verified_requires_checked_at",
      sql`(${t.verification} = 'draft') OR (${t.checkedAt} IS NOT NULL)`,
    ),
    check(
      "claims_subject_table_known",
      sql`${t.subjectTable} IN ('schools','programs','application_cycles','requirements','prerequisite_courses','tuition_estimates')`,
    ),
  ],
);
