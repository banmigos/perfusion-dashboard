import type { SUBJECT_TABLES } from "@/db/schema/provenance";
import type {
  CLAIM_STATES,
  CONFIDENCE_LEVELS,
  SOURCE_TYPES,
  VERIFICATION_STATES,
} from "@/db/schema/provenance";
import {
  CYCLE_FACT_KEYS,
  CYCLE_PLAIN_KEYS,
  PREREQUISITE_PLAIN_KEYS,
  PROGRAM_FACT_KEYS,
  PROGRAM_PLAIN_KEYS,
  RECORD_CLAIM_KEY,
  REQUIREMENT_PLAIN_KEYS,
  SCHOOL_FACT_KEYS,
  SCHOOL_PLAIN_KEYS,
  TUITION_PLAIN_KEYS,
  parseCheckedAt,
  requirementKey,
  tuitionKey,
  type BundleCycle,
  type BundleProgram,
  type Citation,
  type Fact,
  type Scalar,
  type SchoolBundle,
} from "./bundle";

/**
 * Pure import diff engine (docs/plan.md §3, §5).
 *
 * `diffBundle(current, bundle)` compares a snapshot of what the database holds
 * for one school against an incoming bundle and returns the operations an
 * applier should perform. It takes no database handle and runs no queries, so
 * dry-run is trivially correct and every rule below is unit-testable.
 *
 * Rules:
 *  - A bundle never deletes. A field, row, or fact absent from the bundle is
 *    left alone; archiving is a manual act.
 *  - A claim is protected when `verification = 'verified'` OR `locked = true`.
 *    An incoming change to a protected claim, to the value column it backs, or
 *    (for whole-record rows) to the row, becomes `skip_protected` — never a write.
 *  - Import never sets `verified`; created claims are `draft`.
 *  - Re-running a bundle that has been applied yields no operations.
 */

export type SubjectTable = (typeof SUBJECT_TABLES)[number];
export type ClaimState = (typeof CLAIM_STATES)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type Verification = (typeof VERIFICATION_STATES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];

export type EntityKind =
  "school" | "program" | "cycle" | "requirement" | "prerequisite" | "tuition";

export const KIND_TABLE: Record<EntityKind, SubjectTable> = {
  school: "schools",
  program: "programs",
  cycle: "application_cycles",
  requirement: "requirements",
  prerequisite: "prerequisite_courses",
  tuition: "tuition_estimates",
};

// --- Current state (input) -------------------------------------------------

export interface ClaimSnapshot {
  state: ClaimState;
  sourceUrl: string | null;
  quote: string | null;
  note: string | null;
  /** Epoch ms. */
  checkedAt: number | null;
  confidence: Confidence | null;
  verification: Verification;
  locked: boolean;
}

export interface CurrentEntity {
  id: number;
  /** Canonical status; `archived` rows are never touched. */
  status: string;
  /** Column values keyed by snake_case column name. */
  fields: Record<string, Scalar>;
  /** Claims keyed by field_key. */
  claims: Record<string, ClaimSnapshot>;
  /** field_key -> proposed_json of every still-pending import_conflicts row. */
  pendingConflicts?: Record<string, readonly unknown[]>;
}

export interface CurrentCycle extends CurrentEntity {
  requirements: CurrentEntity[];
  prerequisites: CurrentEntity[];
}
export interface CurrentProgram extends CurrentEntity {
  cycles: CurrentCycle[];
  /** `fields.cycle_label` carries the linked cycle's label, or null. */
  tuition: CurrentEntity[];
}
export interface CurrentSchool extends CurrentEntity {
  programs: CurrentProgram[];
}

export interface CurrentState {
  school: CurrentSchool | null;
  /** URLs of `sources` rows that already exist. */
  sourceUrls: ReadonlySet<string>;
}

// --- Plan (output) ---------------------------------------------------------

export interface Subject {
  kind: EntityKind;
  path: string;
  /** Present when the row already exists; absent for rows created in this plan. */
  id?: number;
}

export interface ClaimValues {
  state?: ClaimState;
  sourceUrl?: string | null;
  quote?: string | null;
  note?: string | null;
  checkedAt?: number | null;
  confidence?: Confidence | null;
}

export type ProtectReason = "verified" | "locked" | "verified_and_locked";

export type PlannedOp =
  | {
      type: "create_source";
      url: string;
      title: string | null;
      publisher: string | null;
      sourceType: SourceType;
    }
  | {
      type: "create_entity";
      kind: EntityKind;
      path: string;
      parentPath: string | null;
      /** Set when the parent row already exists. */
      parentId?: number;
      /** Tuition only: the cycle the row is linked to (id when it already exists). */
      cyclePath?: string | null;
      cycleId?: number;
      values: Record<string, Scalar>;
    }
  | {
      type: "update_entity";
      kind: EntityKind;
      path: string;
      id: number;
      before: Record<string, Scalar>;
      after: Record<string, Scalar>;
    }
  | {
      type: "create_claim";
      subject: Subject;
      fieldKey: string;
      claim: ClaimValues & { state: ClaimState };
    }
  | {
      type: "update_claim";
      subject: Subject;
      fieldKey: string;
      before: ClaimSnapshot;
      /** Only the keys that differ. */
      changes: ClaimValues;
    }
  | {
      type: "skip_protected";
      subject: Subject & { id: number };
      fieldKey: string;
      reason: ProtectReason;
      current: Record<string, unknown>;
      proposed: Record<string, unknown>;
    }
  | { type: "skip_archived"; kind: EntityKind; path: string };

export interface ImportPlan {
  ops: PlannedOp[];
  /** Entity rows and facts that already match the bundle (or whose conflict is already pending). */
  unchanged: number;
}

/** Operations that write something (everything except informational skips). */
export function writeOps(plan: ImportPlan): PlannedOp[] {
  return plan.ops.filter((op) => op.type !== "skip_archived");
}

export function protectReason(claim: ClaimSnapshot): ProtectReason | null {
  const verified = claim.verification === "verified";
  if (verified && claim.locked) return "verified_and_locked";
  if (verified) return "verified";
  if (claim.locked) return "locked";
  return null;
}

// --- Helpers ----------------------------------------------------------------

type Plain = Record<string, Scalar | undefined>;
type Facts = Partial<Record<string, Fact>>;

const sameScalar = (a: Scalar | undefined, b: Scalar | undefined) =>
  (a ?? null) === (b ?? null);

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

function desiredClaim(fact: Fact): ClaimValues & { state: ClaimState } {
  const claim: ClaimValues & { state: ClaimState } = { state: fact.state };
  const c = fact.citation;
  if (c) {
    claim.sourceUrl = c.source_url;
    claim.quote = c.quote ?? null;
    claim.checkedAt = c.checked_at ? parseCheckedAt(c.checked_at) : null;
  }
  if (fact.note !== undefined) claim.note = fact.note;
  if (fact.confidence !== undefined) claim.confidence = fact.confidence;
  return claim;
}

function claimChanges(
  current: ClaimSnapshot,
  desired: ClaimValues,
): ClaimValues {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(desired)) {
    if (value !== undefined && value !== current[key as keyof ClaimSnapshot]) {
      changes[key] = value;
    }
  }
  return changes as ClaimValues;
}

function describeClaim(claim: ClaimValues, value: Scalar | undefined) {
  const out: Record<string, unknown> = {};
  if (value !== undefined) out.value = value;
  if (claim.state !== undefined) out.state = claim.state;
  if (claim.sourceUrl !== undefined) out.source_url = claim.sourceUrl;
  if (claim.quote !== undefined) out.quote = claim.quote;
  if (claim.checkedAt !== undefined) out.checked_at = iso(claim.checkedAt);
  if (claim.note !== undefined) out.note = claim.note;
  if (claim.confidence !== undefined) out.confidence = claim.confidence;
  return out;
}

function describeSnapshot(claim: ClaimSnapshot, value: Scalar | undefined) {
  return {
    value: value ?? null,
    state: claim.state,
    source_url: claim.sourceUrl,
    quote: claim.quote,
    checked_at: iso(claim.checkedAt),
    note: claim.note,
    confidence: claim.confidence,
    verification: claim.verification,
    locked: claim.locked,
  };
}

const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

interface EntityInput {
  kind: EntityKind;
  path: string;
  parentPath: string | null;
  parentId?: number;
  cyclePath?: string | null;
  cycleId?: number;
  existing: CurrentEntity | undefined;
  plain: Plain;
  /** Fact column -> fact. The claim's field_key is the same string. */
  facts: Facts;
  /** Whole-record rows: a single `record` claim covers every plain column. */
  record?: { citation: Citation; confidence?: Confidence };
}

class PlanBuilder {
  readonly ops: PlannedOp[] = [];
  unchanged = 0;
  private readonly knownSources: Set<string>;

  constructor(sourceUrls: ReadonlySet<string>) {
    this.knownSources = new Set(sourceUrls);
  }

  private ensureSource(citation: Citation | undefined) {
    if (!citation || this.knownSources.has(citation.source_url)) return;
    this.knownSources.add(citation.source_url);
    this.ops.push({
      type: "create_source",
      url: citation.source_url,
      title: citation.title ?? null,
      publisher: citation.publisher ?? null,
      sourceType: citation.source_type ?? "program_site",
    });
  }

  private conflict(
    subject: Subject & { id: number },
    entity: CurrentEntity,
    fieldKey: string,
    reason: ProtectReason,
    current: Record<string, unknown>,
    proposed: Record<string, unknown>,
  ) {
    const pending = entity.pendingConflicts?.[fieldKey] ?? [];
    if (pending.some((p) => sameJson(p, proposed))) {
      this.unchanged += 1;
      return;
    }
    this.ops.push({
      type: "skip_protected",
      subject,
      fieldKey,
      reason,
      current,
      proposed,
    });
  }

  /**
   * Plans one entity and its claims. Returns false when the row is archived,
   * in which case the caller must not descend into its children.
   */
  entity(input: EntityInput): boolean {
    const { kind, path, existing } = input;
    if (existing?.status === "archived") {
      this.ops.push({ type: "skip_archived", kind, path });
      return false;
    }
    if (!existing) {
      this.create(input);
      return true;
    }
    this.update(input, existing);
    return true;
  }

  private create(input: EntityInput) {
    const { kind, path } = input;
    const values: Record<string, Scalar> = {};
    for (const [key, value] of Object.entries(input.plain)) {
      if (value !== undefined) values[key] = value;
    }
    for (const [key, fact] of Object.entries(input.facts)) {
      if (fact?.state === "known") values[key] = fact.value;
    }
    this.ops.push({
      type: "create_entity",
      kind,
      path,
      parentPath: input.parentPath,
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.cyclePath !== undefined ? { cyclePath: input.cyclePath } : {}),
      ...(input.cycleId !== undefined ? { cycleId: input.cycleId } : {}),
      values,
    });
    const subject: Subject = { kind, path };
    for (const [key, fact] of Object.entries(input.facts)) {
      if (!fact) continue;
      this.ensureSource(fact.citation);
      this.ops.push({
        type: "create_claim",
        subject,
        fieldKey: key,
        claim: desiredClaim(fact),
      });
    }
    if (input.record) {
      this.ensureSource(input.record.citation);
      this.ops.push({
        type: "create_claim",
        subject,
        fieldKey: RECORD_CLAIM_KEY,
        claim: desiredClaim({
          state: "known",
          value: null,
          citation: input.record.citation,
          confidence: input.record.confidence,
        }),
      });
    }
  }

  private update(input: EntityInput, existing: CurrentEntity) {
    const { kind, path } = input;
    const subject = { kind, path, id: existing.id };
    const before: Record<string, Scalar> = {};
    const after: Record<string, Scalar> = {};
    const claimOps: PlannedOp[] = [];
    const note = (key: string, to: Scalar) => {
      before[key] = existing.fields[key] ?? null;
      after[key] = to;
    };

    if (input.record) {
      this.updateRecord(
        input.record,
        input.plain,
        existing,
        subject,
        note,
        claimOps,
      );
    } else {
      for (const [key, value] of Object.entries(input.plain)) {
        if (value === undefined || sameScalar(existing.fields[key], value)) {
          continue;
        }
        const claim = existing.claims[key];
        const reason = claim && protectReason(claim);
        if (claim && reason) {
          this.conflict(
            subject,
            existing,
            key,
            reason,
            describeSnapshot(claim, existing.fields[key]),
            { value },
          );
          continue;
        }
        note(key, value);
      }
    }

    for (const [key, fact] of Object.entries(input.facts)) {
      if (!fact) continue;
      const wanted = fact.state === "known" ? fact.value : null;
      const currentValue = existing.fields[key] ?? null;
      const claim = existing.claims[key];
      const desired = desiredClaim(fact);

      if (!claim) {
        if (!sameScalar(currentValue, wanted)) note(key, wanted);
        this.ensureSource(fact.citation);
        claimOps.push({
          type: "create_claim",
          subject,
          fieldKey: key,
          claim: desired,
        });
        continue;
      }

      const changes = claimChanges(claim, desired);
      const claimDiffers = Object.keys(changes).length > 0;
      const valueDiffers = !sameScalar(currentValue, wanted);
      const reason = protectReason(claim);
      if (reason) {
        if (valueDiffers || claimDiffers) {
          this.conflict(
            subject,
            existing,
            key,
            reason,
            describeSnapshot(claim, currentValue),
            describeClaim(desired, wanted),
          );
        } else {
          this.unchanged += 1;
        }
        continue;
      }
      if (valueDiffers) note(key, wanted);
      if (claimDiffers) {
        this.ensureSource(fact.citation);
        claimOps.push({
          type: "update_claim",
          subject,
          fieldKey: key,
          before: claim,
          changes,
        });
      } else if (!valueDiffers) {
        this.unchanged += 1;
      }
    }

    if (Object.keys(after).length > 0) {
      this.ops.push({
        type: "update_entity",
        kind,
        path,
        id: existing.id,
        before,
        after,
      });
    } else {
      this.unchanged += 1;
    }
    this.ops.push(...claimOps);
  }

  /** Whole-record rows: the single `record` claim guards every plain column. */
  private updateRecord(
    record: NonNullable<EntityInput["record"]>,
    plain: Plain,
    existing: CurrentEntity,
    subject: Subject & { id: number },
    note: (key: string, to: Scalar) => void,
    claimOps: PlannedOp[],
  ) {
    const claim = existing.claims[RECORD_CLAIM_KEY];
    const desired = desiredClaim({
      state: "known",
      value: null,
      citation: record.citation,
      confidence: record.confidence,
    });
    const proposedPlain: Record<string, Scalar> = {};
    for (const [key, value] of Object.entries(plain)) {
      if (value !== undefined && !sameScalar(existing.fields[key], value)) {
        proposedPlain[key] = value;
      }
    }
    const plainDiffers = Object.keys(proposedPlain).length > 0;

    if (!claim) {
      for (const [key, value] of Object.entries(proposedPlain))
        note(key, value);
      this.ensureSource(record.citation);
      claimOps.push({
        type: "create_claim",
        subject,
        fieldKey: RECORD_CLAIM_KEY,
        claim: desired,
      });
      return;
    }

    const changes = claimChanges(claim, desired);
    const claimDiffers = Object.keys(changes).length > 0;
    const reason = protectReason(claim);
    if (reason) {
      if (plainDiffers || claimDiffers) {
        this.conflict(
          subject,
          existing,
          RECORD_CLAIM_KEY,
          reason,
          { ...describeSnapshot(claim, null), fields: existing.fields },
          { ...describeClaim(desired, undefined), fields: proposedPlain },
        );
      }
      return;
    }
    for (const [key, value] of Object.entries(proposedPlain)) note(key, value);
    if (claimDiffers) {
      this.ensureSource(record.citation);
      claimOps.push({
        type: "update_claim",
        subject,
        fieldKey: RECORD_CLAIM_KEY,
        before: claim,
        changes,
      });
    }
  }
}

// --- Bundle walk ------------------------------------------------------------

function plainOf(
  source: object,
  keys: readonly string[],
): Record<string, Scalar | undefined> {
  const record = source as Record<string, Scalar | undefined>;
  const out: Record<string, Scalar | undefined> = {};
  for (const key of keys) out[key] = record[key];
  return out;
}

function factsOf(
  source: object | undefined,
  keys: readonly string[],
): Record<string, Fact | undefined> {
  const record = (source ?? {}) as Record<string, Fact | undefined>;
  const out: Record<string, Fact | undefined> = {};
  for (const key of keys) out[key] = record[key];
  return out;
}

export function diffBundle(
  current: CurrentState,
  bundle: SchoolBundle,
): ImportPlan {
  const plan = new PlanBuilder(current.sourceUrls);
  const incoming = bundle.school;
  const schoolPath = incoming.slug;

  const run = (input: EntityInput): boolean => plan.entity(input);

  const schoolOk = run({
    kind: "school",
    path: schoolPath,
    parentPath: null,
    existing: current.school ?? undefined,
    plain: { ...plainOf(incoming, SCHOOL_PLAIN_KEYS), slug: incoming.slug },
    facts: factsOf(incoming.facts, SCHOOL_FACT_KEYS),
  });
  if (!schoolOk) return { ops: plan.ops, unchanged: plan.unchanged };

  for (const program of incoming.programs ?? []) {
    const existing = current.school?.programs.find(
      (p) => p.fields.slug === program.slug,
    );
    diffProgram(program, schoolPath, current.school?.id, existing, run);
  }
  return { ops: plan.ops, unchanged: plan.unchanged };
}

function diffProgram(
  program: BundleProgram,
  schoolPath: string,
  schoolId: number | undefined,
  existing: CurrentProgram | undefined,
  run: (input: EntityInput) => boolean,
) {
  const path = `${schoolPath}/${program.slug}`;
  const ok = run({
    kind: "program",
    path,
    parentPath: schoolPath,
    parentId: schoolId,
    existing,
    plain: { ...plainOf(program, PROGRAM_PLAIN_KEYS), slug: program.slug },
    facts: factsOf(program.facts, PROGRAM_FACT_KEYS),
  });
  if (!ok) return;

  for (const cycle of program.cycles ?? []) {
    const existingCycle = existing?.cycles.find(
      (c) => c.fields.cycle_label === cycle.cycle_label,
    );
    diffCycle(cycle, path, existing?.id, existingCycle, run);
  }

  for (const tuition of program.tuition ?? []) {
    const key = tuitionKey(tuition);
    const existingTuition = existing?.tuition.find(
      (t) =>
        tuitionKey({
          cycle_label: t.fields.cycle_label as string | null,
          residency: String(t.fields.residency),
          covers: String(t.fields.covers),
        }) === key,
    );
    run({
      kind: "tuition",
      path: `${path}/tuition:${key}`,
      parentPath: path,
      parentId: existing?.id,
      cyclePath: tuition.cycle_label ? `${path}@${tuition.cycle_label}` : null,
      cycleId: existing?.cycles.find(
        (c) => c.fields.cycle_label === tuition.cycle_label,
      )?.id,
      existing: existingTuition,
      plain: {
        ...plainOf(tuition, TUITION_PLAIN_KEYS),
        residency: tuition.residency,
        covers: tuition.covers,
      },
      facts: {},
      record: { citation: tuition.citation, confidence: tuition.confidence },
    });
  }
}

function diffCycle(
  cycle: BundleCycle,
  programPath: string,
  programId: number | undefined,
  existing: CurrentCycle | undefined,
  run: (input: EntityInput) => boolean,
) {
  const path = `${programPath}@${cycle.cycle_label}`;
  const ok = run({
    kind: "cycle",
    path,
    parentPath: programPath,
    parentId: programId,
    existing,
    plain: {
      ...plainOf(cycle, CYCLE_PLAIN_KEYS),
      cycle_label: cycle.cycle_label,
    },
    facts: factsOf(cycle.facts, CYCLE_FACT_KEYS),
  });
  if (!ok) return;

  for (const requirement of cycle.requirements ?? []) {
    const key = requirementKey(requirement);
    const existingRequirement = existing?.requirements.find(
      (r) =>
        requirementKey({
          category: String(r.fields.category),
          label: String(r.fields.label),
        }) === key,
    );
    const value = requirement.value;
    run({
      kind: "requirement",
      path: `${path}/req:${key}`,
      parentPath: path,
      parentId: existing?.id,
      existing: existingRequirement,
      plain: {
        ...plainOf(requirement, REQUIREMENT_PLAIN_KEYS),
        category: requirement.category,
        label: requirement.label,
      },
      facts: value ? { [`value_${value.kind}`]: value as Fact } : {},
    });
  }

  for (const prerequisite of cycle.prerequisites ?? []) {
    const existingPrerequisite = existing?.prerequisites.find(
      (p) => p.fields.subject === prerequisite.subject,
    );
    run({
      kind: "prerequisite",
      path: `${path}/prereq:${prerequisite.subject}`,
      parentPath: path,
      parentId: existing?.id,
      existing: existingPrerequisite,
      plain: {
        ...plainOf(prerequisite, PREREQUISITE_PLAIN_KEYS),
        subject: prerequisite.subject,
      },
      facts: {},
      record: {
        citation: prerequisite.citation,
        confidence: prerequisite.confidence,
      },
    });
  }
}
