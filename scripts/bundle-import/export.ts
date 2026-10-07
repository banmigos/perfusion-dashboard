import fs from "node:fs";
import path from "node:path";
import { asc, ne } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  CYCLE_FACT_KEYS,
  CYCLE_PLAIN_KEYS,
  PROGRAM_FACT_KEYS,
  PROGRAM_PLAIN_KEYS,
  REQUIREMENT_PLAIN_KEYS,
  SCHOOL_PLAIN_KEYS,
  RECORD_CLAIM_KEY,
  SCHOOL_FACT_KEYS,
  BUNDLE_FORMAT,
  parseBundle,
  type Citation,
  type Fact,
  type RequirementValueKind,
  type Scalar,
  type SchoolBundle,
} from "@/domain/import/bundle";
import type { ClaimSnapshot, CurrentEntity } from "@/domain/import/diff";
import { loadSchoolTree, type Db, type SourceMeta } from "./load";

/**
 * Emits the database as school bundles, in exactly the shape the importer
 * consumes. Every bundle is validated against the importer's own schema before
 * it is returned, so export can never produce a file import would reject.
 *
 * Export is lossy by design in three ways, each reported as a warning:
 *  - a value with no claim is unsourced and is not exported;
 *  - claims whose field_key the bundle format has no slot for are not exported;
 *  - `verification` and `locked` are not part of the format — import can never
 *    set them, so a re-import creates `draft` claims.
 */

export interface ExportedSchool {
  slug: string;
  bundle: SchoolBundle;
  warnings: string[];
}

const iso = (ms: number) => new Date(ms).toISOString();
const defined = <T extends object>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null),
  ) as T;

function citationOf(
  claim: ClaimSnapshot,
  sourceMeta: Map<string, SourceMeta>,
): Citation | undefined {
  if (!claim.sourceUrl) return undefined;
  const meta = sourceMeta.get(claim.sourceUrl);
  return defined({
    source_url: claim.sourceUrl,
    checked_at: claim.checkedAt === null ? undefined : iso(claim.checkedAt),
    quote: claim.quote,
    title: meta?.title,
    publisher: meta?.publisher,
    source_type: meta?.sourceType,
  }) as Citation;
}

function factFor(
  entity: CurrentEntity,
  column: string,
  where: string,
  sourceMeta: Map<string, SourceMeta>,
  warnings: string[],
): Fact | undefined {
  const value = entity.fields[column] ?? null;
  const claim = entity.claims[column];
  if (!claim) {
    if (value !== null)
      warnings.push(`${where}.${column}: value has no claim; not exported`);
    return undefined;
  }
  if (claim.state === "known" && value === null) {
    warnings.push(
      `${where}.${column}: known claim but empty value; not exported`,
    );
    return undefined;
  }
  if (claim.state !== "known" && value !== null) {
    warnings.push(
      `${where}.${column}: ${claim.state} claim but value is set; not exported`,
    );
    return undefined;
  }
  return defined({
    state: claim.state,
    value,
    citation: citationOf(claim, sourceMeta),
    note: claim.note,
    confidence: claim.confidence,
  }) as Fact;
}

function factsFor(
  entity: CurrentEntity,
  keys: readonly string[],
  where: string,
  sourceMeta: Map<string, SourceMeta>,
  warnings: string[],
) {
  const facts: Record<string, Fact> = {};
  for (const key of keys) {
    const fact = factFor(entity, key, where, sourceMeta, warnings);
    if (fact) facts[key] = fact;
  }
  if (Object.keys(facts).length === 0) return undefined;
  // `value: null` is the schema default, so non-known facts omit it implicitly.
  return facts;
}

const nonNull = (fields: Record<string, Scalar>, keys: readonly string[]) =>
  defined(Object.fromEntries(keys.map((k) => [k, fields[k] ?? undefined])));

function recordCitation(
  entity: CurrentEntity,
  where: string,
  sourceMeta: Map<string, SourceMeta>,
  warnings: string[],
) {
  const claim = entity.claims[RECORD_CLAIM_KEY];
  const citation = claim && citationOf(claim, sourceMeta);
  if (!claim || !citation || citation.checked_at === undefined) {
    warnings.push(`${where}: no dated record claim; row not exported`);
    return null;
  }
  return { citation, confidence: claim.confidence ?? undefined };
}

function warnUnexported(
  entity: CurrentEntity,
  handled: readonly string[],
  where: string,
  warnings: string[],
) {
  for (const key of Object.keys(entity.claims)) {
    if (!handled.includes(key)) {
      warnings.push(
        `${where}: claim '${key}' has no slot in the bundle format; not exported`,
      );
    }
  }
}

const REQUIREMENT_CLAIM_KEYS = [
  "value_text",
  "value_number",
  "value_bool",
  "value_date",
];

export function exportSchool(db: Db, slug: string): ExportedSchool | null {
  const loaded = loadSchoolTree(db, slug);
  if (!loaded) return null;
  const { school, sourceMeta } = loaded;
  const warnings: string[] = [];
  const live = <T extends { status: string }>(rows: T[]) =>
    rows.filter((r) => r.status !== "archived");

  warnUnexported(
    school,
    [...SCHOOL_FACT_KEYS, ...SCHOOL_PLAIN_KEYS],
    slug,
    warnings,
  );
  const programs = live(school.programs)
    .sort((a, b) => String(a.fields.slug).localeCompare(String(b.fields.slug)))
    .map((program) => {
      const pWhere = `${slug}/${program.fields.slug}`;
      warnUnexported(
        program,
        [...PROGRAM_FACT_KEYS, ...PROGRAM_PLAIN_KEYS],
        pWhere,
        warnings,
      );
      const cycles = live(program.cycles)
        .sort((a, b) =>
          String(a.fields.cycle_label).localeCompare(
            String(b.fields.cycle_label),
          ),
        )
        .map((cycle) => {
          const cWhere = `${pWhere}@${cycle.fields.cycle_label}`;
          warnUnexported(
            cycle,
            [...CYCLE_FACT_KEYS, ...CYCLE_PLAIN_KEYS],
            cWhere,
            warnings,
          );
          const requirements = live(cycle.requirements)
            .sort(
              (a, b) =>
                Number(a.fields.sort_order) - Number(b.fields.sort_order) ||
                String(a.fields.category).localeCompare(
                  String(b.fields.category),
                ) ||
                String(a.fields.label).localeCompare(String(b.fields.label)),
            )
            .map((req) => {
              const where = `${cWhere}/req:${req.fields.category}|${req.fields.label}`;
              warnUnexported(
                req,
                [...REQUIREMENT_CLAIM_KEYS, ...REQUIREMENT_PLAIN_KEYS],
                where,
                warnings,
              );
              const kinds: RequirementValueKind[] = [
                "text",
                "number",
                "bool",
                "date",
              ];
              const kind = kinds.find((k) => req.claims[`value_${k}`]);
              const value = kind
                ? factFor(req, `value_${kind}`, where, sourceMeta, warnings)
                : undefined;
              if (!kind) {
                for (const k of kinds) {
                  if (req.fields[`value_${k}`] !== null) {
                    warnings.push(
                      `${where}.value_${k}: value has no claim; not exported`,
                    );
                  }
                }
              }
              return defined({
                category: req.fields.category,
                label: req.fields.label,
                ...nonNull(req.fields, ["unit", "is_required"]),
                sort_order: req.fields.sort_order,
                value: value && kind ? { kind, ...value } : undefined,
              });
            });
          const prerequisites = cycle.prerequisites
            .slice()
            .sort(
              (a, b) =>
                Number(a.fields.sort_order) - Number(b.fields.sort_order) ||
                String(a.fields.subject).localeCompare(
                  String(b.fields.subject),
                ),
            )
            .flatMap((row) => {
              const where = `${cWhere}/prereq:${row.fields.subject}`;
              const record = recordCitation(row, where, sourceMeta, warnings);
              if (!record) return [];
              return [
                defined({
                  subject: row.fields.subject,
                  ...nonNull(row.fields, [
                    "min_credits",
                    "lab_required",
                    "min_grade",
                    "recency_years",
                    "notes",
                  ]),
                  sort_order: row.fields.sort_order,
                  ...record,
                }),
              ];
            });
          return defined({
            cycle_label: cycle.fields.cycle_label,
            ...nonNull(cycle.fields, ["entry_year"]),
            facts: factsFor(
              cycle,
              CYCLE_FACT_KEYS,
              cWhere,
              sourceMeta,
              warnings,
            ),
            requirements: requirements.length ? requirements : undefined,
            prerequisites: prerequisites.length ? prerequisites : undefined,
          });
        });

      const tuition = program.tuition
        .slice()
        .sort((a, b) =>
          `${a.fields.cycle_label ?? ""}|${a.fields.residency}|${a.fields.covers}`.localeCompare(
            `${b.fields.cycle_label ?? ""}|${b.fields.residency}|${b.fields.covers}`,
          ),
        )
        .flatMap((row) => {
          const where = `${pWhere}/tuition:${row.fields.residency}|${row.fields.covers}`;
          const record = recordCitation(row, where, sourceMeta, warnings);
          if (!record) return [];
          return [
            defined({
              cycle_label: row.fields.cycle_label,
              residency: row.fields.residency,
              covers: row.fields.covers,
              ...nonNull(row.fields, [
                "amount_cents",
                "currency",
                "as_of_year",
                "deposit_cents",
                "fees_note",
              ]),
              ...record,
            }),
          ];
        });

      return defined({
        slug: program.fields.slug,
        name: program.fields.name,
        ...nonNull(program.fields, ["legacy_key", "latitude", "longitude"]),
        facts: factsFor(
          program,
          PROGRAM_FACT_KEYS,
          pWhere,
          sourceMeta,
          warnings,
        ),
        cycles: cycles.length ? cycles : undefined,
        tuition: tuition.length ? tuition : undefined,
      });
    });

  const bundle = {
    format: BUNDLE_FORMAT,
    school: defined({
      slug,
      name: school.fields.name,
      ...nonNull(school.fields, ["country"]),
      facts: factsFor(school, SCHOOL_FACT_KEYS, slug, sourceMeta, warnings),
      programs: programs.length ? programs : undefined,
    }),
  };

  const parsed = parseBundle(bundle);
  if (!parsed.success) {
    throw new Error(
      `export of ${slug} failed its own schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return { slug, bundle: parsed.data, warnings };
}

export function exportAllSchools(db: Db): ExportedSchool[] {
  return db
    .select({ slug: schema.schools.slug })
    .from(schema.schools)
    .where(ne(schema.schools.status, "archived"))
    .orderBy(asc(schema.schools.slug))
    .all()
    .flatMap(({ slug }) => exportSchool(db, slug) ?? []);
}

/** Writes `<outDir>/<school-slug>.json` per school; returns the paths written. */
export function writeBundles(
  exported: ExportedSchool[],
  outDir: string,
): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  return exported.map(({ slug, bundle }) => {
    const file = path.join(outDir, `${slug}.json`);
    fs.writeFileSync(file, `${JSON.stringify(bundle, null, 2)}\n`);
    return file;
  });
}
