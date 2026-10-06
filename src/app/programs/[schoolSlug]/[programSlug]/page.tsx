import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getProgramDetail } from "@/domain/programs";
import { FactValue } from "@/components/FactValue";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import type { ClaimLike } from "@/lib/factState";
import { getSavedProgram } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { SaveProgramControl } from "@/components/SaveProgramControl";
import { requirementClaimFieldKey } from "@/domain/admin/requirements";

const STALE_AFTER_DAYS = Number(process.env.STALE_AFTER_DAYS ?? 180);

const REQUIREMENT_CLAIM_FIELD_KEYS = [
  "value_text",
  "value_number",
  "value_bool",
  "value_date",
] as const;

function resolveRequirementFact(
  req: {
    id: number;
    valueText: string | null;
    valueNumber: number | null;
    valueBool: boolean | null;
    valueDate: string | null;
  },
  claimFor: (
    subjectTable: string,
    subjectId: number,
    fieldKey: string,
  ) => ClaimLike | undefined,
): { value: string | number; claim: ClaimLike | undefined } {
  const fieldKey = requirementClaimFieldKey(req);
  const value =
    fieldKey === "value_text"
      ? req.valueText
      : fieldKey === "value_number"
        ? req.valueNumber
        : fieldKey === "value_bool"
          ? req.valueBool
            ? "yes"
            : "no"
          : req.valueDate;

  if (value !== null) {
    return {
      value,
      claim: claimFor("requirements", req.id, fieldKey),
    };
  }

  // No value_* column is populated: this requirement is either genuinely
  // unresearched (no claim row at all) or its state is `unknown` (a claim
  // row exists, but every value_* column is NULL by definition). We can't
  // tell which field_key an `unknown` claim was recorded under just from
  // the (empty) requirement row, so search all four candidates and use
  // whichever one actually resolves to a claim.
  for (const key of REQUIREMENT_CLAIM_FIELD_KEYS) {
    const claim = claimFor("requirements", req.id, key);
    if (claim) {
      return { value: "", claim };
    }
  }
  return { value: "", claim: undefined };
}

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ schoolSlug: string; programSlug: string }>;
}) {
  const { schoolSlug, programSlug } = await params;
  const detail = getProgramDetail(db, schoolSlug, programSlug);
  if (!detail) {
    notFound();
  }

  const now = new Date();
  const claimFor = (
    subjectTable: string,
    subjectId: number,
    fieldKey: string,
  ): ClaimLike | undefined =>
    detail.claims.get(`${subjectTable}:${subjectId}:${fieldKey}`);

  const [currentCycle, ...priorCycles] = detail.cycles;

  const savedProgram = getSavedProgram(db, detail.program.id);
  const hasChecklist =
    currentCycle !== undefined &&
    savedProgram !== null &&
    listChecklistsForSavedProgram(db, savedProgram.id).some(
      (c) => c.checklist.cycleId === currentCycle.cycle.id,
    );

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {detail.school.name} — {detail.program.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {detail.school.city}, {detail.school.state}
      </p>

      <SaveProgramControl
        programId={detail.program.id}
        schoolSlug={schoolSlug}
        programSlug={programSlug}
        savedProgram={savedProgram}
        hasChecklist={hasChecklist}
      />

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-zinc-500">Credential</dt>
        <dd>
          <FactValue
            value={detail.program.credential}
            claim={claimFor("programs", detail.program.id, "credential")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
        <dt className="text-zinc-500">Modality</dt>
        <dd>
          <FactValue
            value={detail.program.modality}
            claim={claimFor("programs", detail.program.id, "modality")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
        <dt className="text-zinc-500">Class size</dt>
        <dd>
          <FactValue
            value={detail.program.classSize}
            claim={claimFor("programs", detail.program.id, "class_size")}
            now={now}
            staleAfterDays={STALE_AFTER_DAYS}
          />
        </dd>
      </dl>

      {currentCycle && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">
            {currentCycle.cycle.cycleLabel} cycle
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-zinc-500">Deadline</dt>
            <dd>
              <FactValue
                value={currentCycle.cycle.deadlineDate}
                claim={claimFor(
                  "application_cycles",
                  currentCycle.cycle.id,
                  "deadline_date",
                )}
                now={now}
                staleAfterDays={STALE_AFTER_DAYS}
              />
            </dd>
          </dl>

          <h3 className="mt-6 text-base font-semibold">Requirements</h3>
          {REQUIREMENT_CATEGORIES.map((category) => {
            const inCategory = currentCycle.requirements.filter(
              (r) => r.category === category,
            );
            if (inCategory.length === 0) return null;

            return (
              <div key={category} className="mt-4">
                <h4 className="text-sm font-semibold capitalize">{category}</h4>
                <ul className="mt-1 space-y-1">
                  {inCategory.map((req) => {
                    const { value, claim } = resolveRequirementFact(
                      req,
                      claimFor,
                    );
                    return (
                      <li
                        key={req.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span>{req.label}</span>
                        <FactValue
                          value={value}
                          claim={claim}
                          now={now}
                          staleAfterDays={STALE_AFTER_DAYS}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {currentCycle.prerequisites.length > 0 && (
            <>
              <h3 className="mt-6 text-base font-semibold">
                Prerequisite courses
              </h3>
              <ul className="mt-1 space-y-1">
                {currentCycle.prerequisites.map((prereq) => (
                  <li key={prereq.id} className="text-sm">
                    {prereq.subject}
                    {prereq.minCredits ? ` — ${prereq.minCredits} credits` : ""}
                    {prereq.labRequired ? " (lab required)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {detail.tuitionEstimates.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Tuition</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {detail.tuitionEstimates.map((t) => (
              <li key={t.id}>
                {t.residency.replace("_", " ")}: $
                {(t.amountCents / 100).toLocaleString()} (
                {t.covers.replace("_", " ")}, {t.asOfYear})
              </li>
            ))}
          </ul>
        </section>
      )}

      {priorCycles.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">History</h2>
          <ul className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {priorCycles.map(({ cycle }) => (
              <li key={cycle.id}>{cycle.cycleLabel}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
