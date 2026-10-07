// tests/integration/domain-admin-claims.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  listClaimsForSubject,
  setClaimVerification,
  standardClaimFieldKeys,
  upsertClaim,
} from "@/domain/admin/claims";
import { listVerifyQueue } from "@/domain/verify";
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

  it("upsertClaim keeps an omitted note on update and clears it only for an explicit null", () => {
    const base = {
      subjectTable: "schools" as const,
      subjectId: schoolId,
      fieldKey: "city",
      state: "unknown" as const,
    };
    upsertClaim(db, { ...base, note: "legacy: Boston" });

    expect(upsertClaim(db, base).note).toBe("legacy: Boston");
    expect(upsertClaim(db, { ...base, note: null }).note).toBeNull();
  });

  it("upsertClaim keeps the existing source and quote when they are omitted", () => {
    const base = {
      subjectTable: "schools" as const,
      subjectId: schoolId,
      fieldKey: "city",
      state: "known" as const,
    };
    const first = upsertClaim(db, {
      ...base,
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      quote: "Boston, MA",
    });
    const second = upsertClaim(db, { ...base, note: "x" });
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.quote).toBe("Boston, MA");

    expect(() => upsertClaim(db, { ...base, sourceUrl: null })).toThrow(
      /source/,
    );
  });

  it("upsertClaim resets verification to draft when state/source/quote change without an explicit verification, and keeps it otherwise", () => {
    const base = {
      subjectTable: "schools" as const,
      subjectId: schoolId,
      fieldKey: "city",
      state: "known" as const,
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site" as const,
      quote: "Boston",
      checkedAt: new Date(),
    };
    const claim = upsertClaim(db, base);
    setClaimVerification(db, claim.id, "verified");

    expect(upsertClaim(db, { ...base, note: "n" }).verification).toBe(
      "verified",
    );
    expect(upsertClaim(db, { ...base, quote: "Cambridge" }).verification).toBe(
      "draft",
    );

    setClaimVerification(db, claim.id, "verified");
    expect(
      upsertClaim(db, { ...base, quote: "Cambridge", verification: "verified" })
        .verification,
    ).toBe("verified");
  });

  it("setClaimVerification auto-sets checkedAt when missing and supports needs_review", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "unknown",
    });
    expect(claim.checkedAt).toBeNull();

    const after = setClaimVerification(db, claim.id, "needs_review");
    expect(after.verification).toBe("needs_review");
    expect(after.checkedAt).not.toBeNull();
  });

  it("setClaimVerification re-stamps checkedAt when re-verifying a stale claim so it leaves the verify queue", () => {
    const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: longAgo,
      verification: "verified",
    });
    expect(listVerifyQueue(db).map((i) => i.claim.id)).toContain(claim.id);

    const after = setClaimVerification(db, claim.id, "verified");
    expect(after.checkedAt!.getTime()).toBeGreaterThan(longAgo.getTime());
    expect(listVerifyQueue(db).map((i) => i.claim.id)).not.toContain(claim.id);
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

  it("upsertClaim with no state keeps the existing state (adding a note never promotes unknown to known)", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "unknown",
      sourceUrl: "https://directory.example/acme",
      sourceType: "other",
      verification: "verified",
    });

    const after = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      note: "called admissions, no answer",
    });
    expect(after.id).toBe(claim.id);
    expect(after.state).toBe("unknown");
    expect(after.note).toBe("called admissions, no answer");
    // Not a content change (state/source/quote kept), so not reset to draft.
    expect(after.verification).toBe("verified");
  });

  it("upsertClaim refuses to create a new claim without a state", () => {
    expect(() =>
      upsertClaim(db, {
        subjectTable: "schools",
        subjectId: schoolId,
        fieldKey: "city",
        note: "x",
      }),
    ).toThrow(/new claim requires a state/);
    expect(db.select().from(schema.claims).all()).toHaveLength(0);
  });

  it("standardClaimFieldKeys lists a subject's fact columns as snake_case keys", () => {
    const programKeys = standardClaimFieldKeys("programs");
    expect(programKeys).toContain("credential");
    expect(programKeys).toContain("program_length_months");
    expect(programKeys).not.toContain("slug");
    expect(programKeys).not.toContain("latitude");
    expect(programKeys).not.toContain("school_id");
    expect(standardClaimFieldKeys("requirements")).toEqual([
      "value_text",
      "value_number",
      "value_bool",
      "value_date",
    ]);
  });
});
