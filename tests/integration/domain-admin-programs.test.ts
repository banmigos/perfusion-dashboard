import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  archiveProgram,
  createProgram,
  updateProgram,
} from "@/domain/admin/programs";
import * as schema from "@/db/schema";

describe("programs admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let schoolId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    schoolId = createSchool(db, { slug: "acme-u", name: "Acme University" }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createProgram inserts a row scoped to the school and writes a create log row", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });

    expect(program.schoolId).toBe(schoolId);
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.subjectTable === "programs")).toHaveLength(1);
  });

  it("updateProgram changes credential and writes an update log row", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });

    const updated = updateProgram(db, program.id, { credential: "Certificate" });
    expect(updated.credential).toBe("Certificate");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.action === "update")).toHaveLength(1);
  });

  it("archiveProgram archives without touching the parent school", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    });

    archiveProgram(db, program.id);

    const [row] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, program.id))
      .all();
    expect(row!.status).toBe("archived");

    const [school] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, schoolId))
      .all();
    expect(school!.status).toBe("draft");
  });
});
