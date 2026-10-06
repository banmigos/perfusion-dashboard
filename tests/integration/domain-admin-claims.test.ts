// tests/integration/domain-admin-claims.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  listClaimsForSubject,
  setClaimVerification,
  upsertClaim,
} from "@/domain/admin/claims";
import * as schema from "@/db/schema";

describe("claims admin", () => {
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

  it("upsertClaim creates a claim, finds-or-creates its source, and writes one create change_log row keyed to the subject and field", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      quote: "Acme University",
      checkedAt: new Date("2026-08-01"),
    });

    expect(claim.state).toBe("known");
    expect(claim.sourceId).not.toBeNull();

    const [source] = db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, "https://acme.edu/about"))
      .all();
    expect(source!.id).toBe(claim.sourceId);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(
        and(
          eq(schema.changeLog.subjectTable, "schools"),
          eq(schema.changeLog.subjectId, schoolId),
          eq(schema.changeLog.fieldKey, "name"),
        ),
      )
      .all();
    expect(logs.filter((l) => l.action === "create")).toHaveLength(1);
  });

  it("upsertClaim on an existing (subjectTable, subjectId, fieldKey) updates in place rather than duplicating", () => {
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "unknown",
      checkedAt: new Date(),
    });

    const rows = db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.subjectTable, "schools"),
          eq(schema.claims.subjectId, schoolId),
          eq(schema.claims.fieldKey, "name"),
        ),
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("unknown");
  });

  it("upsertClaim auto-sets checkedAt when verification moves off draft without one, satisfying the DB check constraint", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "unknown",
      verification: "needs_review",
    });
    expect(claim.checkedAt).not.toBeNull();
  });

  it("upsertClaim rejects a known claim with no source URL and writes nothing", () => {
    const before = db.select().from(schema.changeLog).all().length;
    expect(() =>
      upsertClaim(db, {
        subjectTable: "schools",
        subjectId: schoolId,
        fieldKey: "city",
        state: "known",
      }),
    ).toThrow(/source/);
    expect(db.select().from(schema.claims).all()).toHaveLength(0);
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before);
  });

  it("setClaimVerification moves a claim to verified and writes a verify change_log row", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });

    const verified = setClaimVerification(db, claim.id, "verified");
    expect(verified.verification).toBe("verified");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, schoolId))
      .all();
    expect(logs.filter((l) => l.action === "verify")).toHaveLength(1);
  });

  it("listClaimsForSubject returns claims for one subject joined with their source", () => {
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });

    const claims = listClaimsForSubject(db, "schools", schoolId);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.source?.url).toBe("https://acme.edu/about");
  });

  // This is the phase's stated gate: every canonical write produces a
  // change_log row. Schools/programs/cycles/requirements are covered in
  // their own task's tests; this asserts the pattern holds for the claims
  // write path too, and counts total rows end-to-end for one subject.
  it("every claim mutation on a subject produces exactly one new change_log row", () => {
    const before = db.select().from(schema.changeLog).all().length;

    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "state",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 1);

    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "state",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
      note: "re-confirmed",
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 2);

    setClaimVerification(db, claim.id, "verified");
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 3);
  });
});
