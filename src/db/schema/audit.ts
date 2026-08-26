import "server-only";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id } from "./_helpers";
import { SUBJECT_TABLES } from "./provenance";

export const IMPORT_MODES = ["dry_run", "apply"] as const;
export const IMPORT_BATCH_STATUSES = ["running", "succeeded", "failed", "rolled_back"] as const;
export const CONFLICT_RESOLUTIONS = ["accepted", "rejected", "pending"] as const;
export const CHANGE_LOG_ACTIONS = ["create", "update", "delete", "archive", "verify"] as const;

export const importBatches = sqliteTable("import_batches", {
  id: id(),
  startedAt: integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer({ mode: "timestamp_ms" }),
  mode: text({ enum: IMPORT_MODES }).notNull(),
  sourceLabel: text().notNull(),
  fileHash: text(),
  actor: text(),
  summaryJson: text({ mode: "json" }),
  status: text({ enum: IMPORT_BATCH_STATUSES }).notNull().default("running"),
});

export const importConflicts = sqliteTable("import_conflicts", {
  id: id(),
  batchId: integer()
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
  subjectId: integer().notNull(),
  fieldKey: text().notNull(),
  currentJson: text({ mode: "json" }),
  proposedJson: text({ mode: "json" }),
  reason: text(),
  resolvedAt: integer({ mode: "timestamp_ms" }),
  resolution: text({ enum: CONFLICT_RESOLUTIONS }).notNull().default("pending"),
});

export const changeLog = sqliteTable(
  "change_log",
  {
    id: id(),
    at: integer({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    actor: text(),
    action: text({ enum: CHANGE_LOG_ACTIONS }).notNull(),
    subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
    subjectId: integer().notNull(),
    fieldKey: text(),
    beforeJson: text({ mode: "json" }),
    afterJson: text({ mode: "json" }),
    batchId: integer().references(() => importBatches.id),
    note: text(),
  },
  (t) => [
    index("change_log_subject_idx").on(t.subjectTable, t.subjectId),
    index("change_log_at_idx").on(t.at),
  ],
);
