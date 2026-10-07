import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  archiveSchool,
  createSchool,
  updateSchool,
} from "@/domain/admin/schools";
import { upsertClaim } from "@/domain/admin/claims";
import * as schema from "@/db/schema";

describe("schools admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createSchool inserts a row and writes one create change_log row", () => {
    const school = createSchool(db, {
      slug: "acme-u",
      name: "Acme University",
    });

    expect(school.id).toBeGreaterThan(0);
    expect(school.status).toBe("draft");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe("create");
    expect(logs[0]!.subjectTable).toBe("schools");
    expect(logs[0]!.beforeJson).toBeNull();
    expect((logs[0]!.afterJson as { slug: string }).slug).toBe("acme-u");
  });

  it("updateSchool patches fields and writes one update change_log row with before/after", () => {
    const school = createSchool(db, {
      slug: "acme-u",
      name: "Acme University",
    });

    const updated = updateSchool(db, school.id, { city: "Springfield" });

    expect(updated.city).toBe("Springfield");
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs).toHaveLength(2); // create + update
    const updateLog = logs.find((l) => l.action === "update")!;
    expect((updateLog.beforeJson as { city: string | null }).city).toBeNull();
    expect((updateLog.afterJson as { city: string | null }).city).toBe(
      "Springfield",
    );
  });

  it("archiveSchool sets status=archived and archived_at, and writes one archive log row", () => {
    const school = createSchool(db, {
      slug: "acme-u",
      name: "Acme University",
    });

    archiveSchool(db, school.id);

    const [row] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, school.id))
      .all();
    expect(row!.status).toBe("archived");
    expect(row!.archivedAt).not.toBeNull();

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs.filter((l) => l.action === "archive")).toHaveLength(1);
  });

  it("updateSchool throws for an unknown id", () => {
    expect(() => updateSchool(db, 99999, { city: "Nowhere" })).toThrow();
  });

  it("updateSchool demotes a verified website_url claim when the URL changes", () => {
    const school = createSchool(db, {
      slug: "demo-u",
      name: "Demo University",
      websiteUrl: "https://demo.edu",
    });
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: school.id,
      fieldKey: "website_url",
      state: "known",
      sourceUrl: "https://demo.edu",
      sourceType: "program_site",
      verification: "verified",
    });

    updateSchool(db, school.id, { websiteUrl: "https://www.demo.edu" });

    const [after] = db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claim.id))
      .all();
    expect(after!.verification).toBe("needs_review");
  });
});
