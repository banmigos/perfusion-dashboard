import { inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { ProgramImportPlan } from "./transform";

export type ImportMode = "dry_run" | "apply";

export interface ImportReportLine {
  action: "CREATE" | "SKIP";
  kind: "program";
  label: string;
}

export interface ImportReport {
  lines: ImportReportLine[];
  created: {
    schools: number;
    programs: number;
    sources: number;
    requirements: number;
    prerequisites: number;
    claims: number;
  };
  skipped: number;
}

class DryRunRollback extends Error {}

const REQUIREMENT_VALUE_FIELD: Record<string, string> = {
  gpa: "value_number",
  test: "value_bool",
  other: "value_number",
  shadowing: "value_text",
};

/**
 * Idempotent by `programs.legacy_key`: a program that already exists is
 * skipped entirely, never updated. This means a transform bug found after
 * a real `--apply` run cannot be corrected by fixing the transform and
 * re-running — the already-imported row is silently skipped either way.
 * Recovery requires deleting the affected program's rows (or the whole
 * database, since this is a one-time migration script) and re-applying.
 */
export function runLegacyImport(
  db: BetterSQLite3Database<typeof schema>,
  plans: ProgramImportPlan[],
  mode: ImportMode,
): ImportReport {
  const existingKeys = new Set(
    db
      .select({ legacyKey: schema.programs.legacyKey })
      .from(schema.programs)
      .where(
        inArray(
          schema.programs.legacyKey,
          plans.map((p) => p.legacyKey),
        ),
      )
      .all()
      .map((row) => row.legacyKey),
  );

  const report: ImportReport = {
    lines: [],
    created: {
      schools: 0,
      programs: 0,
      sources: 0,
      requirements: 0,
      prerequisites: 0,
      claims: 0,
    },
    skipped: 0,
  };

  const applyAll = (tx: BetterSQLite3Database<typeof schema>): void => {
    for (const plan of plans) {
      if (existingKeys.has(plan.legacyKey)) {
        report.lines.push({
          action: "SKIP",
          kind: "program",
          label: `${plan.school.slug}/${plan.program.slug} (legacy_key="${plan.legacyKey}")`,
        });
        report.skipped += 1;
        continue;
      }

      const [school] = tx
        .insert(schema.schools)
        .values({
          slug: plan.school.slug,
          name: plan.school.name,
          city: plan.school.city,
          state: plan.school.state,
        })
        .returning()
        .all();
      report.created.schools += 1;

      const [program] = tx
        .insert(schema.programs)
        .values({
          schoolId: school!.id,
          slug: plan.program.slug,
          name: plan.program.name,
          legacyKey: plan.legacyKey,
          credential: plan.program.credential,
          websiteUrl: plan.program.websiteUrl,
          latitude: plan.program.latitude,
          longitude: plan.program.longitude,
        })
        .returning()
        .all();
      report.created.programs += 1;

      const [cycle] = tx
        .insert(schema.applicationCycles)
        .values({
          programId: program!.id,
          cycleLabel: plan.cycle.cycleLabel,
          entryYear: plan.cycle.entryYear,
          deadlineType: plan.cycle.deadlineType,
        })
        .returning()
        .all();

      const [source] = tx
        .insert(schema.sources)
        .values({
          url: plan.source.url,
          sourceType: "program_site",
          notes: plan.source.notes,
        })
        .returning()
        .all();
      report.created.sources += 1;

      for (const kc of plan.knownClaims) {
        const subjectTable = kc.subject === "school" ? "schools" : "programs";
        const subjectId = kc.subject === "school" ? school!.id : program!.id;
        tx.insert(schema.claims)
          .values({
            subjectTable,
            subjectId,
            fieldKey: kc.fieldKey,
            state: "known",
            sourceId: source!.id,
          })
          .run();
        report.created.claims += 1;
      }

      for (const req of plan.requirements) {
        const [reqRow] = tx
          .insert(schema.requirements)
          .values({
            cycleId: cycle!.id,
            category: req.category,
            label: req.label,
            unit: req.unit,
          })
          .returning()
          .all();
        report.created.requirements += 1;

        tx.insert(schema.claims)
          .values({
            subjectTable: "requirements",
            subjectId: reqRow!.id,
            fieldKey: REQUIREMENT_VALUE_FIELD[req.category]!,
            state: "unknown",
            sourceId: source!.id,
            note: req.claimNote,
          })
          .run();
        report.created.claims += 1;
      }

      plan.prerequisites.forEach((subject, index) => {
        tx.insert(schema.prerequisiteCourses)
          .values({
            cycleId: cycle!.id,
            subject,
            notes:
              "Unstructured legacy prerequisite name — needs credits/lab/min-grade/recency research (docs/research-workflow.md §8).",
            sortOrder: index,
          })
          .run();
        report.created.prerequisites += 1;
      });

      for (const uc of plan.unknownClaims) {
        const subjectTable =
          uc.subject === "cycle" ? "application_cycles" : "programs";
        const subjectId = uc.subject === "cycle" ? cycle!.id : program!.id;
        tx.insert(schema.claims)
          .values({
            subjectTable,
            subjectId,
            fieldKey: uc.fieldKey,
            state: "unknown",
            sourceId: source!.id,
            note: uc.note,
          })
          .run();
        report.created.claims += 1;
      }

      report.lines.push({
        action: "CREATE",
        kind: "program",
        label: `${plan.school.slug}/${plan.program.slug} (legacy_key="${plan.legacyKey}")`,
      });
    }

    if (mode === "dry_run") {
      throw new DryRunRollback();
    }
  };

  try {
    db.transaction(applyAll);
  } catch (error) {
    if (!(error instanceof DryRunRollback)) {
      throw error;
    }
  }

  return report;
}
