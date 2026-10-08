import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getProgramDetail } from "@/domain/programs";
import { FactValue } from "@/components/FactValue";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import type { ClaimLike } from "@/lib/factState";
import { getSavedProgram } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { SaveProgramControl } from "@/components/SaveProgramControl";
import { resolveRequirementClaim } from "@/domain/admin/requirements";
import { STALE_AFTER_DAYS } from "@/lib/freshness";
import { FactCell } from "@/components/FactCell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatUsdCents } from "@/lib/programFormat";

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
  const { fieldKey, claim } = resolveRequirementClaim(req, (key) =>
    claimFor("requirements", req.id, key),
  );
  // An empty requirement (unresearched, or unknown/not_published) has a
  // NULL in every column, so value is "" and FactValue renders the claim's
  // state instead. Never coerce a NULL bool to "no".
  const value =
    fieldKey === "value_number"
      ? req.valueNumber
      : fieldKey === "value_bool"
        ? req.valueBool === null
          ? null
          : req.valueBool
            ? "yes"
            : "no"
        : fieldKey === "value_date"
          ? req.valueDate
          : req.valueText;
  return { value: value ?? "", claim };
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

  const fact = { now, staleAfterDays: STALE_AFTER_DAYS };

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title={`${detail.school.name} — ${detail.program.name}`}
          description={
            [detail.school.city, detail.school.state]
              .filter(Boolean)
              .join(", ") || undefined
          }
        />
        <SaveProgramControl
          programId={detail.program.id}
          schoolSlug={schoolSlug}
          programSlug={programSlug}
          savedProgram={savedProgram}
          hasChecklist={hasChecklist}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Program</h2>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted">Credential</dt>
          <dd>
            <FactValue
              value={detail.program.credential}
              claim={claimFor("programs", detail.program.id, "credential")}
              {...fact}
            />
          </dd>
          <dt className="text-muted">Director</dt>
          <dd>
            <FactValue
              value={detail.program.directorName}
              claim={claimFor("programs", detail.program.id, "director_name")}
              {...fact}
            />
          </dd>
          <dt className="text-muted">Modality</dt>
          <dd>
            <FactValue
              value={detail.program.modality}
              claim={claimFor("programs", detail.program.id, "modality")}
              {...fact}
            />
          </dd>
          <dt className="text-muted">Class size</dt>
          <dd>
            <FactValue
              value={detail.program.classSize}
              claim={claimFor("programs", detail.program.id, "class_size")}
              {...fact}
            />
          </dd>
        </dl>
      </Card>

      {currentCycle && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-base font-semibold text-fg">
              Application cycle
            </h2>
            <Badge tone="accent">{currentCycle.cycle.cycleLabel}</Badge>
          </div>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted">Deadline</dt>
            <dd>
              <FactValue
                value={currentCycle.cycle.deadlineDate}
                claim={claimFor(
                  "application_cycles",
                  currentCycle.cycle.id,
                  "deadline_date",
                )}
                {...fact}
              />
            </dd>
          </dl>

          <h3 className="mt-6 mb-1 text-sm font-semibold text-fg">
            Requirements
          </h3>
          {REQUIREMENT_CATEGORIES.map((category) => {
            const inCategory = currentCycle.requirements.filter(
              (r) => r.category === category,
            );
            if (inCategory.length === 0) return null;

            return (
              <div key={category} className="mt-4">
                <h4 className="text-xs font-medium tracking-wide text-muted uppercase">
                  {category}
                </h4>
                <ul className="mt-1 divide-y divide-line">
                  {inCategory.map((req) => {
                    const { value, claim } = resolveRequirementFact(
                      req,
                      claimFor,
                    );
                    return (
                      <li
                        key={req.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                      >
                        <span className="text-fg">{req.label}</span>
                        <FactValue value={value} claim={claim} {...fact} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {currentCycle.prerequisites.length > 0 && (
            <>
              <h3 className="mt-6 mb-1 text-sm font-semibold text-fg">
                Prerequisite courses
              </h3>
              <ul className="divide-y divide-line">
                {currentCycle.prerequisites.map((prereq) => (
                  <li key={prereq.id} className="py-2 text-sm text-fg">
                    {prereq.subject}
                    {prereq.minCredits ? ` — ${prereq.minCredits} credits` : ""}
                    {prereq.labRequired ? " (lab required)" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}

      {detail.tuitionEstimates.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-fg">Tuition</h2>
          <ul className="divide-y divide-line">
            {detail.tuitionEstimates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <span className="text-fg capitalize">
                  {t.residency.replace("_", " ")}
                </span>
                <FactCell
                  variant="detail"
                  value={formatUsdCents(t.amountCents)}
                  claim={claimFor("tuition_estimates", t.id, "amount_cents")}
                  {...fact}
                />
                <span className="text-xs text-subtle">
                  {t.covers.replace("_", " ")} · {t.asOfYear}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {priorCycles.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-base font-semibold text-fg">History</h2>
          <ul className="flex flex-wrap gap-2">
            {priorCycles.map(({ cycle }) => (
              <li key={cycle.id}>
                <Badge>{cycle.cycleLabel}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
