import "server-only";
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "./_helpers";
import { applicationCycles, programs, requirements, users } from "./canonical";

export const PRIORITIES = ["reach", "target", "likely", "dropped"] as const;
export const CHECKLIST_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "skipped",
] as const;

export const savedPrograms = sqliteTable(
  "saved_programs",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: integer()
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    addedAt: integer({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    priority: text({ enum: PRIORITIES }),
    personalNote: text(),
  },
  (t) => [unique("saved_programs_user_program_unique").on(t.userId, t.programId)],
);

export const personalChecklists = sqliteTable("personal_checklists", {
  id: id(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  savedProgramId: integer()
    .notNull()
    .references(() => savedPrograms.id, { onDelete: "cascade" }),
  cycleId: integer().references(() => applicationCycles.id, { onDelete: "restrict" }),
  title: text().notNull(),
  createdAt: integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: id(),
    checklistId: integer()
      .notNull()
      .references(() => personalChecklists.id, { onDelete: "cascade" }),
    title: text().notNull(),
    detail: text(),
    category: text(),
    dueAt: integer({ mode: "timestamp_ms" }),
    status: text({ enum: CHECKLIST_ITEM_STATUSES }).notNull().default("todo"),
    completedAt: integer({ mode: "timestamp_ms" }),
    linkUrl: text(),
    derivedFromRequirementId: integer().references(() => requirements.id, {
      onDelete: "set null",
    }),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("checklist_items_status_due_idx").on(t.status, t.dueAt)],
);
