import fs from "node:fs";
import path from "node:path";
import { and, eq, gt, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import * as schema from "@/db/schema";
import { legacyCaptureSchema } from "../../scripts/legacy-import/schema";
import { buildImportPlan } from "../../scripts/legacy-import/transform";
import { runLegacyImport } from "../../scripts/legacy-import/apply";
import { leadCaptureSchema } from "../../scripts/lead-import/schema";
import {
  runLeadImport,
  type LeadImportMode,
} from "../../scripts/lead-import/apply";

const LEAD_FILE = "seed/leads/2026-10-06-perfusionprep.json";
const DIRECTORY_URL = "https://perfusionprep.com/schools";

function loadLegacyPlans() {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "seed/legacy/2025-26-aistudio.json"),
      "utf-8",
    ),
  );
  return buildImportPlan(legacyCaptureSchema.parse(raw).records);
}

function loadLeadCapture() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), LEAD_FILE), "utf-8"),
  );
  return leadCaptureSchema.parse(raw);
}

const COUNTED_TABLES = {
  schools: schema.schools,
  programs: schema.programs,
  application_cycles: schema.applicationCycles,
  requirements: schema.requirements,
  claims: schema.claims,
  sources: schema.sources,
  change_log: schema.changeLog,
  import_batches: schema.importBatches,
  import_conflicts: schema.importConflicts,
} as const;

function rowCounts(db: TestDb): Record<string, number> {
  return Object.fromEntries(
    Object.entries(COUNTED_TABLES).map(([name, table]) => [
      name,
      db.select().from(table).all().length,
    ]),
  );
}

function runLeads(db: TestDb, mode: LeadImportMode) {
  return runLeadImport(db, loadLeadCapture(), mode, LEAD_FILE, "test-hash");
}

function programByLegacyKey(db: TestDb, legacyKey: string) {
  const [program] = db
    .select()
    .from(schema.programs)
    .where(eq(schema.programs.legacyKey, legacyKey))
    .all();
  expect(program).toBeDefined();
  return program!;
}

function claimFor(
  db: TestDb,
  subjectTable: (typeof schema.claims.$inferSelect)["subjectTable"],
  subjectId: number,
  fieldKey: string,
) {
  const [claim] = db
    .select()
    .from(schema.claims)
    .where(
      and(
        eq(schema.claims.subjectTable, subjectTable),
        eq(schema.claims.subjectId, subjectId),
        eq(schema.claims.fieldKey, fieldKey),
      ),
    )
    .all();
  return claim;
}

function midwesternDeadlineClaim(db: TestDb) {
  const midwestern = programByLegacyKey(db, "Midwestern University");
  const [cycle] = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, midwestern.id),
        eq(schema.applicationCycles.cycleLabel, "2026-27"),
      ),
    )
    .all();
  const claim = claimFor(db, "application_cycles", cycle!.id, "deadline_date");
  expect(claim).toBeDefined();
  return claim!;
}

function changeCount(report: ReturnType<typeof runLeads>): number {
  return report.lines.filter((line) =>
    ["CREATE", "APPEND", "CONFLICT"].includes(line.action),
  ).length;
}

describe("perfusionprep.com lead import", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    runLegacyImport(db, loadLegacyPlans(), "apply");
  });

  afterEach(() => {
    ctx.close();
  });

  it("dry run reports 3 program CREATEs and writes nothing", () => {
    const before = rowCounts(db);

    const report = runLeads(db, "dry_run");

    const programCreates = report.lines.filter(
      (line) => line.action === "CREATE" && line.kind === "program",
    );
    expect(programCreates).toHaveLength(3);
    expect(rowCounts(db)).toEqual(before);
  });

  it("apply creates the 3 missing programs and records every value as a lead note", () => {
    const changeLogMaxBefore = db
      .select()
      .from(schema.changeLog)
      .all()
      .reduce((max, row) => Math.max(max, row.id), 0);
    const midwestern = programByLegacyKey(db, "Midwestern University");
    const credentialBefore = claimFor(
      db,
      "programs",
      midwestern.id,
      "credential",
    );
    expect(credentialBefore?.state).toBe("known");
    const schoolsBefore = db.select().from(schema.schools).all().length;

    runLeads(db, "apply");

    // Three new schools, with nothing beyond name/city/state set.
    const newSlugs = [
      "barry-university",
      "baylor-scott-white",
      "virginia-commonwealth-university-vcu",
    ];
    expect(db.select().from(schema.schools).all()).toHaveLength(
      schoolsBefore + 3,
    );
    const newSchools = db
      .select()
      .from(schema.schools)
      .where(inArray(schema.schools.slug, newSlugs))
      .all();
    expect(newSchools).toHaveLength(3);
    for (const school of newSchools) {
      expect(school.name).toBeTruthy();
      expect(school.city).toBeTruthy();
      expect(school.state).toMatch(/^[A-Z]{2}$/);
      expect(school.websiteUrl).toBeNull();

      const programs = db
        .select()
        .from(schema.programs)
        .where(eq(schema.programs.schoolId, school.id))
        .all();
      expect(programs).toHaveLength(1);
      const program = programs[0]!;
      expect(program.legacyKey).toBeNull();
      expect(program.websiteUrl).toBeNull();
      expect(program.latitude).toBeNull();
      expect(program.longitude).toBeNull();
      expect(program.directorName).toBeNull();
      expect(program.programLengthMonths).toBeNull();

      const [cycle] = db
        .select()
        .from(schema.applicationCycles)
        .where(eq(schema.applicationCycles.programId, program.id))
        .all();
      expect(cycle?.cycleLabel).toBe("2026-27");
      expect(cycle?.deadlineDate).toBeNull();
      expect(cycle?.deadlineType).toBe("unknown");

      const reqs = db
        .select()
        .from(schema.requirements)
        .where(eq(schema.requirements.cycleId, cycle!.id))
        .all();
      expect(reqs.map((r) => r.label).sort()).toEqual([
        "Minimum overall GPA",
        "Tuition (unit and residency tier not yet determined)",
      ]);
      for (const req of reqs) {
        expect(req.valueNumber).toBeNull();
        expect(req.valueText).toBeNull();
      }

      const nameClaim = claimFor(db, "schools", school.id, "name");
      expect(nameClaim?.state).toBe("unknown");
      expect(nameClaim?.note).toContain("perfusionprep.com/schools");
    }

    // Midwestern deadline: legacy hint kept, directory hint appended.
    const deadline = midwesternDeadlineClaim(db);
    expect(deadline.state).toBe("unknown");
    expect(deadline.note).toContain("legacy 2025-26 dashboard said");
    expect(deadline.note).toContain(
      'perfusionprep.com/schools (captured 2026-10-06): "Nov 1 (priority)"',
    );

    // Directors land only as claim notes, never in the value column.
    for (const [legacyKey, director] of [
      ["Quinnipiac University", "Tyler Wahl"],
      ["Cleveland Clinic", "Christopher Koehler, CCP"],
    ] as const) {
      const program = programByLegacyKey(db, legacyKey);
      expect(program.directorName).toBeNull();
      const claim = claimFor(db, "programs", program.id, "director_name");
      expect(claim?.state).toBe("unknown");
      expect(claim?.note).toContain(director);
    }

    // A known legacy claim is untouched.
    expect(claimFor(db, "programs", midwestern.id, "credential")).toEqual(
      credentialBefore,
    );

    // The directory source never backs a known or non-draft claim.
    const [source] = db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, DIRECTORY_URL))
      .all();
    expect(source).toBeDefined();
    expect(source!.sourceType).toBe("other");
    const directoryClaims = db
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.sourceId, source!.id))
      .all();
    expect(directoryClaims.length).toBeGreaterThan(0);
    for (const claim of directoryClaims) {
      expect(claim.state).not.toBe("known");
      expect(claim.verification).toBe("draft");
      expect(claim.locked).toBe(false);
      expect(claim.checkedAt).toBeNull();
    }

    // Every change_log row written belongs to the single new batch.
    const batches = db.select().from(schema.importBatches).all();
    expect(batches).toHaveLength(1);
    expect(batches[0]!.status).toBe("succeeded");
    expect(batches[0]!.mode).toBe("apply");
    expect(batches[0]!.finishedAt).not.toBeNull();
    const newChanges = db
      .select()
      .from(schema.changeLog)
      .where(gt(schema.changeLog.id, changeLogMaxBefore))
      .all();
    expect(newChanges.length).toBeGreaterThan(0);
    for (const row of newChanges) {
      expect(row.batchId).toBe(batches[0]!.id);
      expect(row.actor).toBeNull();
    }
  });

  it("a second apply reports zero changes and writes nothing", () => {
    runLeads(db, "apply");
    const before = rowCounts(db);

    const second = runLeads(db, "apply");

    expect(changeCount(second)).toBe(0);
    expect(second.sourceCreated).toBe(false);
    expect(rowCounts(db)).toEqual(before);
  });

  it("a verified claim gets one pending conflict and is never modified", () => {
    const original = midwesternDeadlineClaim(db);
    db.update(schema.claims)
      .set({ verification: "verified", checkedAt: new Date() })
      .where(eq(schema.claims.id, original.id))
      .run();
    const verified = midwesternDeadlineClaim(db);

    const first = runLeads(db, "apply");
    expect(
      first.lines.filter((line) => line.action === "CONFLICT"),
    ).toHaveLength(1);

    const conflictsFor = () =>
      db
        .select()
        .from(schema.importConflicts)
        .where(
          and(
            eq(schema.importConflicts.subjectTable, "application_cycles"),
            eq(schema.importConflicts.subjectId, verified.subjectId),
            eq(schema.importConflicts.fieldKey, "deadline_date"),
          ),
        )
        .all();

    const conflicts = conflictsFor();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.resolution).toBe("pending");
    expect(conflicts[0]!.proposedJson).toEqual({
      note: 'perfusionprep.com/schools (captured 2026-10-06): "Nov 1 (priority)"',
    });
    expect(midwesternDeadlineClaim(db)).toEqual(verified);

    const second = runLeads(db, "apply");
    expect(changeCount(second)).toBe(0);
    expect(conflictsFor()).toHaveLength(1);
    expect(midwesternDeadlineClaim(db)).toEqual(verified);
  });
});
