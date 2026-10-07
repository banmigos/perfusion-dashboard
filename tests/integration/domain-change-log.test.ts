import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { recordChange } from "@/domain/changeLog";
import * as schema from "@/db/schema";

describe("recordChange", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("inserts a change_log row with the given action, subject, and JSON snapshots", () => {
    recordChange(db, {
      action: "create",
      subjectTable: "schools",
      subjectId: 42,
      fieldKey: null,
      before: null,
      after: { id: 42, name: "Test School" },
    });

    const rows = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, 42))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("create");
    expect(rows[0]!.subjectTable).toBe("schools");
    expect(rows[0]!.actor).toBeNull();
    expect(rows[0]!.batchId).toBeNull();
    expect(rows[0]!.beforeJson).toBeNull();
    expect(rows[0]!.afterJson).toEqual({ id: 42, name: "Test School" });
  });

  it("participates in a transaction: a rollback removes both the mutation and the log row", () => {
    expect(() =>
      db.transaction((tx) => {
        tx.insert(schema.schools)
          .values({ slug: "rollback-school", name: "Rollback School" })
          .run();
        recordChange(tx, {
          action: "create",
          subjectTable: "schools",
          subjectId: 999,
          before: null,
          after: { slug: "rollback-school" },
        });
        throw new Error("force rollback");
      }),
    ).toThrow("force rollback");

    expect(
      db
        .select()
        .from(schema.schools)
        .where(eq(schema.schools.slug, "rollback-school"))
        .all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.subjectId, 999))
        .all(),
    ).toHaveLength(0);
  });
});
