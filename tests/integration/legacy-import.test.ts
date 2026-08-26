import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import * as schema from "@/db/schema";
import { legacyCaptureSchema } from "../../scripts/legacy-import/schema";
import { buildImportPlan } from "../../scripts/legacy-import/transform";
import { runLegacyImport } from "../../scripts/legacy-import/apply";

function loadPlans() {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "seed/legacy/2025-26-aistudio.json"),
      "utf-8",
    ),
  );
  const capture = legacyCaptureSchema.parse(raw);
  return buildImportPlan(capture.records);
}

describe("legacy triage import", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("dry run creates nothing", () => {
    const plans = loadPlans();
    const report = runLegacyImport(db, plans, "dry_run");

    expect(report.created.programs).toBe(23);
    expect(report.skipped).toBe(0);

    const programs = db.select().from(schema.programs).all();
    expect(programs).toHaveLength(0);
  });

  it("apply creates exactly 23 programs and zero verified claims", () => {
    const plans = loadPlans();
    const report = runLegacyImport(db, plans, "apply");

    expect(report.created.programs).toBe(23);
    expect(report.created.schools).toBe(23);
    expect(report.skipped).toBe(0);

    const programs = db.select().from(schema.programs).all();
    expect(programs).toHaveLength(23);

    const verifiedClaims = db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.verification, "verified"))
      .all();
    expect(verifiedClaims).toHaveLength(0);
  });

  it("running apply twice reports zero new changes the second time", () => {
    const plans = loadPlans();
    runLegacyImport(db, plans, "apply");

    const secondReport = runLegacyImport(db, plans, "apply");
    expect(secondReport.created.programs).toBe(0);
    expect(secondReport.skipped).toBe(23);

    const programs = db.select().from(schema.programs).all();
    expect(programs).toHaveLength(23);
  });

  it("University of Utah gets deadline_type='rolling'", () => {
    runLegacyImport(db, loadPlans(), "apply");

    const [utah] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.legacyKey, "University of Utah"))
      .all();
    expect(utah).toBeDefined();

    const [cycle] = db
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.programId, utah!.id))
      .all();
    expect(cycle?.deadlineType).toBe("rolling");
  });

  it("Vanderbilt gets a closure claim and a shadowing requirement", () => {
    runLegacyImport(db, loadPlans(), "apply");

    const [vandy] = db
      .select()
      .from(schema.programs)
      .where(
        eq(schema.programs.legacyKey, "Vanderbilt University Medical Center"),
      )
      .all();
    expect(vandy).toBeDefined();

    const [cycle] = db
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.programId, vandy!.id))
      .all();

    const closureClaim = db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.subjectTable, "application_cycles"),
          eq(schema.claims.subjectId, cycle!.id),
          eq(schema.claims.fieldKey, "closure_status"),
        ),
      )
      .all();
    expect(closureClaim).toHaveLength(1);
    expect(closureClaim[0]?.note).toMatch(/CLOSED/);

    const shadowing = db
      .select()
      .from(schema.requirements)
      .where(
        and(
          eq(schema.requirements.cycleId, cycle!.id),
          eq(schema.requirements.category, "shadowing"),
        ),
      )
      .all();
    expect(shadowing).toHaveLength(1);
  });

  it("Baylor gets a duplicate_check claim referencing Texas Heart Institute", () => {
    runLegacyImport(db, loadPlans(), "apply");

    const [baylor] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.legacyKey, "Baylor College of Medicine"))
      .all();
    expect(baylor).toBeDefined();

    const dupClaim = db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.subjectTable, "programs"),
          eq(schema.claims.subjectId, baylor!.id),
          eq(schema.claims.fieldKey, "duplicate_check"),
        ),
      )
      .all();
    expect(dupClaim).toHaveLength(1);
    expect(dupClaim[0]?.note).toMatch(/Texas Heart Institute/);

    const [texasHeart] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.legacyKey, "Texas Heart Institute"))
      .all();
    expect(texasHeart).toBeDefined();
    expect(texasHeart!.id).not.toBe(baylor!.id);
  });

  it("no tuition_estimates rows are created; the tuition figure lands as a requirements(category='other') hint instead", () => {
    runLegacyImport(db, loadPlans(), "apply");

    const tuitionRows = db.select().from(schema.tuitionEstimates).all();
    expect(tuitionRows).toHaveLength(0);

    const [midwestern] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.legacyKey, "Midwestern University"))
      .all();
    const [cycle] = db
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.programId, midwestern!.id))
      .all();
    const tuitionReq = db
      .select()
      .from(schema.requirements)
      .where(
        and(
          eq(schema.requirements.cycleId, cycle!.id),
          eq(schema.requirements.category, "other"),
        ),
      )
      .all();
    expect(tuitionReq).toHaveLength(1);
    expect(tuitionReq[0]?.valueNumber).toBeNull();
  });
});
