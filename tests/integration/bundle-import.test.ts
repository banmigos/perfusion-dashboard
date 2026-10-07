import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import * as schema from "@/db/schema";
import { parseBundle, type SchoolBundle } from "@/domain/import/bundle";
import { runBundleImport } from "../../scripts/bundle-import/apply";
import {
  exportAllSchools,
  exportSchool,
  writeBundles,
} from "../../scripts/bundle-import/export";

const FIXTURE = "tests/fixtures/bundles/example-university.json";

// Loosely typed on purpose: tests mutate the raw JSON before it is parsed.
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function loadFixture(mutate?: (raw: Raw) => void): SchoolBundle {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf-8"));
  mutate?.(raw);
  const parsed = parseBundle(raw);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

const COUNTED = {
  schools: schema.schools,
  programs: schema.programs,
  cycles: schema.applicationCycles,
  requirements: schema.requirements,
  prerequisites: schema.prerequisiteCourses,
  tuition: schema.tuitionEstimates,
  sources: schema.sources,
  claims: schema.claims,
  batches: schema.importBatches,
  conflicts: schema.importConflicts,
  changeLog: schema.changeLog,
};

function counts(db: TestDb) {
  return Object.fromEntries(
    Object.entries(COUNTED).map(([name, table]) => [
      name,
      db.select().from(table).all().length,
    ]),
  );
}

function importBundle(
  db: TestDb,
  bundle: SchoolBundle,
  mode: "dry_run" | "apply" = "apply",
) {
  return runBundleImport(db, bundle, mode, "fixture.json", "hash");
}

function deadlineClaim(db: TestDb) {
  const [cycle] = db.select().from(schema.applicationCycles).all();
  return db
    .select()
    .from(schema.claims)
    .where(
      and(
        eq(schema.claims.subjectTable, "application_cycles"),
        eq(schema.claims.subjectId, cycle!.id),
        eq(schema.claims.fieldKey, "deadline_date"),
      ),
    )
    .all()[0]!;
}

const loadWithoutCycles = () =>
  loadFixture((raw) => {
    raw.school.programs[0].cycles = [];
    raw.school.programs[0].tuition = [];
  });

/** A stray claim that collides with the one an import creates for the new cycle (id 1). */
function plantCollidingClaim(db: TestDb) {
  db.insert(schema.claims)
    .values({
      subjectTable: "application_cycles",
      subjectId: 1,
      fieldKey: "deadline_date",
      state: "unknown",
    })
    .run();
}

let ctx: ReturnType<typeof createTestDb>;
let db: TestDb;
beforeEach(() => {
  ctx = createTestDb();
  db = ctx.db;
});
afterEach(() => ctx.close());

describe("first import", () => {
  it("writes the whole tree, every claim as draft, in one batch", () => {
    const report = importBundle(db, loadFixture());
    expect(report.committed).toBe(true);

    const c = counts(db);
    expect(c).toMatchObject({
      schools: 1,
      programs: 1,
      cycles: 1,
      requirements: 1,
      prerequisites: 1,
      tuition: 1,
      batches: 1,
    });
    // program page, apply page, requirements page, tuition page
    expect(c.sources).toBe(4);

    const claims = db.select().from(schema.claims).all();
    expect(claims.length).toBeGreaterThan(8);
    expect(
      claims.every((cl) => cl.verification === "draft" && !cl.locked),
    ).toBe(true);
    expect(
      claims
        .filter((cl) => cl.state === "known")
        .every((cl) => cl.sourceId && cl.checkedAt),
    ).toBe(true);

    const [cycle] = db.select().from(schema.applicationCycles).all();
    expect(cycle).toMatchObject({
      cycleLabel: "2026-27",
      deadlineDate: "2026-11-01",
      deadlineTimeLocal: "17:00",
      deadlineTimezone: "America/New_York",
      casService: null,
    });
    const [tuition] = db.select().from(schema.tuitionEstimates).all();
    expect(tuition).toMatchObject({
      amountCents: 4200000,
      cycleId: cycle!.id,
      residency: "in_state",
    });

    const [batch] = db.select().from(schema.importBatches).all();
    expect(batch).toMatchObject({
      mode: "apply",
      status: "succeeded",
      sourceLabel: "fixture.json",
      fileHash: "hash",
    });
    expect(batch!.finishedAt).not.toBeNull();
  });

  it("writes a change_log row, linked to the batch, for every created row and claim", () => {
    importBundle(db, loadFixture());
    const log = db.select().from(schema.changeLog).all();
    const [batch] = db.select().from(schema.importBatches).all();
    expect(
      log.every((row) => row.batchId === batch!.id && row.action === "create"),
    ).toBe(true);

    const c = counts(db);
    const rowCount =
      c.schools! +
      c.programs! +
      c.cycles! +
      c.requirements! +
      c.prerequisites! +
      c.tuition!;
    expect(log.length).toBe(rowCount + c.claims!);
    expect(log.filter((r) => r.fieldKey !== null)).toHaveLength(c.claims!);
  });
});

describe("dry run", () => {
  it("computes the plan but leaves every table untouched", () => {
    const before = counts(db);
    const report = importBundle(db, loadFixture(), "dry_run");
    expect(report.committed).toBe(false);
    expect(report.summary.created).toBe(6);
    expect(counts(db)).toEqual(before);
  });

  it("exercises real constraints: a violation fails the dry run", () => {
    importBundle(db, loadWithoutCycles());
    plantCollidingClaim(db);
    expect(() => importBundle(db, loadFixture(), "dry_run")).toThrow(/UNIQUE/);
  });

  it("reports the same plan that apply then executes", () => {
    const dry = importBundle(db, loadFixture(), "dry_run");
    const applied = importBundle(db, loadFixture(), "apply");
    expect(applied.summary).toEqual(dry.summary);
  });
});

describe("idempotency — the Phase 6 gate", () => {
  it("importing the same bundle twice reports zero changes the second time", () => {
    const first = importBundle(db, loadFixture());
    expect(first.committed).toBe(true);
    const afterFirst = counts(db);

    const second = importBundle(db, loadFixture());
    expect(second.plan.ops).toEqual([]);
    expect(second.summary).toMatchObject({
      sourcesCreated: 0,
      created: 0,
      updated: 0,
      claimsCreated: 0,
      claimsUpdated: 0,
      conflicts: 0,
    });
    expect(second.committed).toBe(false);
    expect(second.batchId).toBeNull();
    expect(counts(db)).toEqual(afterFirst);
  });

  it("is also idempotent when the bundle is re-read from disk and re-parsed", () => {
    importBundle(db, loadFixture());
    const again = importBundle(db, loadFixture());
    expect(again.plan.ops).toEqual([]);
  });

  it("a dry run after an apply reports zero changes", () => {
    importBundle(db, loadFixture());
    expect(importBundle(db, loadFixture(), "dry_run").plan.ops).toEqual([]);
  });
});

describe("updates", () => {
  it("applies an unprotected change and logs before/after against the new batch", () => {
    importBundle(db, loadFixture());
    const changed = loadFixture((raw) => {
      const f = raw.school.programs[0].cycles[0].facts.deadline_date;
      f.value = "2026-10-15";
      f.citation.quote = "Applications are due October 15, 2026";
    });
    const report = importBundle(db, changed);
    expect(report.summary).toMatchObject({
      updated: 1,
      claimsUpdated: 1,
      conflicts: 0,
    });

    const [cycle] = db.select().from(schema.applicationCycles).all();
    expect(cycle!.deadlineDate).toBe("2026-10-15");
    expect(deadlineClaim(db).quote).toBe(
      "Applications are due October 15, 2026",
    );
    expect(deadlineClaim(db).verification).toBe("draft");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.batchId, report.batchId!))
      .all();
    expect(logs.map((l) => [l.subjectTable, l.action, l.fieldKey])).toEqual([
      ["application_cycles", "update", null],
      ["application_cycles", "update", "deadline_date"],
    ]);
    expect(logs[0]).toMatchObject({
      beforeJson: { deadline_date: "2026-11-01" },
      afterJson: { deadline_date: "2026-10-15" },
    });
    expect((logs[1]!.beforeJson as { quote: string }).quote).toMatch(
      /November 1/,
    );

    // and the change is itself idempotent
    expect(importBundle(db, changed).plan.ops).toEqual([]);
  });

  it("adds a new cycle under an existing program", () => {
    importBundle(db, loadFixture());
    const report = importBundle(
      db,
      loadFixture((raw) => {
        raw.school.programs[0].cycles.push({
          cycle_label: "2027-28",
          facts: { deadline_type: { state: "unknown" } },
        });
      }),
    );
    expect(report.summary.created).toBe(1);
    expect(counts(db).cycles).toBe(2);
    expect(
      importBundle(
        db,
        loadFixture((raw) => {
          raw.school.programs[0].cycles.push({
            cycle_label: "2027-28",
            facts: { deadline_type: { state: "unknown" } },
          });
        }),
      ).plan.ops,
    ).toEqual([]);
  });

  it("never touches personal tables", () => {
    importBundle(db, loadFixture());
    const [user] = db.select().from(schema.users).all();
    const [program] = db.select().from(schema.programs).all();
    db.insert(schema.savedPrograms)
      .values({ userId: user!.id, programId: program!.id, priority: "target" })
      .run();
    importBundle(
      db,
      loadFixture((raw) => {
        raw.school.programs[0].name = "Renamed";
      }),
    );
    expect(db.select().from(schema.savedPrograms).all()).toHaveLength(1);
  });
});

describe.each<[string, { verification?: "verified"; locked?: boolean }]>([
  ["verified", { verification: "verified" }],
  ["locked", { locked: true }],
])("conflict protection — %s claim", (reason, protect) => {
  const proposal = () =>
    loadFixture((raw) => {
      const f = raw.school.programs[0].cycles[0].facts.deadline_date;
      f.value = "2026-10-15";
      raw.school.name = "Example U"; // an unprotected change in the same run
    });

  beforeEach(() => {
    importBundle(db, loadFixture());
    db.update(schema.claims)
      .set(protect)
      .where(eq(schema.claims.id, deadlineClaim(db).id))
      .run();
  });

  it("leaves the protected value and claim alone", () => {
    const before = deadlineClaim(db);
    importBundle(db, proposal());
    const [cycle] = db.select().from(schema.applicationCycles).all();
    expect(cycle!.deadlineDate).toBe("2026-11-01");
    expect(deadlineClaim(db)).toEqual(before);
  });

  it("writes an import_conflicts row with current_json, proposed_json and a reason", () => {
    const report = importBundle(db, proposal());
    expect(report.summary.conflicts).toBe(1);
    const [conflict] = db.select().from(schema.importConflicts).all();
    expect(conflict).toMatchObject({
      batchId: report.batchId,
      subjectTable: "application_cycles",
      fieldKey: "deadline_date",
      resolution: "pending",
      reason: reason === "verified" ? "claim is verified" : "claim is locked",
    });
    expect(conflict!.currentJson).toMatchObject({
      value: "2026-11-01",
      verification: protect.verification ?? "draft",
      locked: protect.locked ?? false,
    });
    expect(conflict!.proposedJson).toMatchObject({
      value: "2026-10-15",
      state: "known",
    });
  });

  it("still applies the unprotected changes from the same run, with change_log", () => {
    const report = importBundle(db, proposal());
    const [school] = db.select().from(schema.schools).all();
    expect(school!.name).toBe("Example U");
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.batchId, report.batchId!))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      subjectTable: "schools",
      action: "update",
    });
  });

  it("is idempotent: re-running the same proposal adds no duplicate conflict", () => {
    importBundle(db, proposal());
    const before = counts(db);
    const again = importBundle(db, proposal());
    expect(again.plan.ops).toEqual([]);
    expect(again.committed).toBe(false);
    expect(counts(db)).toEqual(before);
  });

  it("records a fresh conflict for a different proposal", () => {
    importBundle(db, proposal());
    importBundle(
      db,
      loadFixture((raw) => {
        raw.school.programs[0].cycles[0].facts.deadline_date.value =
          "2026-12-01";
        raw.school.name = "Example U";
      }),
    );
    expect(db.select().from(schema.importConflicts).all()).toHaveLength(2);
  });
});

describe("atomicity", () => {
  it("rolls everything back when an apply fails part-way, and records the failure", () => {
    importBundle(db, loadWithoutCycles());
    plantCollidingClaim(db);
    const before = counts(db);

    expect(() => importBundle(db, loadFixture())).toThrow(/UNIQUE/);

    expect(counts(db)).toEqual({ ...before, batches: before.batches! + 1 });
    const failed = db
      .select()
      .from(schema.importBatches)
      .where(eq(schema.importBatches.status, "failed"))
      .all();
    expect(failed).toHaveLength(1);
    expect(counts(db).cycles).toBe(0);
  });
});

describe("export round trip", () => {
  it("exports exactly what was imported", () => {
    const original = loadFixture();
    importBundle(db, original);
    const exported = exportSchool(db, "example-university");
    expect(exported!.warnings).toEqual([]);
    expect(exported!.bundle).toEqual(original);
  });

  it("re-importing the export into the same database reports zero changes", () => {
    importBundle(db, loadFixture());
    const { bundle } = exportSchool(db, "example-university")!;
    expect(importBundle(db, bundle).plan.ops).toEqual([]);
  });

  it("an export imported into a fresh database reproduces it, idempotently", () => {
    importBundle(db, loadFixture());
    const { bundle } = exportSchool(db, "example-university")!;

    const other = createTestDb();
    try {
      expect(importBundle(other.db, bundle).committed).toBe(true);
      expect(counts(other.db)).toMatchObject({
        schools: 1,
        programs: 1,
        cycles: 1,
        requirements: 1,
        prerequisites: 1,
        tuition: 1,
      });
      expect(importBundle(other.db, bundle).plan.ops).toEqual([]);
      expect(exportSchool(other.db, "example-university")!.bundle).toEqual(
        bundle,
      );
    } finally {
      other.close();
    }
  });

  it("writes seed/schools-style files that the importer's own schema accepts", () => {
    importBundle(db, loadFixture());
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfusion-export-"));
    try {
      const files = writeBundles(exportAllSchools(db), dir);
      expect(files.map((f) => path.basename(f))).toEqual([
        "example-university.json",
      ]);
      const raw = JSON.parse(fs.readFileSync(files[0]!, "utf-8"));
      const parsed = parseBundle(raw);
      expect(parsed.success).toBe(true);
      expect(importBundle(db, parsed.data!).plan.ops).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omits archived rows and warns about values that have no claim", () => {
    importBundle(db, loadFixture());
    const [program] = db.select().from(schema.programs).all();
    db.update(schema.programs)
      .set({ classSize: 24 })
      .where(eq(schema.programs.id, program!.id))
      .run();
    const exported = exportSchool(db, "example-university")!;
    expect(exported.warnings.join()).toMatch(/class_size/);

    db.update(schema.programs)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.programs.id, program!.id))
      .run();
    expect(
      exportSchool(db, "example-university")!.bundle.school.programs,
    ).toBeUndefined();
  });

  it("export is read-only", () => {
    importBundle(db, loadFixture());
    const before = counts(db);
    exportAllSchools(db);
    expect(counts(db)).toEqual(before);
  });
});

describe("archived rows", () => {
  it("does not resurrect or modify an archived program", () => {
    importBundle(db, loadFixture());
    const [program] = db.select().from(schema.programs).all();
    db.update(schema.programs)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.programs.id, program!.id))
      .run();
    const report = importBundle(
      db,
      loadFixture((raw) => {
        raw.school.programs[0].cycles[0].facts.deadline_date.value =
          "2026-10-15";
      }),
    );
    expect(report.committed).toBe(false);
    expect(report.summary.archivedSkipped).toBe(1);
    const [cycle] = db.select().from(schema.applicationCycles).all();
    expect(cycle!.deadlineDate).toBe("2026-11-01");
  });
});
