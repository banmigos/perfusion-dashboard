import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import { slugify } from "@/lib/slug";
import type { LegacyRecord } from "./schema";

export type Credential = "MS" | "MPS" | "MHS" | "BS" | "Certificate" | "Other";
type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export function normalizeCredential(raw: string): Credential {
  switch (raw) {
    case "MS":
      return "MS";
    case "MHS":
      return "MHS";
    case "MPS":
      return "MPS";
    case "Cert":
    case "Certificate":
    case "Certificate (via THI)":
      return "Certificate";
    default:
      throw new Error(`Unrecognized legacy credential spelling: "${raw}"`);
  }
}

export function parseCityState(raw: string): { city: string; state: string } {
  const lastComma = raw.lastIndexOf(",");
  if (lastComma === -1) {
    throw new Error(`Expected "City, ST" format, got: "${raw}"`);
  }
  const city = raw.slice(0, lastComma).trim();
  const state = raw.slice(lastComma + 1).trim();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error(
      `Expected a 2-letter state code, got "${state}" from "${raw}"`,
    );
  }
  return { city, state };
}

export interface ProgramImportPlan {
  legacyKey: string;
  school: { slug: string; name: string; city: string; state: string };
  program: {
    slug: string;
    name: string;
    credential: Credential;
    latitude: number;
    longitude: number;
    websiteUrl: string;
  };
  cycle: {
    cycleLabel: string;
    entryYear: number;
    deadlineType: "unknown" | "rolling";
  };
  source: { url: string; notes: string };
  knownClaims: Array<
    | { subject: "school"; fieldKey: "name" | "city" | "state" }
    | { subject: "program"; fieldKey: "credential" | "website_url" }
  >;
  requirements: Array<{
    category: RequirementCategory;
    label: string;
    unit: string | null;
    claimNote: string;
  }>;
  prerequisites: string[];
  unknownClaims: Array<{
    subject: "program" | "cycle";
    fieldKey: string;
    note: string;
  }>;
}

const CYCLE_LABEL = "2026-27";
const CYCLE_ENTRY_YEAR = 2027;

interface SpecialCase {
  deadlineType?: "rolling";
  shadowingFromNotes?: boolean;
  extraUnknownClaims?: ProgramImportPlan["unknownClaims"];
}

const SPECIAL_CASES: Record<string, SpecialCase> = {
  "University of Utah": { deadlineType: "rolling" },
  "Vanderbilt University Medical Center": {
    shadowingFromNotes: true,
    extraUnknownClaims: [
      {
        subject: "cycle",
        fieldKey: "closure_status",
        note: "Legacy 2025-26 dashboard: program marked CLOSED, not accepting applicants 2025-2027. Re-verify open/closed status for the 2026-27 cycle before treating this program as active.",
      },
    ],
  },
  "UTHealth Houston (McGovern Medical School)": { shadowingFromNotes: true },
  "Baylor College of Medicine": {
    extraUnknownClaims: [
      {
        subject: "program",
        fieldKey: "duplicate_check",
        note: 'Legacy triage flagged this program as sharing a URL/training site with "Texas Heart Institute" (see docs/research-workflow.md §8). Confirm whether Baylor is a distinct program or an affiliation of the Texas Heart Institute program before treating both as active, separate programs.',
      },
    ],
  },
};

export function buildProgramImportPlan(
  record: LegacyRecord,
): ProgramImportPlan {
  const { raw } = record;
  const credential = normalizeCredential(raw.degree);
  const { city, state } = parseCityState(raw.city);
  const special = SPECIAL_CASES[raw.name] ?? {};

  const requirements: ProgramImportPlan["requirements"] = [
    {
      category: "gpa",
      label: "Minimum overall GPA",
      unit: "gpa",
      claimNote: `legacy 2025-26 dashboard said ${raw.gpa}`,
    },
    {
      category: "test",
      label: "GRE required",
      unit: null,
      claimNote: `legacy 2025-26 dashboard said: GRE required = ${raw.gre}`,
    },
    {
      category: "other",
      label: "Tuition (unit and residency tier not yet determined)",
      unit: null,
      claimNote: `legacy 2025-26 dashboard said tuition = ${raw.tuition}; unit (total/per-year/per-credit) and residency tier undetermined`,
    },
  ];

  if (special.shadowingFromNotes && raw.notes) {
    requirements.push({
      category: "shadowing",
      label: "Observation / shadowing hours",
      unit: null,
      claimNote: `legacy 2025-26 dashboard notes: "${raw.notes}"`,
    });
  }

  return {
    legacyKey: raw.name,
    school: { slug: slugify(raw.name), name: raw.name, city, state },
    program: {
      slug: `perfusion-${credential.toLowerCase()}`,
      name: `${credential} in Cardiovascular Perfusion`,
      credential,
      latitude: raw.lat,
      longitude: raw.lng,
      websiteUrl: raw.url,
    },
    cycle: {
      cycleLabel: CYCLE_LABEL,
      entryYear: CYCLE_ENTRY_YEAR,
      deadlineType: special.deadlineType ?? "unknown",
    },
    source: {
      url: raw.url,
      notes:
        "URL carried over from the 2025-26 legacy capture (seed/legacy/2025-26-aistudio.json); not yet freshly fetched by this app.",
    },
    knownClaims: [
      { subject: "school", fieldKey: "name" },
      { subject: "school", fieldKey: "city" },
      { subject: "school", fieldKey: "state" },
      { subject: "program", fieldKey: "credential" },
      { subject: "program", fieldKey: "website_url" },
    ],
    requirements,
    prerequisites: raw.prereqs,
    unknownClaims: [
      {
        subject: "program",
        fieldKey: "class_size",
        note: `legacy 2025-26 dashboard said classSize = ${raw.classSize}`,
      },
      {
        subject: "cycle",
        fieldKey: "deadline_date",
        note: `legacy 2025-26 dashboard said: "${raw.deadline}" (describes the 2025-26 cycle; not valid for the 2026-27 cycle without re-sourcing)`,
      },
      ...(special.extraUnknownClaims ?? []),
    ],
  };
}

export function buildImportPlan(records: LegacyRecord[]): ProgramImportPlan[] {
  return records.map(buildProgramImportPlan);
}
