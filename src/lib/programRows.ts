import type { ProgramDetail } from "@/domain/programs";
import { resolveRequirementClaim } from "@/domain/admin/requirements";
import type { ClaimLike } from "@/lib/factState";
import { formatGpa, formatMonths, formatUsdCents } from "@/lib/programFormat";

export type FactField = {
  value: string | null;
  claim: ClaimLike | undefined;
};

export type TuitionField = FactField & { label: string };

export type ProgramTableRow = {
  schoolSlug: string;
  programSlug: string;
  schoolName: string;
  programName: string;
  location: string | null;
  credential: FactField;
  length: FactField;
  deadline: FactField & { cycleLabel: string | null };
  gpa: FactField;
  tuition: TuitionField[];
};

/**
 * Flatten a program's detail (an existing domain query) into table cells.
 * Values come straight from typed columns; nothing is inferred or backfilled.
 * The deadline and GPA are read from the newest cycle, as on the detail page.
 */
export function buildProgramRow(detail: ProgramDetail): ProgramTableRow {
  const claimFor = (
    subjectTable: string,
    subjectId: number,
    fieldKey: string,
  ): ClaimLike | undefined =>
    detail.claims.get(`${subjectTable}:${subjectId}:${fieldKey}`);

  const { school, program } = detail;
  const current = detail.cycles[0];

  const location =
    [school.city, school.state].filter(Boolean).join(", ") || null;

  const gpaRequirements = (current?.requirements ?? [])
    .filter((r) => r.category === "gpa")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const gpaRequirement =
    gpaRequirements.find((r) => /overall/i.test(r.label)) ?? gpaRequirements[0];

  let gpa: FactField = { value: null, claim: undefined };
  if (gpaRequirement) {
    const { claim } = resolveRequirementClaim(gpaRequirement, (key) =>
      claimFor("requirements", gpaRequirement.id, key),
    );
    gpa = {
      value:
        gpaRequirement.valueNumber === null
          ? null
          : formatGpa(gpaRequirement.valueNumber),
      claim,
    };
  }

  return {
    schoolSlug: school.slug,
    programSlug: program.slug,
    schoolName: school.name,
    programName: program.name,
    location,
    credential: {
      value: program.credential,
      claim: claimFor("programs", program.id, "credential"),
    },
    length: {
      value:
        program.programLengthMonths === null
          ? null
          : formatMonths(program.programLengthMonths),
      claim: claimFor("programs", program.id, "program_length_months"),
    },
    deadline: {
      value: current?.cycle.deadlineDate ?? null,
      claim: current
        ? claimFor("application_cycles", current.cycle.id, "deadline_date")
        : undefined,
      cycleLabel: current?.cycle.cycleLabel ?? null,
    },
    gpa,
    tuition: detail.tuitionEstimates.map((t) => ({
      label: `${t.residency.replace("_", " ")} · ${t.covers.replace("_", " ")} · ${t.asOfYear}`,
      value: formatUsdCents(t.amountCents),
      claim: claimFor("tuition_estimates", t.id, "amount_cents"),
    })),
  };
}
