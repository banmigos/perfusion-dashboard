import "server-only";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CHANGE_LOG_ACTIONS } from "@/db/schema/audit";
import { SUBJECT_TABLES } from "@/db/schema/provenance";

export type ChangeLogAction = (typeof CHANGE_LOG_ACTIONS)[number];
export type ChangeLogSubjectTable = (typeof SUBJECT_TABLES)[number];

type Executor = Pick<BetterSQLite3Database<typeof schema>, "insert">;

export function recordChange(
  db: Executor,
  input: {
    action: ChangeLogAction;
    subjectTable: ChangeLogSubjectTable;
    subjectId: number;
    fieldKey?: string | null;
    before?: unknown;
    after?: unknown;
    note?: string | null;
  },
): void {
  db.insert(schema.changeLog)
    .values({
      actor: null,
      action: input.action,
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey ?? null,
      beforeJson: input.before ?? null,
      afterJson: input.after ?? null,
      batchId: null,
      note: input.note ?? null,
    })
    .run();
}
