import { and, eq, inArray, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import {
  CYCLE_FACT_KEYS,
  CYCLE_PLAIN_KEYS,
  PREREQUISITE_PLAIN_KEYS,
  PROGRAM_FACT_KEYS,
  PROGRAM_PLAIN_KEYS,
  REQUIREMENT_PLAIN_KEYS,
  SCHOOL_FACT_KEYS,
  SCHOOL_PLAIN_KEYS,
  TUITION_PLAIN_KEYS,
  type Scalar,
  type SchoolBundle,
} from "@/domain/import/bundle";
import {
  KIND_TABLE,
  type ClaimSnapshot,
  type CurrentCycle,
  type CurrentEntity,
  type CurrentProgram,
  type CurrentSchool,
  type CurrentState,
  type EntityKind,
  type SourceType,
} from "@/domain/import/diff";

/**
 * Reads one school's tree from the database into the plain `CurrentState`
 * shape the pure diff engine consumes. `src/domain/**` is server-only and
 * cannot be imported from tsx, so (like scripts/lead-import) the DB-touching
 * half of the pipeline lives under scripts/.
 */

export type Db = BetterSQLite3Database<typeof schema>;

export interface SourceMeta {
  title: string | null;
  publisher: string | null;
  sourceType: SourceType;
}

export interface LoadedSchool {
  school: CurrentSchool;
  /** Metadata of every source cited by a loaded claim, keyed by URL. */
  sourceMeta: Map<string, SourceMeta>;
}

const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function fieldsOf(
  row: object,
  keys: readonly string[],
): Record<string, Scalar> {
  const record = row as Record<string, unknown>;
  const out: Record<string, Scalar> = {};
  for (const key of keys) {
    const value = record[camel(key)];
    out[key] = (value ?? null) as Scalar;
  }
  return out;
}

const SCHOOL_FIELDS = ["slug", ...SCHOOL_PLAIN_KEYS, ...SCHOOL_FACT_KEYS];
const PROGRAM_FIELDS = ["slug", ...PROGRAM_PLAIN_KEYS, ...PROGRAM_FACT_KEYS];
const CYCLE_FIELDS = ["cycle_label", ...CYCLE_PLAIN_KEYS, ...CYCLE_FACT_KEYS];
const REQUIREMENT_FIELDS = [
  "category",
  "label",
  ...REQUIREMENT_PLAIN_KEYS,
  "value_text",
  "value_number",
  "value_bool",
  "value_date",
];
const PREREQUISITE_FIELDS = ["subject", ...PREREQUISITE_PLAIN_KEYS];
const TUITION_FIELDS = ["residency", "covers", ...TUITION_PLAIN_KEYS];

export function loadSchoolTree(db: Db, slug: string): LoadedSchool | null {
  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, slug))
    .all();
  if (!school) return null;

  const programs = db
    .select()
    .from(schema.programs)
    .where(eq(schema.programs.schoolId, school.id))
    .all();
  const programIds = programs.map((p) => p.id);
  const cycles = programIds.length
    ? db
        .select()
        .from(schema.applicationCycles)
        .where(inArray(schema.applicationCycles.programId, programIds))
        .all()
    : [];
  const cycleIds = cycles.map((c) => c.id);
  const requirements = cycleIds.length
    ? db
        .select()
        .from(schema.requirements)
        .where(inArray(schema.requirements.cycleId, cycleIds))
        .all()
    : [];
  const prerequisites = cycleIds.length
    ? db
        .select()
        .from(schema.prerequisiteCourses)
        .where(inArray(schema.prerequisiteCourses.cycleId, cycleIds))
        .all()
    : [];
  const tuition = programIds.length
    ? db
        .select()
        .from(schema.tuitionEstimates)
        .where(inArray(schema.tuitionEstimates.programId, programIds))
        .all()
    : [];

  // --- claims + pending conflicts for every subject loaded above ---
  const subjects: [(typeof KIND_TABLE)[EntityKind], number[]][] = [
    ["schools", [school.id]],
    ["programs", programIds],
    ["application_cycles", cycleIds],
    ["requirements", requirements.map((r) => r.id)],
    ["prerequisite_courses", prerequisites.map((r) => r.id)],
    ["tuition_estimates", tuition.map((r) => r.id)],
  ];
  const nonEmpty = subjects.filter(([, ids]) => ids.length > 0);
  const claimRows = db
    .select()
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(
      or(
        ...nonEmpty.map(([table, ids]) =>
          and(
            eq(schema.claims.subjectTable, table),
            inArray(schema.claims.subjectId, ids),
          ),
        ),
      ),
    )
    .all();
  const conflictRows = db
    .select()
    .from(schema.importConflicts)
    .where(
      and(
        eq(schema.importConflicts.resolution, "pending"),
        or(
          ...nonEmpty.map(([table, ids]) =>
            and(
              eq(schema.importConflicts.subjectTable, table),
              inArray(schema.importConflicts.subjectId, ids),
            ),
          ),
        ),
      ),
    )
    .all();

  const sourceMeta = new Map<string, SourceMeta>();
  const claimsBySubject = new Map<string, Record<string, ClaimSnapshot>>();
  for (const row of claimRows) {
    const c = row.claims;
    const key = `${c.subjectTable}:${c.subjectId}`;
    const bucket = claimsBySubject.get(key) ?? {};
    bucket[c.fieldKey] = {
      state: c.state,
      sourceUrl: row.sources?.url ?? null,
      quote: c.quote,
      note: c.note,
      checkedAt: c.checkedAt ? c.checkedAt.getTime() : null,
      confidence: c.confidence,
      verification: c.verification,
      locked: c.locked,
    };
    claimsBySubject.set(key, bucket);
    if (row.sources) {
      sourceMeta.set(row.sources.url, {
        title: row.sources.title,
        publisher: row.sources.publisher,
        sourceType: row.sources.sourceType,
      });
    }
  }
  const conflictsBySubject = new Map<string, Record<string, unknown[]>>();
  for (const c of conflictRows) {
    const key = `${c.subjectTable}:${c.subjectId}`;
    const bucket = conflictsBySubject.get(key) ?? {};
    (bucket[c.fieldKey] ??= []).push(c.proposedJson);
    conflictsBySubject.set(key, bucket);
  }

  const entity = (
    kind: EntityKind,
    row: { id: number; status?: string },
    fields: Record<string, Scalar>,
  ): CurrentEntity => {
    const key = `${KIND_TABLE[kind]}:${row.id}`;
    return {
      id: row.id,
      status: row.status ?? "draft",
      fields,
      claims: claimsBySubject.get(key) ?? {},
      pendingConflicts: conflictsBySubject.get(key) ?? {},
    };
  };

  const cycleLabelById = new Map(cycles.map((c) => [c.id, c.cycleLabel]));
  const currentCycles: (CurrentCycle & { programId: number })[] = cycles.map(
    (c) => ({
      ...entity("cycle", c, fieldsOf(c, CYCLE_FIELDS)),
      programId: c.programId,
      requirements: requirements
        .filter((r) => r.cycleId === c.id)
        .map((r) => entity("requirement", r, fieldsOf(r, REQUIREMENT_FIELDS))),
      prerequisites: prerequisites
        .filter((r) => r.cycleId === c.id)
        .map((r) =>
          entity("prerequisite", r, fieldsOf(r, PREREQUISITE_FIELDS)),
        ),
    }),
  );
  const currentPrograms: CurrentProgram[] = programs.map((p) => ({
    ...entity("program", p, fieldsOf(p, PROGRAM_FIELDS)),
    cycles: currentCycles.filter((c) => c.programId === p.id),
    tuition: tuition
      .filter((t) => t.programId === p.id)
      .map((t) =>
        entity(
          "tuition",
          { id: t.id },
          {
            ...fieldsOf(t, TUITION_FIELDS),
            cycle_label: t.cycleId
              ? (cycleLabelById.get(t.cycleId) ?? null)
              : null,
          },
        ),
      ),
  }));

  return {
    school: {
      ...entity("school", school, fieldsOf(school, SCHOOL_FIELDS)),
      programs: currentPrograms,
    },
    sourceMeta,
  };
}

function citedUrls(bundle: SchoolBundle): Set<string> {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        if (key === "source_url" && typeof inner === "string") urls.add(inner);
        else visit(inner);
      }
    }
  };
  visit(bundle);
  return urls;
}

export function loadCurrentState(db: Db, bundle: SchoolBundle): CurrentState {
  const urls = [...citedUrls(bundle)];
  const existing = urls.length
    ? db
        .select({ url: schema.sources.url })
        .from(schema.sources)
        .where(inArray(schema.sources.url, urls))
        .all()
    : [];
  return {
    school: loadSchoolTree(db, bundle.school.slug)?.school ?? null,
    sourceUrls: new Set(existing.map((s) => s.url)),
  };
}
