import Link from "next/link";
import { db } from "@/db/client";
import {
  listApplicationRows,
  type ApplicationRow,
} from "@/domain/applications";
import { listDueItems } from "@/domain/checklists";
import { DeadlineStrip } from "@/components/applications/DeadlineStrip";
import { StatusGlyph } from "@/components/applications/StatusGlyph";
import {
  StatusControl,
  TrackButton,
} from "@/components/applications/StatusControl";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  STAGE_BG,
  shortSchoolName,
} from "@/components/applications/status";
import { cn } from "@/components/ui/cn";
import {
  AT_RISK_DAYS,
  HORIZON_DAYS,
  dateToIso,
  daysBetween,
  isSubmitted,
  relativeDays,
  shortDate,
  todayIso,
  urgencyOf,
} from "@/lib/deadlines";
import { taskTitle } from "@/lib/taskTitle";

export const dynamic = "force-dynamic";

const programHref = (r: ApplicationRow) =>
  `/programs/${r.schoolSlug}/${r.programSlug}`;

const target = (r: ApplicationRow) => ({
  programId: r.programId,
  schoolSlug: r.schoolSlug,
  programSlug: r.programSlug,
  schoolName: r.schoolName,
});

function Section({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h2 className="font-semicondensed text-lg font-semibold text-fg">
          {title}
        </h2>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The deadline credibility flag: a date that isn't verified says so. */
function UnverifiedFlag({ row }: { row: ApplicationRow }) {
  const claim = row.deadline.claim;
  if (!claim || (claim.verification === "verified" && claim.state === "known"))
    return null;
  return <span className="text-xs text-warn">unverified</span>;
}

export default function OverviewPage() {
  const now = new Date();
  const today = todayIso(now);
  const rows = listApplicationRows(db);
  const dueItems = listDueItems(db);

  const dated = rows
    .filter((r) => r.deadline.value !== null)
    .map((r) => ({
      row: r,
      date: r.deadline.value!,
      days: daysBetween(today, r.deadline.value!),
      urgency: urgencyOf(r.deadline.value, r.saved?.status ?? null, today),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const tracked = rows.filter((r) => r.saved);
  const upcoming = dated.filter((d) => d.days >= 0);

  // The countdown leads with the nearest application still to be sent;
  // with nothing tracked, the nearest deadline of any program.
  const lead =
    upcoming.find((d) => d.row.saved && !isSubmitted(d.row.saved.status)) ??
    upcoming[0];

  const atRisk = dated.filter(
    (d) => d.urgency === "missed" || d.urgency === "at_risk",
  );
  const overdueTasks = dueItems.filter(
    (d) => d.item.dueAt && dateToIso(d.item.dueAt) < today,
  );

  const markers = upcoming
    .filter((d) => d.days <= HORIZON_DAYS)
    .map((d) => ({
      key: `${d.row.schoolSlug}/${d.row.programSlug}`,
      date: d.date,
      label: shortSchoolName(d.row.schoolName),
      href: programHref(d.row),
      status: d.row.saved?.status ?? null,
      atRisk: d.urgency === "at_risk",
      lead: d === lead,
    }));

  const counts = APPLICATION_STATUSES.map((s) => ({
    status: s,
    n: tracked.filter((r) => r.saved!.status === s).length,
  }));

  const leadUrgent = lead?.urgency === "at_risk";
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${today}T12:00:00Z`));
  const cycleLabel = rows.find((r) => r.deadline.cycleLabel)?.deadline
    .cycleLabel;

  return (
    <div className="space-y-12">
      <h1 className="sr-only">Overview</h1>

      {/* Countdown: the one loud thing on the page. */}
      <section aria-label="Next deadline">
        <p className="text-sm text-muted">
          {weekday}
          {cycleLabel && (
            <span className="text-subtle">, {cycleLabel} cycle</span>
          )}
        </p>

        {lead ? (
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
            <p
              className={cn(
                "font-condensed flex items-baseline gap-3 leading-[0.8] font-semibold tracking-tight",
                leadUrgent ? "text-arterial" : "text-fg",
              )}
            >
              <span className="text-[7rem] tabular-nums sm:text-[10rem]">
                {lead.days}
              </span>
              <span className="text-3xl sm:text-4xl">
                {lead.days === 1 ? "day" : "days"}
              </span>
            </p>
            <div className="max-w-md min-w-0 pb-2">
              <p className="text-sm text-muted">
                until{" "}
                <Link
                  href={programHref(lead.row)}
                  className="font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-accent"
                >
                  {lead.row.schoolName}
                </Link>{" "}
                closes
              </p>
              <p className="mt-1 text-sm text-muted">
                {lead.row.programName}, due{" "}
                <span className="font-mono text-fg">
                  {shortDate(lead.date, today)}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {lead.row.saved ? (
                  <StatusControl
                    savedProgramId={lead.row.saved.id}
                    status={lead.row.saved.status}
                    target={target(lead.row)}
                  />
                ) : (
                  <>
                    <TrackButton target={target(lead.row)} />
                    <span className="text-xs text-subtle">
                      Not tracking this program
                    </span>
                  </>
                )}
                <UnverifiedFlag row={lead.row} />
              </div>
            </div>
          </div>
        ) : (
          <p className="font-condensed mt-4 text-4xl font-semibold text-fg">
            No deadlines ahead.
            <span className="mt-2 block font-sans text-sm font-normal text-muted">
              Every program on record has either closed for this cycle or has no
              published date. Add the next cycle&rsquo;s dates in Admin.
            </span>
          </p>
        )}

        {markers.length > 0 && (
          <div className="mt-8">
            <DeadlineStrip
              today={today}
              horizon={HORIZON_DAYS}
              markers={markers}
            />
          </div>
        )}
      </section>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-12">
          <Section
            title="At risk"
            aside={`Unsubmitted, due within ${AT_RISK_DAYS} days or past due`}
          >
            {atRisk.length === 0 && overdueTasks.length === 0 ? (
              <p className="text-sm text-muted">
                {tracked.length === 0
                  ? "Nothing is at risk because nothing is tracked yet. Track the programs you’re applying to and their deadlines will be watched here."
                  : "Nothing at risk. No tracked application is close to or past its deadline unsubmitted, and no task is overdue."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {atRisk.map((d) => (
                  <li
                    key={d.row.programId}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 border-arterial py-3 pl-3"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <Link
                        href={programHref(d.row)}
                        className="font-medium text-fg hover:underline"
                      >
                        {d.row.schoolName}
                      </Link>
                      <p className="text-sm text-muted">
                        {d.urgency === "missed"
                          ? `Deadline passed ${shortDate(d.date, today)}, ${relativeDays(d.days)}`
                          : `Due ${shortDate(d.date, today)}, ${relativeDays(d.days)}`}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-arterial tabular-nums">
                      {d.days < 0 ? `${-d.days}d late` : `${d.days}d left`}
                    </span>
                    {d.row.saved && (
                      <StatusControl
                        savedProgramId={d.row.saved.id}
                        status={d.row.saved.status}
                        target={target(d.row)}
                      />
                    )}
                  </li>
                ))}
                {overdueTasks.map(({ item, school }) => (
                  <li
                    key={`task-${item.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 border-arterial py-3 pl-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-fg">{taskTitle(item)}</p>
                      <p className="text-sm text-muted">
                        Task for {school.name}
                      </p>
                    </div>
                    <span className="font-mono text-sm text-arterial tabular-nums">
                      due {shortDate(dateToIso(item.dueAt!), today)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="Next deadlines"
            aside={
              <Link href="/timeline" className="hover:text-fg hover:underline">
                Full timeline
              </Link>
            }
          >
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted">
                No upcoming deadlines on record.
              </p>
            ) : (
              <ol className="divide-y divide-line">
                {upcoming.slice(0, 5).map((d) => (
                  <li
                    key={d.row.programId}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                  >
                    <div className="font-mono leading-tight">
                      <span
                        className={cn(
                          "block text-lg tabular-nums",
                          d.urgency === "at_risk" ? "text-arterial" : "text-fg",
                        )}
                      >
                        {d.days}d
                      </span>
                      <span className="text-xs text-muted">
                        {shortDate(d.date, today)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={programHref(d.row)}
                        className="block truncate font-medium text-fg hover:underline"
                      >
                        {d.row.schoolName}
                      </Link>
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <span className="truncate">{d.row.programName}</span>
                        <UnverifiedFlag row={d.row} />
                      </p>
                    </div>
                    <div className="col-start-2 sm:col-start-auto">
                      {d.row.saved ? (
                        <StatusControl
                          savedProgramId={d.row.saved.id}
                          status={d.row.saved.status}
                          target={target(d.row)}
                        />
                      ) : (
                        <TrackButton target={target(d.row)} />
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="space-y-12">
          <Section
            title="Pipeline"
            aside={`${tracked.length} tracked of ${rows.length}`}
          >
            {tracked.length === 0 ? (
              <p className="text-sm text-muted">
                No applications tracked. Use Track on any program to add it here
                as Not started.
              </p>
            ) : (
              <>
                {/* One segmented gauge, read left to right like flow. */}
                <div
                  className="flex h-3 gap-0.5 overflow-hidden rounded-sm"
                  aria-hidden="true"
                >
                  {counts
                    .filter((c) => c.n > 0)
                    .map((c) => (
                      <div
                        key={c.status}
                        className={cn(
                          "transition-[flex-grow] duration-500",
                          STAGE_BG[c.status],
                        )}
                        style={{ flexGrow: c.n }}
                      />
                    ))}
                </div>
                <ul className="mt-4 space-y-1.5">
                  {counts.map((c) => (
                    <li
                      key={c.status}
                      className="flex items-center gap-2 text-sm"
                    >
                      <StatusGlyph status={c.status} />
                      <span
                        className={cn(
                          "flex-1",
                          c.n === 0 ? "text-subtle" : "text-fg",
                        )}
                      >
                        {APPLICATION_STATUS_LABEL[c.status]}
                      </span>
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          c.n === 0 ? "text-subtle" : "text-fg",
                        )}
                      >
                        {c.n}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          <Section
            title="Open tasks"
            aside={
              <Link href="/my" className="hover:text-fg hover:underline">
                All checklists
              </Link>
            }
          >
            {dueItems.length === 0 ? (
              <p className="text-sm text-muted">
                No open tasks. Generate a checklist from a tracked
                program&rsquo;s page, then add letters, essays and transcripts
                to it.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {dueItems.slice(0, 6).map(({ item, school }) => (
                  <li key={item.id} className="text-sm">
                    <p className="text-fg">{taskTitle(item)}</p>
                    <p className="flex justify-between gap-3 text-muted">
                      <span className="truncate">{school.name}</span>
                      {item.dueAt && (
                        <span className="font-mono text-xs tabular-nums">
                          {shortDate(dateToIso(item.dueAt), today)}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
                {dueItems.length > 6 && (
                  <li className="text-xs text-muted">
                    and {dueItems.length - 6} more
                  </li>
                )}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
