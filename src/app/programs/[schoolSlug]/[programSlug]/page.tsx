import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db/client";
import { getProgramDetail } from "@/domain/programs";
import { getApplicationRow } from "@/domain/applications";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { FactValue } from "@/components/FactValue";
import { FactCell } from "@/components/FactCell";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import type { ClaimLike } from "@/lib/factState";
import { resolveRequirementClaim } from "@/domain/admin/requirements";
import { STALE_AFTER_DAYS } from "@/lib/freshness";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { AddChecklistItemForm } from "@/components/AddChecklistItemForm";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import {
  FitNotesForm,
  GenerateChecklistButton,
  StopTrackingButton,
  TrackProgramButton,
} from "@/components/SaveProgramControl";
import { Meter } from "@/components/applications/Meter";
import { ProgramTimeline } from "@/components/applications/ProgramTimeline";
import { StatusControl } from "@/components/applications/StatusControl";
import { formatMonths, formatUsdCents } from "@/lib/programFormat";
import { categoryLabel, CATEGORY_ORDER } from "@/lib/categories";
import { daysBetween, shortDate, todayIso, urgencyOf } from "@/lib/deadlines";
import { cn } from "@/components/ui/cn";

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

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h2 className="font-semicondensed text-lg font-semibold text-fg">
          {title}
        </h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

const MODALITY_LABEL: Record<string, string> = {
  in_person: "In person",
  hybrid: "Hybrid",
  online: "Online",
};

export default async function ProgramDetailPage({
  params,
}: PageProps<"/programs/[schoolSlug]/[programSlug]">) {
  const { schoolSlug, programSlug } = await params;
  const detail = getProgramDetail(db, schoolSlug, programSlug);
  if (!detail) {
    notFound();
  }

  const now = new Date();
  const today = todayIso(now);
  const claimFor = (
    subjectTable: string,
    subjectId: number,
    fieldKey: string,
  ): ClaimLike | undefined =>
    detail.claims.get(`${subjectTable}:${subjectId}:${fieldKey}`);
  const fact = { now, staleAfterDays: STALE_AFTER_DAYS };

  const [currentCycle, ...priorCycles] = detail.cycles;
  const row = getApplicationRow(db, schoolSlug, programSlug);
  const saved = row?.saved ?? null;
  const checklist =
    saved && currentCycle
      ? listChecklistsForSavedProgram(db, saved.id).find(
          (c) => c.checklist.cycleId === currentCycle.cycle.id,
        )
      : undefined;

  const deadline = currentCycle?.cycle.deadlineDate ?? null;
  const deadlineClaim = currentCycle
    ? claimFor("application_cycles", currentCycle.cycle.id, "deadline_date")
    : undefined;
  const urgency = urgencyOf(deadline, saved?.status ?? null, today);
  const urgent = urgency === "at_risk" || urgency === "missed";
  const days = deadline ? daysBetween(today, deadline) : null;
  const target = {
    programId: detail.program.id,
    schoolSlug,
    programSlug,
    schoolName: detail.school.name,
  };

  // Checklist grouped by kind, application work first; untyped tasks last.
  const items = checklist?.items ?? [];
  const groups = [...CATEGORY_ORDER, null]
    .map((category) => ({
      category,
      items: items.filter((i) =>
        category === null
          ? !i.category || !CATEGORY_ORDER.includes(i.category as never)
          : i.category === category,
      ),
    }))
    .filter((g) => g.items.length > 0);

  const location = [detail.school.city, detail.school.state]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-10">
      <header>
        <Breadcrumb href="/programs" label="Programs" />
        <h1 className="font-condensed text-4xl leading-none font-semibold tracking-tight text-balance text-fg sm:text-5xl">
          {detail.school.name}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {detail.program.name}
          {location && `, ${location}`}
          {detail.program.websiteUrl && (
            <>
              {", "}
              <a
                href={detail.program.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                program website
              </a>
            </>
          )}
        </p>
      </header>

      {/* The application band: where this one stands, at a glance. */}
      <section
        aria-label="Application"
        className={cn(
          "flex flex-wrap items-center gap-x-10 gap-y-5 border-y border-line py-5",
          urgent && "border-l-2 border-l-arterial pl-4",
        )}
      >
        <div>
          <p className="text-xs text-muted">Deadline</p>
          {deadline ? (
            <p
              className={cn(
                "font-condensed text-4xl leading-tight font-semibold tabular-nums",
                urgent ? "text-arterial" : "text-fg",
              )}
            >
              {days! >= 0 ? `${days} days` : `${-days!} days ago`}
            </p>
          ) : null}
          <div className="text-sm">
            <FactCell
              variant="compact"
              value={
                deadline ? (
                  <span className="font-mono">
                    {shortDate(deadline, today)}
                  </span>
                ) : null
              }
              claim={deadlineClaim}
              {...fact}
            />
            {currentCycle && (
              <span className="ml-2 text-xs text-subtle">
                {currentCycle.cycle.cycleLabel} cycle
              </span>
            )}
          </div>
        </div>

        {saved ? (
          <>
            <div>
              <p className="mb-1 text-xs text-muted">Status</p>
              <StatusControl
                savedProgramId={saved.id}
                status={saved.status}
                target={target}
              />
            </div>
            <div className="min-w-40">
              <p className="mb-1 text-xs text-muted">Checklist</p>
              {row && row.progress.total > 0 ? (
                <Meter
                  done={row.progress.done}
                  total={row.progress.total}
                  label="Checklist progress"
                />
              ) : (
                <p className="text-sm text-subtle">
                  {checklist ? "No tasks yet" : "Not generated"}
                </p>
              )}
            </div>
            <div className="ml-auto">
              <StopTrackingButton
                programId={detail.program.id}
                schoolSlug={schoolSlug}
                programSlug={programSlug}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <TrackProgramButton
              programId={detail.program.id}
              schoolSlug={schoolSlug}
              programSlug={programSlug}
            />
            <p className="max-w-xs text-sm text-muted">
              Tracking gives this program a status, a checklist and fit notes.
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          <Section title="Timeline">
            <ProgramTimeline
              today={today}
              cycle={row?.cycle ?? null}
              deadline={deadline}
              urgent={urgent}
              status={saved?.status ?? null}
              statusChangedAt={saved?.statusChangedAt ?? null}
              items={items}
            />
          </Section>

          {saved && (
            <Section
              title="Checklist"
              aside={
                checklist && (
                  <Link href="/my" className="hover:text-fg hover:underline">
                    All checklists
                  </Link>
                )
              }
            >
              {!checklist ? (
                <div className="flex flex-wrap items-center gap-4">
                  <p className="max-w-md text-sm text-muted">
                    Start from this cycle&rsquo;s published requirements, then
                    add your own letters, essays and transcripts.
                  </p>
                  {currentCycle && (
                    <GenerateChecklistButton savedProgramId={saved.id} />
                  )}
                </div>
              ) : (
                <>
                  {groups.length === 0 && (
                    <p className="text-sm text-muted">
                      The checklist is empty. Add a task below.
                    </p>
                  )}
                  {groups.map((g) => (
                    <div key={g.category ?? "untyped"} className="mb-4">
                      <h3 className="text-sm font-medium text-muted">
                        {g.category ? categoryLabel(g.category) : "Other tasks"}
                      </h3>
                      <ul className="divide-y divide-line">
                        {g.items.map((item) => (
                          <ChecklistItemRow key={item.id} item={item} />
                        ))}
                      </ul>
                    </div>
                  ))}
                  <AddChecklistItemForm checklistId={checklist.checklist.id} />
                </>
              )}
            </Section>
          )}

          {currentCycle && (
            <Section
              title="Official requirements"
              aside={`${currentCycle.cycle.cycleLabel} cycle, as published`}
            >
              {currentCycle.requirements.length === 0 &&
              currentCycle.prerequisites.length === 0 ? (
                <p className="text-sm text-muted">
                  No requirements recorded for this cycle yet.
                </p>
              ) : null}
              {REQUIREMENT_CATEGORIES.map((category) => {
                const inCategory = currentCycle.requirements.filter(
                  (r) => r.category === category,
                );
                if (inCategory.length === 0) return null;

                return (
                  <div key={category} className="mb-4">
                    <h3 className="text-sm font-medium text-muted">
                      {categoryLabel(category)}
                    </h3>
                    <ul className="divide-y divide-line">
                      {inCategory.map((req) => {
                        const { value, claim } = resolveRequirementFact(
                          req,
                          claimFor,
                        );
                        return (
                          <li
                            key={req.id}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm"
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
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-muted">
                    Prerequisite courses
                  </h3>
                  <ul className="divide-y divide-line">
                    {currentCycle.prerequisites.map((prereq) => (
                      <li key={prereq.id} className="py-2 text-sm text-fg">
                        {prereq.subject}
                        {prereq.minCredits
                          ? `, ${prereq.minCredits} credits`
                          : ""}
                        {prereq.labRequired ? ", lab required" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}
        </div>

        <aside className="space-y-10">
          {saved && (
            <Section title="Fit notes">
              <FitNotesForm
                savedProgram={{
                  id: saved.id,
                  priority: saved.priority,
                  personalNote: saved.note,
                }}
                schoolSlug={schoolSlug}
                programSlug={programSlug}
              />
            </Section>
          )}

          <Section title="Program">
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
              <dt className="text-muted">Credential</dt>
              <dd>
                <FactValue
                  value={detail.program.credential}
                  claim={claimFor("programs", detail.program.id, "credential")}
                  {...fact}
                />
              </dd>
              <dt className="text-muted">Length</dt>
              <dd>
                <FactValue
                  value={
                    detail.program.programLengthMonths === null
                      ? null
                      : formatMonths(detail.program.programLengthMonths)
                  }
                  claim={claimFor(
                    "programs",
                    detail.program.id,
                    "program_length_months",
                  )}
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
              <dt className="text-muted">Modality</dt>
              <dd>
                <FactValue
                  value={
                    detail.program.modality &&
                    (MODALITY_LABEL[detail.program.modality] ??
                      detail.program.modality)
                  }
                  claim={claimFor("programs", detail.program.id, "modality")}
                  {...fact}
                />
              </dd>
              <dt className="text-muted">Director</dt>
              <dd>
                <FactValue
                  value={detail.program.directorName}
                  claim={claimFor(
                    "programs",
                    detail.program.id,
                    "director_name",
                  )}
                  {...fact}
                />
              </dd>
              <dt className="text-muted">Accreditation</dt>
              <dd>
                <FactValue
                  value={detail.program.accreditationStatus}
                  claim={claimFor(
                    "programs",
                    detail.program.id,
                    "accreditation_status",
                  )}
                  {...fact}
                />
              </dd>
            </dl>
          </Section>

          {detail.tuitionEstimates.length > 0 && (
            <Section title="Tuition">
              <ul className="divide-y divide-line">
                {detail.tuitionEstimates.map((t, i) => (
                  <li key={t.id} className="py-2 text-sm">
                    <FactCell
                      variant="detail"
                      value={formatUsdCents(t.amountCents)}
                      claim={claimFor("tuition_estimates", t.id, "record")}
                      {...fact}
                    />
                    <span className="block text-xs text-subtle">
                      {row?.tuition[i]?.shortLabel ??
                        t.residency.replace("_", " ")}
                      , {t.asOfYear}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {priorCycles.length > 0 && (
            <Section title="Earlier cycles">
              <ul className="flex flex-wrap gap-2 font-mono text-xs text-muted">
                {priorCycles.map(({ cycle }) => (
                  <li key={cycle.id}>{cycle.cycleLabel}</li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}
