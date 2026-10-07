import { z } from "zod";
import {
  CAS_SERVICES,
  CREDENTIALS,
  DEADLINE_TYPES,
  MODALITIES,
  REQUIREMENT_CATEGORIES,
  RESIDENCIES,
  TUITION_COVERS,
} from "@/db/schema/canonical";
import {
  CLAIM_STATES,
  CONFIDENCE_LEVELS,
  SOURCE_TYPES,
} from "@/db/schema/provenance";
import { httpUrl } from "@/lib/zod/httpUrl";

/**
 * School bundle: the one JSON shape both `scripts/import.ts` consumes and
 * `scripts/export.ts` emits (docs/plan.md §5). Pure — no database access, no
 * `server-only`, so tsx scripts and Vitest can both load it.
 *
 * Every object is strict: an unknown key is an error, never silently dropped.
 */

export const BUNDLE_FORMAT = "school-bundle/v1";

export type Scalar = string | number | boolean | null;

/** Claim-backed field keys per entity. Each value lives in the column of the same name. */
export const SCHOOL_FACT_KEYS = ["city", "state", "website_url"] as const;
export const PROGRAM_FACT_KEYS = [
  "credential",
  "modality",
  "accreditation_status",
  "cae_accredited",
  "program_length_months",
  "class_size",
  "website_url",
  "director_name",
] as const;
export const CYCLE_FACT_KEYS = [
  "application_opens_date",
  "deadline_date",
  "deadline_time_local",
  "deadline_timezone",
  "deadline_type",
  "cas_service",
  "decision_notification_date",
] as const;

/** Columns written without a claim of their own (identity, ordering, display data). */
export const SCHOOL_PLAIN_KEYS = ["name", "country"] as const;
export const PROGRAM_PLAIN_KEYS = [
  "name",
  "legacy_key",
  "latitude",
  "longitude",
] as const;
export const CYCLE_PLAIN_KEYS = ["entry_year"] as const;
export const REQUIREMENT_PLAIN_KEYS = [
  "unit",
  "is_required",
  "sort_order",
] as const;
/** Prerequisite and tuition rows are whole-record facts: one `record` claim covers the row. */
export const PREREQUISITE_PLAIN_KEYS = [
  "min_credits",
  "lab_required",
  "min_grade",
  "recency_years",
  "notes",
  "sort_order",
] as const;
export const TUITION_PLAIN_KEYS = [
  "amount_cents",
  "currency",
  "deposit_cents",
  "fees_note",
  "as_of_year",
] as const;

export const RECORD_CLAIM_KEY = "record";
export const REQUIREMENT_VALUE_KINDS = [
  "text",
  "number",
  "bool",
  "date",
] as const;
export type RequirementValueKind = (typeof REQUIREMENT_VALUE_KINDS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CYCLE_LABEL = /^\d{4}-\d{2}$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const text = z.string().trim().min(1);
const isoDate = z.iso.date();
const checkedAtString = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true }),
]);
const positiveInt = z.number().int().nonnegative();

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** ISO date or datetime -> epoch ms. Date-only values are read as UTC midnight. */
export function parseCheckedAt(value: string): number {
  return Date.parse(value);
}

export interface Citation {
  source_url: string;
  checked_at?: string;
  quote?: string;
  title?: string;
  publisher?: string;
  source_type?: (typeof SOURCE_TYPES)[number];
}

export interface Fact {
  state: (typeof CLAIM_STATES)[number];
  value: Scalar;
  citation?: Citation;
  note?: string;
  confidence?: (typeof CONFIDENCE_LEVELS)[number];
}

function makeSchemas(now: Date) {
  const citation = z
    .strictObject({
      source_url: httpUrl,
      checked_at: checkedAtString.optional(),
      quote: text.optional(),
      title: text.optional(),
      publisher: text.optional(),
      source_type: z.enum(SOURCE_TYPES).optional(),
    })
    .superRefine((value, ctx) => {
      if (
        value.checked_at !== undefined &&
        parseCheckedAt(value.checked_at) > now.getTime()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["checked_at"],
          message: "checked_at must not be in the future",
        });
      }
    });

  const factShape = <T extends z.ZodType<Scalar>>(value: T) => ({
    state: z.enum(CLAIM_STATES),
    value: value.nullable().default(null),
    citation: citation.optional(),
    note: text.optional(),
    confidence: z.enum(CONFIDENCE_LEVELS).optional(),
  });

  /** Rule 3 and 4 of plan §5: known needs a value and a dated citation; anything else needs null. */
  const refineFact = (
    fact: {
      state: string;
      value: Scalar;
      citation?: { checked_at?: string } | undefined;
    },
    ctx: z.RefinementCtx,
  ) => {
    if (fact.state === "known") {
      if (fact.value === null) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: "state 'known' requires a value",
        });
      }
      if (fact.citation === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["citation"],
          message: "a known fact requires a citation (source_url + checked_at)",
        });
      } else if (fact.citation.checked_at === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["citation", "checked_at"],
          message: "a known fact's citation requires checked_at",
        });
      }
    } else if (fact.value !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: `state '${fact.state}' must have a null value`,
      });
    }
  };

  const factOf = <T extends z.ZodType<Scalar>>(value: T) =>
    z.strictObject(factShape(value)).superRefine(refineFact);

  const recordShape = {
    citation: citation,
    confidence: z.enum(CONFIDENCE_LEVELS).optional(),
  };
  const refineRecordCitation = (
    value: { citation: { checked_at?: string } },
    ctx: z.RefinementCtx,
  ) => {
    if (value.citation.checked_at === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["citation", "checked_at"],
        message: "citation requires checked_at",
      });
    }
  };

  const requirementValue = z
    .strictObject({
      kind: z.enum(REQUIREMENT_VALUE_KINDS),
      ...factShape(z.union([z.string(), z.number(), z.boolean()])),
    })
    .superRefine((value, ctx) => {
      refineFact(value, ctx);
      if (value.value === null) return;
      const ok =
        value.kind === "text"
          ? typeof value.value === "string"
          : value.kind === "number"
            ? typeof value.value === "number"
            : value.kind === "bool"
              ? typeof value.value === "boolean"
              : typeof value.value === "string" &&
                isoDate.safeParse(value.value).success;
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: `value does not match kind '${value.kind}'`,
        });
      }
    });

  const requirement = z.strictObject({
    category: z.enum(REQUIREMENT_CATEGORIES),
    label: text,
    unit: text.optional(),
    is_required: z.boolean().optional(),
    sort_order: positiveInt.optional(),
    value: requirementValue.optional(),
  });

  const prerequisite = z
    .strictObject({
      subject: text,
      min_credits: z.number().nonnegative().optional(),
      lab_required: z.boolean().optional(),
      min_grade: text.optional(),
      recency_years: positiveInt.optional(),
      notes: text.optional(),
      sort_order: positiveInt.optional(),
      ...recordShape,
    })
    .superRefine(refineRecordCitation);

  const tuition = z
    .strictObject({
      cycle_label: z.string().regex(CYCLE_LABEL).optional(),
      residency: z.enum(RESIDENCIES),
      covers: z.enum(TUITION_COVERS),
      amount_cents: positiveInt,
      currency: z.string().regex(/^[A-Z]{3}$/),
      as_of_year: z.number().int().min(2000).max(2100),
      deposit_cents: positiveInt.optional(),
      fees_note: text.optional(),
      ...recordShape,
    })
    .superRefine(refineRecordCitation);

  const cycleFacts = z
    .strictObject({
      application_opens_date: factOf(isoDate).optional(),
      deadline_date: factOf(isoDate).optional(),
      deadline_time_local: factOf(z.string().regex(LOCAL_TIME)).optional(),
      deadline_timezone: factOf(
        z.string().refine(isTimeZone, "must be an IANA time zone"),
      ).optional(),
      deadline_type: factOf(z.enum(DEADLINE_TYPES)).optional(),
      cas_service: factOf(z.enum(CAS_SERVICES)).optional(),
      decision_notification_date: factOf(isoDate).optional(),
    })
    .superRefine((facts, ctx) => {
      const hasTime = facts.deadline_time_local?.state === "known";
      const hasZone = facts.deadline_timezone?.state === "known";
      if (hasTime !== hasZone) {
        ctx.addIssue({
          code: "custom",
          path: [hasTime ? "deadline_timezone" : "deadline_time_local"],
          message:
            "deadline_time_local and deadline_timezone must be given together",
        });
      }
      if ((hasTime || hasZone) && facts.deadline_date?.state !== "known") {
        ctx.addIssue({
          code: "custom",
          path: ["deadline_date"],
          message: "a deadline time requires a known deadline_date",
        });
      }
    });

  const cycle = z.strictObject({
    cycle_label: z.string().regex(CYCLE_LABEL, "expected e.g. 2026-27"),
    entry_year: z.number().int().min(2000).max(2100).optional(),
    facts: cycleFacts.optional(),
    requirements: z.array(requirement).optional(),
    prerequisites: z.array(prerequisite).optional(),
  });

  const program = z.strictObject({
    slug: z.string().regex(SLUG),
    name: text,
    legacy_key: text.optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    facts: z
      .strictObject({
        credential: factOf(z.enum(CREDENTIALS)).optional(),
        modality: factOf(z.enum(MODALITIES)).optional(),
        accreditation_status: factOf(text).optional(),
        cae_accredited: factOf(z.boolean()).optional(),
        program_length_months: factOf(positiveInt).optional(),
        class_size: factOf(positiveInt).optional(),
        website_url: factOf(httpUrl).optional(),
        director_name: factOf(text).optional(),
      })
      .optional(),
    cycles: z.array(cycle).optional(),
    tuition: z.array(tuition).optional(),
  });

  const school = z.strictObject({
    slug: z.string().regex(SLUG),
    name: text,
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    facts: z
      .strictObject({
        city: factOf(text).optional(),
        state: factOf(text).optional(),
        website_url: factOf(httpUrl).optional(),
      })
      .optional(),
    programs: z.array(program).optional(),
  });

  return z
    .strictObject({ format: z.literal(BUNDLE_FORMAT), school })
    .superRefine((bundle, ctx) => {
      const dup = (keys: string[], path: (string | number)[], what: string) => {
        const seen = new Set<string>();
        for (const key of keys) {
          if (seen.has(key)) {
            ctx.addIssue({
              code: "custom",
              path,
              message: `duplicate ${what} '${key}'`,
            });
          }
          seen.add(key);
        }
      };
      const programs = bundle.school.programs ?? [];
      dup(
        programs.map((p) => p.slug),
        ["school", "programs"],
        "program slug",
      );
      programs.forEach((p, pi) => {
        const cycles = p.cycles ?? [];
        const labels = cycles.map((c) => c.cycle_label);
        dup(labels, ["school", "programs", pi, "cycles"], "cycle_label");
        (p.tuition ?? []).forEach((t, ti) => {
          if (t.cycle_label !== undefined && !labels.includes(t.cycle_label)) {
            ctx.addIssue({
              code: "custom",
              path: ["school", "programs", pi, "tuition", ti, "cycle_label"],
              message: `tuition references cycle '${t.cycle_label}' which is not in this program's cycles`,
            });
          }
        });
        dup(
          (p.tuition ?? []).map(tuitionKey),
          ["school", "programs", pi, "tuition"],
          "tuition estimate",
        );
        cycles.forEach((c, ci) => {
          dup(
            (c.requirements ?? []).map(requirementKey),
            ["school", "programs", pi, "cycles", ci, "requirements"],
            "requirement",
          );
          dup(
            (c.prerequisites ?? []).map((r) => r.subject),
            ["school", "programs", pi, "cycles", ci, "prerequisites"],
            "prerequisite subject",
          );
        });
      });
    });
}

export type SchoolBundle = z.infer<ReturnType<typeof makeSchemas>>;
export type BundleSchool = SchoolBundle["school"];
export type BundleProgram = NonNullable<BundleSchool["programs"]>[number];
export type BundleCycle = NonNullable<BundleProgram["cycles"]>[number];
export type BundleRequirement = NonNullable<
  BundleCycle["requirements"]
>[number];
export type BundlePrerequisite = NonNullable<
  BundleCycle["prerequisites"]
>[number];
export type BundleTuition = NonNullable<BundleProgram["tuition"]>[number];

/** Identity keys: how a bundle row is matched to a database row. */
export const requirementKey = (r: { category: string; label: string }) =>
  `${r.category}|${r.label}`;
export const tuitionKey = (t: {
  cycle_label?: string | null;
  residency: string;
  covers: string;
}) => `${t.cycle_label ?? ""}|${t.residency}|${t.covers}`;

/** `now` is injectable so "checked_at must not be in the future" is testable. */
export function bundleSchemaAt(now: Date) {
  return makeSchemas(now);
}

export function parseBundle(input: unknown, now: Date = new Date()) {
  return makeSchemas(now).safeParse(input);
}
