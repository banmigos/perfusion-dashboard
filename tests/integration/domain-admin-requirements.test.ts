import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { createCycle } from "@/domain/admin/cycles";
import {
  archiveRequirement,
  createRequirement,
  requirementClaimFieldKey,
  updateRequirement,
} from "@/domain/admin/requirements";
import { upsertClaim } from "@/domain/admin/claims";
import * as schema from "@/db/schema";

describe("requirements admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let cycleId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    const schoolId = createSchool(db, {
      slug: "acme-u",
      name: "Acme University",
    }).id;
    const programId = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    }).id;
    cycleId = createCycle(db, { programId, cycleLabel: "2026-27" }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createRequirement inserts a row, auto-assigns sortOrder, and writes a create log row", () => {
    const first = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
    });
    const second = createRequirement(db, {
      cycleId,
      category: "test",
      label: "GRE required",
      valueBool: true,
    });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, second.id))
      .all();
    expect(logs.filter((l) => l.subjectTable === "requirements")).toHaveLength(
      1,
    );
  });

  it("updateRequirement changes the value and writes an update log row", () => {
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
    });

    const updated = updateRequirement(db, req.id, { valueNumber: 3.2 });
    expect(updated.valueNumber).toBe(3.2);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, req.id))
      .all();
    expect(
      logs.filter(
        (l) => l.subjectTable === "requirements" && l.action === "update",
      ),
    ).toHaveLength(1);
  });

  it("archiveRequirement sets status=archived and writes an archive log row", () => {
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
    });

    archiveRequirement(db, req.id);

    const [row] = db
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, req.id))
      .all();
    expect(row!.status).toBe("archived");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, req.id))
      .all();
    expect(
      logs.filter(
        (l) => l.subjectTable === "requirements" && l.action === "archive",
      ),
    ).toHaveLength(1);
  });

  it("requirementClaimFieldKey picks the non-null value column, text-first", () => {
    expect(
      requirementClaimFieldKey({
        valueText: "some text",
        valueNumber: null,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_text");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: 3.0,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_number");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: true,
        valueDate: null,
      }),
    ).toBe("value_bool");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: null,
        valueDate: "2026-11-01",
      }),
    ).toBe("value_date");
    // No value set yet (a requirement being drafted before its claim is
    // recorded) still needs a deterministic key to attach a claim to.
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_text");
  });

  it("updateRequirement demotes the verified claim backing a changed value column", () => {
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum GPA",
      valueNumber: 3.0,
    });
    const claim = upsertClaim(db, {
      subjectTable: "requirements",
      subjectId: req.id,
      fieldKey: "value_number",
      state: "known",
      sourceUrl: "https://acme.edu/admissions",
      sourceType: "program_site",
      verification: "verified",
    });

    updateRequirement(db, req.id, { label: "Min GPA", valueNumber: 3.0 });
    expect(
      db
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.id, claim.id))
        .all()[0]!.verification,
    ).toBe("verified");

    updateRequirement(db, req.id, { valueNumber: 3.2 });
    expect(
      db
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.id, claim.id))
        .all()[0]!.verification,
    ).toBe("needs_review");
    const claimLogs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.fieldKey, "value_number"))
      .all()
      .filter(
        (l) => l.subjectTable === "requirements" && l.action === "update",
      );
    expect(claimLogs).toHaveLength(1);
  });
});
