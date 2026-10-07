import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { SchoolBundle, Scalar } from "@/domain/import/bundle";
import {
  KIND_TABLE,
  diffBundle,
  type ClaimValues,
  type EntityKind,
  type ImportPlan,
  type PlannedOp,
  type ProtectReason,
} from "@/domain/import/diff";
import {
  isNoop,
  summarizePlan,
  type PlanSummary,
} from "@/domain/import/format";
import { loadCurrentState, type Db } from "./load";

/**
 * Applies a school bundle. Dry-run and apply execute the same operations in
 * the same single transaction; dry-run then rolls back, so a passing dry-run
 * has exercised every real constraint (docs/plan.md §5).
 */

export type BundleImportMode = "dry_run" | "apply";

export interface BundleImportReport {
  plan: ImportPlan;
  summary: PlanSummary;
  /** True only when an apply committed. Dry-runs and no-op applies roll back. */
  committed: boolean;
  batchId: number | null;
}

class Rollback extends Error {}

const REASON_TEXT: Record<ProtectReason, string> = {
  verified: "claim is verified",
  locked: "claim is locked",
  verified_and_locked: "claim is verified and locked",
};

const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelKeys(values: Record<string, Scalar>): Record<string, Scalar> {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [camel(k), v]),
  );
}

/**
 * The six canonical tables share an `id` column and accept camelCase column
 * keys; this lets one code path insert/update any of them. Row shapes are
 * guaranteed by the Zod bundle schema, not by this cast.
 */
const tableFor = (kind: EntityKind) => {
  const tables = {
    school: schema.schools,
    program: schema.programs,
    cycle: schema.applicationCycles,
    requirement: schema.requirements,
    prerequisite: schema.prerequisiteCourses,
    tuition: schema.tuitionEstimates,
  };
  return tables[kind] as unknown as typeof schema.schools;
};

export function runBundleImport(
  db: Db,
  bundle: SchoolBundle,
  mode: BundleImportMode,
  sourceLabel: string,
  fileHash: string,
): BundleImportReport {
  const report: BundleImportReport = {
    plan: { ops: [], unchanged: 0 },
    summary: summarizePlan({ ops: [], unchanged: 0 }),
    committed: false,
    batchId: null,
  };

  const run = (tx: Db): void => {
    const plan = diffBundle(loadCurrentState(tx, bundle), bundle);
    report.plan = plan;
    report.summary = summarizePlan(plan);
    // Nothing to write: record no batch, so re-running a bundle leaves no trace.
    if (isNoop(plan)) throw new Rollback();

    const [batch] = tx
      .insert(schema.importBatches)
      .values({ mode, sourceLabel, fileHash, status: "running" })
      .returning()
      .all();
    const batchId = batch!.id;
    report.batchId = batchId;

    const ids = new Map<string, number>();
    const sourceIds = new Map<string, number>();

    const logChange = (input: {
      action: "create" | "update";
      subjectTable: (typeof KIND_TABLE)[EntityKind];
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

    const sourceIdFor = (url: string): number => {
      const cached = sourceIds.get(url);
      if (cached !== undefined) return cached;
      const [row] = tx
        .select()
        .from(schema.sources)
        .where(eq(schema.sources.url, url))
        .all();
      if (!row) throw new Error(`source ${url} was not created before use`);
      sourceIds.set(url, row.id);
      return row.id;
    };

    const subjectId = (subject: { path: string; id?: number }): number => {
      const id = subject.id ?? ids.get(subject.path);
      if (id === undefined) {
        throw new Error(`no row id for ${subject.path}`);
      }
      return id;
    };

    const claimColumns = (claim: ClaimValues) => {
      const out: Record<string, unknown> = {};
      if (claim.state !== undefined) out.state = claim.state;
      if (claim.sourceUrl !== undefined) {
        out.sourceId = claim.sourceUrl ? sourceIdFor(claim.sourceUrl) : null;
      }
      if (claim.quote !== undefined) out.quote = claim.quote;
      if (claim.note !== undefined) out.note = claim.note;
      if (claim.checkedAt !== undefined) {
        out.checkedAt =
          claim.checkedAt === null ? null : new Date(claim.checkedAt);
      }
      if (claim.confidence !== undefined) out.confidence = claim.confidence;
      return out;
    };

    const claimRow = (id: number) =>
      tx.select().from(schema.claims).where(eq(schema.claims.id, id)).all()[0];

    const execute = (op: PlannedOp) => {
      switch (op.type) {
        case "create_source": {
          const [row] = tx
            .insert(schema.sources)
            .values({
              url: op.url,
              title: op.title,
              publisher: op.publisher,
              sourceType: op.sourceType,
            })
            .returning()
            .all();
          sourceIds.set(op.url, row!.id);
          return;
        }
        case "create_entity": {
          const values: Record<string, unknown> = camelKeys(op.values);
          if (op.parentPath !== null) {
            const parentId = op.parentId ?? ids.get(op.parentPath);
            if (parentId === undefined) {
              throw new Error(`no row id for parent ${op.parentPath}`);
            }
            const fk = {
              school: null,
              program: "schoolId",
              cycle: "programId",
              requirement: "cycleId",
              prerequisite: "cycleId",
              tuition: "programId",
            }[op.kind];
            if (fk) values[fk] = parentId;
          }
          if (op.kind === "tuition") {
            values.cycleId = op.cyclePath
              ? (op.cycleId ?? ids.get(op.cyclePath) ?? null)
              : null;
          }
          const table = tableFor(op.kind);
          const [row] = tx
            .insert(table)
            .values(values as typeof table.$inferInsert)
            .returning()
            .all();
          ids.set(op.path, row!.id);
          logChange({
            action: "create",
            subjectTable: KIND_TABLE[op.kind],
            subjectId: row!.id,
            before: null,
            after: row,
          });
          return;
        }
        case "update_entity": {
          const table = tableFor(op.kind);
          tx.update(table)
            .set(camelKeys(op.after) as Partial<typeof table.$inferInsert>)
            .where(eq(table.id, op.id))
            .run();
          logChange({
            action: "update",
            subjectTable: KIND_TABLE[op.kind],
            subjectId: op.id,
            before: op.before,
            after: op.after,
          });
          return;
        }
        case "create_claim": {
          const id = subjectId(op.subject);
          const [row] = tx
            .insert(schema.claims)
            .values({
              subjectTable: KIND_TABLE[op.subject.kind],
              subjectId: id,
              fieldKey: op.fieldKey,
              verification: "draft",
              locked: false,
              ...claimColumns(op.claim),
              state: op.claim.state,
            })
            .returning()
            .all();
          logChange({
            action: "create",
            subjectTable: KIND_TABLE[op.subject.kind],
            subjectId: id,
            fieldKey: op.fieldKey,
            before: null,
            after: row,
          });
          return;
        }
        case "update_claim": {
          const id = subjectId(op.subject);
          const [existing] = tx
            .select()
            .from(schema.claims)
            .where(
              and(
                eq(schema.claims.subjectTable, KIND_TABLE[op.subject.kind]),
                eq(schema.claims.subjectId, id),
                eq(schema.claims.fieldKey, op.fieldKey),
              ),
            )
            .all();
          tx.update(schema.claims)
            .set(claimColumns(op.changes))
            .where(eq(schema.claims.id, existing!.id))
            .run();
          logChange({
            action: "update",
            subjectTable: KIND_TABLE[op.subject.kind],
            subjectId: id,
            fieldKey: op.fieldKey,
            before: existing,
            after: claimRow(existing!.id),
          });
          return;
        }
        case "skip_protected": {
          tx.insert(schema.importConflicts)
            .values({
              batchId,
              subjectTable: KIND_TABLE[op.subject.kind],
              subjectId: op.subject.id,
              fieldKey: op.fieldKey,
              currentJson: op.current,
              proposedJson: op.proposed,
              reason: REASON_TEXT[op.reason],
              resolution: "pending",
            })
            .run();
          return;
        }
        case "skip_archived":
          return;
      }
    };

    for (const op of plan.ops) execute(op);

    if (mode === "dry_run") throw new Rollback();

    tx.update(schema.importBatches)
      .set({
        status: "succeeded",
        finishedAt: new Date(),
        summaryJson: report.summary,
      })
      .where(eq(schema.importBatches.id, batchId))
      .run();
  };

  try {
    db.transaction(run);
    report.committed = true;
  } catch (error) {
    if (!(error instanceof Rollback)) {
      if (mode === "apply") {
        // The transaction is gone, so the failure itself is recorded outside it.
        try {
          db.insert(schema.importBatches)
            .values({
              mode,
              sourceLabel,
              fileHash,
              status: "failed",
              finishedAt: new Date(),
              summaryJson: {
                error: error instanceof Error ? error.message : String(error),
              },
            })
            .run();
        } catch {
          // Best effort; the original error is the one that matters.
        }
      }
      throw error;
    }
  }

  return report;
}
