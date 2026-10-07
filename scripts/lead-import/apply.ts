import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { CHANGE_LOG_ACTIONS } from "@/db/schema/audit";
import type { SUBJECT_TABLES } from "@/db/schema/provenance";
import { slugify } from "@/lib/slug";
import { parseCityState } from "../legacy-import/transform";
import type { LeadCapture, LeadRecord } from "./schema";

/**
 * One-off importer for an aggregator directory captured as a lead bundle
 * (docs/research-workflow.md §1.5, "aggregators are leads, not sources").
 *
 * It may create rows for programs we lack and attach directory values as
 * notes on `unknown` claims. It never sets a value column from the
 * directory, never creates a `known` claim, never sets verification other
 * than `draft`, and never touches a verified or locked claim (it records an
 * `import_conflicts` row instead).
 *
 * `src/domain/**` is server-only and cannot be imported from a tsx script,
 * so change_log / import_batches / import_conflicts rows are written inline
 * here, with `batchId` linking every change to this run.
 */

type Db = BetterSQLite3Database<typeof schema>;
type SubjectTable = (typeof SUBJECT_TABLES)[number];
type ChangeLogAction = (typeof CHANGE_LOG_ACTIONS)[number];
type Claim = typeof schema.claims.$inferSelect;

export type LeadImportMode = "dry_run" | "apply";
export type LeadAction =
  "CREATE" | "APPEND" | "CONFLICT" | "UNCHANGED" | "KEEP";

export interface LeadReportLine {
  action: LeadAction;
  kind: "source" | "school" | "program" | "cycle" | "requirement" | "claim";
  label: string;
}

export interface LeadImportReport {
  lines: LeadReportLine[];
  counts: Record<LeadAction, number>;
  sourceCreated: boolean;
  /** True only when an apply committed; dry runs and no-op applies roll back. */
  committed: boolean;
}

const CYCLE_LABEL = "2026-27";
const CYCLE_ENTRY_YEAR = 2027;
const GPA_LABEL = "Minimum overall GPA";
const TUITION_LABEL = "Tuition (unit and residency tier not yet determined)";
const CONFLICT_REASON = "lead import: claim is verified or locked";
const MISSING_LEGACY_HINT = "run npm run import:legacy -- --apply first";

class Rollback extends Error {}

interface LeadItem {
  subjectTable: SubjectTable;
  subjectId: number;
  fieldKey: string;
  value: string | null;
  /** The tuition cell also uses "verify" as a no-value marker. */
  isTuition?: boolean;
}

interface ResolvedTarget {
  label: string;
  schoolId: number;
  programId: number;
  cycleId: number;
  gpaRequirementId: number;
  tuitionRequirementId: number;
}

function isLeadValue(item: LeadItem): item is LeadItem & { value: string } {
  const { value } = item;
  if (value === null || value === "" || value === "—") return false;
  if (item.isTuition && value === "verify") return false;
  return true;
}

export function runLeadImport(
  db: Db,
  capture: LeadCapture,
  mode: LeadImportMode,
  sourceLabel: string,
  fileHash: string,
): LeadImportReport {
  const report: LeadImportReport = {
    lines: [],
    counts: { CREATE: 0, APPEND: 0, CONFLICT: 0, UNCHANGED: 0, KEEP: 0 },
    sourceCreated: false,
    committed: false,
  };
  const leadLine = (value: string) =>
    `perfusionprep.com/schools (captured ${capture.captured_at}): "${value}"`;
  const push = (line: LeadReportLine) => {
    report.lines.push(line);
    report.counts[line.action] += 1;
  };

  const run = (tx: Db): void => {
    const [batch] = tx
      .insert(schema.importBatches)
      .values({ mode, sourceLabel, fileHash, status: "running" })
      .returning()
      .all();
    const batchId = batch!.id;

    const logChange = (input: {
      action: ChangeLogAction;
      subjectTable: SubjectTable;
      subjectId: number;
      fieldKey?: string;
      before: unknown;
      after: unknown;
    }) => {
      tx.insert(schema.changeLog)
        .values({
          actor: null,
          action: input.action,
          subjectTable: input.subjectTable,
          subjectId: input.subjectId,
          fieldKey: input.fieldKey ?? null,
          beforeJson: input.before ?? null,
          afterJson: input.after ?? null,
          batchId,
        })
        .run();
    };

    // --- Source (reference metadata: no change_log row, by design) ---
    let [source] = tx
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, capture.origin.url))
      .all();
    if (!source) {
      [source] = tx
        .insert(schema.sources)
        .values({
          url: capture.origin.url,
          sourceType: "other",
          title: capture.origin.title,
          publisher: capture.origin.publisher,
          fetchedAt: new Date(`${capture.captured_at}T00:00:00Z`),
          notes: `Aggregator directory — lead only, not an official source (docs/research-workflow.md §1.5). Captured ${capture.captured_at}.`,
        })
        .returning()
        .all();
      report.sourceCreated = true;
      push({ action: "CREATE", kind: "source", label: capture.origin.url });
    }
    const sourceId = source!.id;

    // --- Canonical helpers (each insert writes one change_log row) ---
    const findOrCreateRequirement = (
      cycleId: number,
      label: string,
      category: "gpa" | "other",
      unit: string | null,
      reportLabel: string,
    ): number => {
      const [existing] = tx
        .select()
        .from(schema.requirements)
        .where(
          and(
            eq(schema.requirements.cycleId, cycleId),
            eq(schema.requirements.label, label),
          ),
        )
        .all();
      if (existing) return existing.id;
      const [row] = tx
        .insert(schema.requirements)
        .values({ cycleId, category, label, unit })
        .returning()
        .all();
      logChange({
        action: "create",
        subjectTable: "requirements",
        subjectId: row!.id,
        before: null,
        after: row,
      });
      push({
        action: "CREATE",
        kind: "requirement",
        label: `${reportLabel} "${label}"`,
      });
      return row!.id;
    };

    const findCycle = (programId: number) =>
      tx
        .select()
        .from(schema.applicationCycles)
        .where(
          and(
            eq(schema.applicationCycles.programId, programId),
            eq(schema.applicationCycles.cycleLabel, CYCLE_LABEL),
          ),
        )
        .all()[0];

    const withRequirements = (
      label: string,
      schoolId: number,
      programId: number,
      cycleId: number,
    ): ResolvedTarget => ({
      label,
      schoolId,
      programId,
      cycleId,
      gpaRequirementId: findOrCreateRequirement(
        cycleId,
        GPA_LABEL,
        "gpa",
        "gpa",
        label,
      ),
      tuitionRequirementId: findOrCreateRequirement(
        cycleId,
        TUITION_LABEL,
        "other",
        null,
        label,
      ),
    });

    const resolveLegacyTarget = (legacyKey: string): ResolvedTarget => {
      const [program] = tx
        .select()
        .from(schema.programs)
        .where(eq(schema.programs.legacyKey, legacyKey))
        .all();
      if (!program) {
        throw new Error(
          `No program with legacy_key "${legacyKey}" — ${MISSING_LEGACY_HINT}`,
        );
      }
      const cycle = findCycle(program.id);
      if (!cycle) {
        throw new Error(
          `No ${CYCLE_LABEL} cycle for legacy_key "${legacyKey}" — ${MISSING_LEGACY_HINT}`,
        );
      }
      const [school] = tx
        .select()
        .from(schema.schools)
        .where(eq(schema.schools.id, program.schoolId))
        .all();
      return withRequirements(
        `${school!.slug}/${program.slug}`,
        program.schoolId,
        program.id,
        cycle.id,
      );
    };

    const resolveCreateTarget = (
      record: LeadRecord,
      credential: NonNullable<
        (typeof schema.programs.$inferInsert)["credential"]
      >,
    ): ResolvedTarget => {
      const schoolSlug = slugify(record.raw.name);
      const programSlug = `perfusion-${credential.toLowerCase()}`;
      const label = `${schoolSlug}/${programSlug}`;

      const [existingSchool] = tx
        .select()
        .from(schema.schools)
        .where(eq(schema.schools.slug, schoolSlug))
        .all();
      if (existingSchool) {
        const [program] = tx
          .select()
          .from(schema.programs)
          .where(
            and(
              eq(schema.programs.schoolId, existingSchool.id),
              eq(schema.programs.slug, programSlug),
            ),
          )
          .all();
        if (!program) {
          throw new Error(
            `School "${schoolSlug}" exists but has no program "${programSlug}"`,
          );
        }
        const cycle = findCycle(program.id);
        if (!cycle) {
          throw new Error(`No ${CYCLE_LABEL} cycle for "${label}"`);
        }
        return withRequirements(label, existingSchool.id, program.id, cycle.id);
      }

      const { city, state } = parseCityState(record.raw.location);
      const [school] = tx
        .insert(schema.schools)
        .values({
          slug: schoolSlug,
          name: record.raw.name,
          city,
          state,
          websiteUrl: null,
        })
        .returning()
        .all();
      logChange({
        action: "create",
        subjectTable: "schools",
        subjectId: school!.id,
        before: null,
        after: school,
      });
      push({ action: "CREATE", kind: "school", label: schoolSlug });

      const [program] = tx
        .insert(schema.programs)
        .values({
          schoolId: school!.id,
          slug: programSlug,
          name: `${credential} in Cardiovascular Perfusion`,
          credential,
          legacyKey: null,
          websiteUrl: null,
          latitude: null,
          longitude: null,
        })
        .returning()
        .all();
      logChange({
        action: "create",
        subjectTable: "programs",
        subjectId: program!.id,
        before: null,
        after: program,
      });
      push({ action: "CREATE", kind: "program", label });

      const [cycle] = tx
        .insert(schema.applicationCycles)
        .values({
          programId: program!.id,
          cycleLabel: CYCLE_LABEL,
          entryYear: CYCLE_ENTRY_YEAR,
          deadlineType: "unknown",
        })
        .returning()
        .all();
      logChange({
        action: "create",
        subjectTable: "application_cycles",
        subjectId: cycle!.id,
        before: null,
        after: cycle,
      });
      push({
        action: "CREATE",
        kind: "cycle",
        label: `${label} ${CYCLE_LABEL}`,
      });

      return withRequirements(label, school!.id, program!.id, cycle!.id);
    };

    // --- Claim rule (brief Rule 4) ---
    const recordConflict = (
      claim: Claim,
      line: string,
      reportLabel: string,
    ) => {
      const proposed = { note: line };
      const alreadyPending = tx
        .select()
        .from(schema.importConflicts)
        .where(
          and(
            eq(schema.importConflicts.subjectTable, claim.subjectTable),
            eq(schema.importConflicts.subjectId, claim.subjectId),
            eq(schema.importConflicts.fieldKey, claim.fieldKey),
            eq(schema.importConflicts.resolution, "pending"),
          ),
        )
        .all()
        .some(
          (conflict) =>
            JSON.stringify(conflict.proposedJson) === JSON.stringify(proposed),
        );
      if (alreadyPending) {
        push({ action: "UNCHANGED", kind: "claim", label: reportLabel });
        return;
      }
      tx.insert(schema.importConflicts)
        .values({
          batchId,
          subjectTable: claim.subjectTable,
          subjectId: claim.subjectId,
          fieldKey: claim.fieldKey,
          currentJson: claim,
          proposedJson: proposed,
          reason: CONFLICT_REASON,
          resolution: "pending",
        })
        .run();
      push({ action: "CONFLICT", kind: "claim", label: reportLabel });
    };

    const applyLeadItem = (
      item: LeadItem & { value: string },
      label: string,
    ) => {
      const line = leadLine(item.value);
      const reportLabel = `${label} ${item.subjectTable}#${item.subjectId}.${item.fieldKey}`;
      const [claim] = tx
        .select()
        .from(schema.claims)
        .where(
          and(
            eq(schema.claims.subjectTable, item.subjectTable),
            eq(schema.claims.subjectId, item.subjectId),
            eq(schema.claims.fieldKey, item.fieldKey),
          ),
        )
        .all();

      if (!claim) {
        const [row] = tx
          .insert(schema.claims)
          .values({
            subjectTable: item.subjectTable,
            subjectId: item.subjectId,
            fieldKey: item.fieldKey,
            state: "unknown",
            verification: "draft",
            locked: false,
            sourceId,
            checkedAt: null,
            note: line,
          })
          .returning()
          .all();
        logChange({
          action: "create",
          subjectTable: item.subjectTable,
          subjectId: item.subjectId,
          fieldKey: item.fieldKey,
          before: null,
          after: row,
        });
        push({ action: "CREATE", kind: "claim", label: reportLabel });
        return;
      }

      if (claim.locked || claim.verification === "verified") {
        recordConflict(claim, line, reportLabel);
        return;
      }

      if (claim.state === "known") {
        push({ action: "KEEP", kind: "claim", label: reportLabel });
        return;
      }

      if (claim.note?.includes(line)) {
        push({ action: "UNCHANGED", kind: "claim", label: reportLabel });
        return;
      }

      const note = claim.note ? `${claim.note}\n${line}` : line;
      tx.update(schema.claims)
        .set({ note })
        .where(eq(schema.claims.id, claim.id))
        .run();
      const [after] = tx
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.id, claim.id))
        .all();
      logChange({
        action: "update",
        subjectTable: item.subjectTable,
        subjectId: item.subjectId,
        fieldKey: item.fieldKey,
        before: claim,
        after,
      });
      push({ action: "APPEND", kind: "claim", label: reportLabel });
    };

    // --- Records ---
    for (const record of capture.records) {
      const { raw, target } = record;
      const resolved =
        "legacy_key" in target
          ? resolveLegacyTarget(target.legacy_key)
          : resolveCreateTarget(record, target.create.credential);

      const items: LeadItem[] = [
        {
          subjectTable: "programs",
          subjectId: resolved.programId,
          fieldKey: "credential",
          value: raw.degree,
        },
        {
          subjectTable: "programs",
          subjectId: resolved.programId,
          fieldKey: "program_length_months",
          value: raw.length,
        },
        {
          subjectTable: "programs",
          subjectId: resolved.programId,
          fieldKey: "director_name",
          value: raw.director,
        },
        {
          subjectTable: "programs",
          subjectId: resolved.programId,
          fieldKey: "directory_lead",
          value: [
            raw.subtitle,
            raw.badge,
            raw.key_requirements,
            raw.website_url,
          ]
            .filter(Boolean)
            .join(" · "),
        },
        {
          subjectTable: "application_cycles",
          subjectId: resolved.cycleId,
          fieldKey: "deadline_date",
          value: raw.deadline,
        },
        {
          subjectTable: "requirements",
          subjectId: resolved.gpaRequirementId,
          fieldKey: "value_number",
          value: raw.min_gpa,
        },
        {
          subjectTable: "requirements",
          subjectId: resolved.tuitionRequirementId,
          fieldKey: "value_number",
          value: raw.tuition,
          isTuition: true,
        },
      ];
      if ("create" in target) {
        const { city, state } = parseCityState(raw.location);
        items.push(
          {
            subjectTable: "schools",
            subjectId: resolved.schoolId,
            fieldKey: "name",
            value: raw.name,
          },
          {
            subjectTable: "schools",
            subjectId: resolved.schoolId,
            fieldKey: "city",
            value: city,
          },
          {
            subjectTable: "schools",
            subjectId: resolved.schoolId,
            fieldKey: "state",
            value: state,
          },
        );
      }

      for (const item of items.filter(isLeadValue)) {
        applyLeadItem(item, resolved.label);
      }
    }

    const changed =
      report.counts.CREATE + report.counts.APPEND + report.counts.CONFLICT;
    if (mode === "dry_run" || changed === 0) {
      throw new Rollback();
    }

    tx.update(schema.importBatches)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        summaryJson: { ...report.counts, sourceCreated: report.sourceCreated },
      })
      .where(eq(schema.importBatches.id, batchId))
      .run();
  };

  try {
    db.transaction(run);
    report.committed = true;
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  return report;
}
