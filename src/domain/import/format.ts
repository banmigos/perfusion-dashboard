import { KIND_TABLE, writeOps, type ImportPlan, type PlannedOp } from "./diff";

export interface PlanSummary {
  sourcesCreated: number;
  created: number;
  updated: number;
  claimsCreated: number;
  claimsUpdated: number;
  conflicts: number;
  archivedSkipped: number;
  unchanged: number;
}

export function summarizePlan(plan: ImportPlan): PlanSummary {
  const summary: PlanSummary = {
    sourcesCreated: 0,
    created: 0,
    updated: 0,
    claimsCreated: 0,
    claimsUpdated: 0,
    conflicts: 0,
    archivedSkipped: 0,
    unchanged: plan.unchanged,
  };
  for (const op of plan.ops) {
    if (op.type === "create_source") summary.sourcesCreated += 1;
    else if (op.type === "create_entity") summary.created += 1;
    else if (op.type === "update_entity") summary.updated += 1;
    else if (op.type === "create_claim") summary.claimsCreated += 1;
    else if (op.type === "update_claim") summary.claimsUpdated += 1;
    else if (op.type === "skip_protected") summary.conflicts += 1;
    else summary.archivedSkipped += 1;
  }
  return summary;
}

/** True when applying the plan would write nothing. */
export const isNoop = (plan: ImportPlan) => writeOps(plan).length === 0;

const show = (value: unknown) =>
  value === null || value === undefined ? "null" : String(value);

function lines(op: PlannedOp): string[] {
  switch (op.type) {
    case "create_source":
      return [`CREATE    source    ${op.url}`];
    case "create_entity":
      return [`CREATE    ${op.kind.padEnd(9)} ${op.path}`];
    case "update_entity":
      return Object.keys(op.after).map(
        (field) =>
          `UPDATE    ${op.kind.padEnd(9)} ${op.path}   ${field}  ${show(op.before[field])} -> ${show(op.after[field])}`,
      );
    case "create_claim":
      return [
        `CREATE    claim     ${KIND_TABLE[op.subject.kind]}:${op.subject.path}:${op.fieldKey}   state=${op.claim.state}`,
      ];
    case "update_claim":
      return [
        `UPDATE    claim     ${KIND_TABLE[op.subject.kind]}:${op.subject.path}:${op.fieldKey}   ${Object.entries(
          op.changes,
        )
          .map(
            ([k, v]) =>
              `${k} ${show(op.before[k as keyof typeof op.before])} -> ${show(v)}`,
          )
          .join(", ")}`,
      ];
    case "skip_protected":
      return [
        `SKIP      claim     ${KIND_TABLE[op.subject.kind]}:${op.subject.path}:${op.fieldKey}   reason=${op.reason}  (proposed ${show(op.proposed.value ?? "record")}, current ${show(op.current.value ?? "record")})`,
      ];
    case "skip_archived":
      return [`SKIP      ${op.kind.padEnd(9)} ${op.path}   reason=archived`];
  }
}

/** Per-record plan in the style of docs/plan.md §5 "Dry-run behavior". */
export function formatPlan(plan: ImportPlan): string {
  const summary = summarizePlan(plan);
  return [
    ...plan.ops.flatMap(lines),
    `UNCHANGED ${summary.unchanged} records`,
    `CONFLICTS ${summary.conflicts}   ERRORS 0`,
  ].join("\n");
}
