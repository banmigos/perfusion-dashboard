import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { archiveCycle, createCycle, updateCycle } from "@/domain/admin/cycles";
import * as schema from "@/db/schema";

describe("application cycles admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let programId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    const schoolId = createSchool(db, {
      slug: "acme-u",
      name: "Acme University",
    }).id;
    programId = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createCycle inserts a row and writes a create log row", () => {
    const cycle = createCycle(db, {
      programId,
      cycleLabel: "2026-27",
      deadlineDate: "2026-11-01",
      deadlineType: "firm",
    });

    expect(cycle.deadlineDate).toBe("2026-11-01");
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, cycle.id))
      .all();
    expect(
      logs.filter((l) => l.subjectTable === "application_cycles"),
    ).toHaveLength(1);
  });

  it("updateCycle changes the deadline and writes an update log row with before/after", () => {
    const cycle = createCycle(db, { programId, cycleLabel: "2026-27" });

    const updated = updateCycle(db, cycle.id, { deadlineDate: "2026-10-15" });
    expect(updated.deadlineDate).toBe("2026-10-15");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, cycle.id))
      .all();
    expect(logs.filter((l) => l.action === "update")).toHaveLength(1);
    const updateLog = logs.find((l) => l.action === "update")!;
    expect(
      (updateLog.beforeJson as { deadlineDate: string | null }).deadlineDate,
    ).toBeNull();
    expect(
      (updateLog.afterJson as { deadlineDate: string | null }).deadlineDate,
    ).toBe("2026-10-15");
  });

  it("archiveCycle sets status=archived and writes an archive log row", () => {
    const cycle = createCycle(db, { programId, cycleLabel: "2025-26" });

    archiveCycle(db, cycle.id);

    const [row] = db
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, cycle.id))
      .all();
    expect(row!.status).toBe("archived");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, cycle.id))
      .all();
    expect(logs.filter((l) => l.action === "archive")).toHaveLength(1);
    const archiveLog = logs.find((l) => l.action === "archive")!;
    expect((archiveLog.beforeJson as { status: string }).status).toBe("draft");
    expect((archiveLog.afterJson as { status: string }).status).toBe(
      "archived",
    );
  });
});
