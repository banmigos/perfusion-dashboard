import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  archiveProgram,
  createProgram,
  updateProgram,
} from "@/domain/admin/programs";
import { upsertClaim } from "@/domain/admin/claims";
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

    const updated = updateProgram(db, program.id, {
      credential: "Certificate",
    });
    expect(updated.credential).toBe("Certificate");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.action === "update")).toHaveLength(1);
  });

  it("createProgram stores directorName and updateProgram logs its change", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      directorName: "Jane Doe, CCP",
    });
    expect(program.directorName).toBe("Jane Doe, CCP");

    const updated = updateProgram(db, program.id, {
      directorName: "John Roe",
    });
    expect(updated.directorName).toBe("John Roe");

    const updates = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all()
      .filter((l) => l.subjectTable === "programs" && l.action === "update");
    expect(updates).toHaveLength(1);
    expect(
      (updates[0]!.beforeJson as { directorName: string }).directorName,
    ).toBe("Jane Doe, CCP");
    expect(
      (updates[0]!.afterJson as { directorName: string }).directorName,
    ).toBe("John Roe");
  });

  it("updateProgram demotes a verified claim on a changed column to needs_review with its own change_log row", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });
    const claim = upsertClaim(db, {
      subjectTable: "programs",
      subjectId: program.id,
      fieldKey: "credential",
      state: "known",
      sourceUrl: "https://acme.edu/perfusion",
      sourceType: "program_site",
      verification: "verified",
    });
    const nameClaim = upsertClaim(db, {
      subjectTable: "programs",
      subjectId: program.id,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/perfusion",
      sourceType: "program_site",
      verification: "verified",
    });
    const logCountBefore = db.select().from(schema.changeLog).all().length;

    // name is passed but unchanged; only credential actually changes.
    updateProgram(db, program.id, {
      name: "MS in Perfusion",
      credential: "Certificate",
    });

    const [demoted] = db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claim.id))
      .all();
    expect(demoted!.verification).toBe("needs_review");
    expect(demoted!.checkedAt).toEqual(claim.checkedAt);

    const [untouched] = db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, nameClaim.id))
      .all();
    expect(untouched).toEqual(nameClaim);

    const newLogs = db
      .select()
      .from(schema.changeLog)
      .all()
      .slice(logCountBefore);
    expect(newLogs).toHaveLength(2);
    const programLog = newLogs.find((l) => l.fieldKey === null)!;
    expect(programLog.action).toBe("update");
    expect(programLog.subjectTable).toBe("programs");
    const claimLog = newLogs.find((l) => l.fieldKey === "credential")!;
    expect(claimLog.action).toBe("update");
    expect(claimLog.subjectTable).toBe("programs");
    expect(claimLog.subjectId).toBe(program.id);
    expect((claimLog.beforeJson as { verification: string }).verification).toBe(
      "verified",
    );
    expect((claimLog.afterJson as { verification: string }).verification).toBe(
      "needs_review",
    );
  });

  it("updateProgram leaves non-verified claims and ignored columns alone", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });
    const draft = upsertClaim(db, {
      subjectTable: "programs",
      subjectId: program.id,
      fieldKey: "credential",
      state: "unknown",
    });
    const slugClaim = upsertClaim(db, {
      subjectTable: "programs",
      subjectId: program.id,
      fieldKey: "slug",
      state: "known",
      sourceUrl: "https://acme.edu/perfusion",
      sourceType: "program_site",
      verification: "verified",
    });

    updateProgram(db, program.id, { credential: "Certificate", slug: "new" });

    const rows = db.select().from(schema.claims).all();
    expect(rows.find((c) => c.id === draft.id)).toEqual(draft);
    expect(rows.find((c) => c.id === slugClaim.id)).toEqual(slugClaim);
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

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.action === "archive")).toHaveLength(1);
    const archiveLog = logs.find((l) => l.action === "archive")!;
    expect((archiveLog.beforeJson as { status: string }).status).toBe("draft");
    expect((archiveLog.afterJson as { status: string }).status).toBe(
      "archived",
    );
  });
});
