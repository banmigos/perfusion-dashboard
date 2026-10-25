import Link from "next/link";
import { db } from "@/db/client";
import {
  listApplicationRows,
  type ApplicationRow,
} from "@/domain/applications";
import { StatusGlyph } from "@/components/applications/StatusGlyph";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  STAGE_BG,
  shortSchoolName,
} from "@/components/applications/status";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/components/ui/cn";
import {
  dateToIso,
  daysBetween,
  relativeDays,
  shortDate,
  todayIso,
  urgencyOf,
  type Urgency,
} from "@/lib/deadlines";

export const dynamic = "force-dynamic";

type Entry = {
  row: ApplicationRow;
  deadline: string;
  urgency: Urgency;
  taskDates: string[];
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function nextMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return m === 12
    ? `${y! + 1}-01-01`
    : `${y}-${String(m! + 1).padStart(2, "0")}-01`;
}

function Marker({ entry }: { entry: Entry }) {
  const status = entry.row.saved?.status ?? null;
  const urgent = entry.urgency === "at_risk" || entry.urgency === "missed";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block size-3 rounded-full ring-2 ring-surface",
        status === null
          ? "border-[1.5px] border-muted bg-surface"
          : urgent
            ? "bg-arterial"
            : STAGE_BG[status],
      )}
    />
  );
}

function describe(entry: Entry, today: string): string {
  const status = entry.row.saved
    ? APPLICATION_STATUS_LABEL[entry.row.saved.status]
    : "not tracking";
  const days = daysBetween(today, entry.deadline);
  return `deadline ${shortDate(entry.deadline, today)}, ${relativeDays(days)}, ${status}`;
}

export default async function TimelinePage({
  searchParams,
}: PageProps<"/timeline">) {
  const { show } = await searchParams;
  const trackedOnly = show === "tracked";
  const today = todayIso(new Date());
  const rows = listApplicationRows(db);

  const entries: Entry[] = rows
    .filter((r) => r.deadline.value !== null && (!trackedOnly || r.saved))
    .map((r) => ({
      row: r,
      deadline: r.deadline.value!,
      urgency: urgencyOf(r.deadline.value, r.saved?.status ?? null, today),
      taskDates: r.items
        .filter((i) => i.dueAt && i.status !== "done" && i.status !== "skipped")
        .map((i) => dateToIso(i.dueAt!)),
    }))
    .sort(
      (a, b) =>
        a.deadline.localeCompare(b.deadline) ||
        a.row.schoolName.localeCompare(b.row.schoolName),
    );
  const undated = rows.filter(
    (r) => r.deadline.value === null && (!trackedOnly || r.saved),
  );

  // The axis spans whole months from the earliest date shown (or today)
  // through the latest.
  const allDates = [
    today,
    ...entries.flatMap((e) => [e.deadline, ...e.taskDates]),
  ].sort();
  const axisStart = monthStart(allDates[0]!);
  const axisEnd = nextMonth(allDates[allDates.length - 1]!);
  const span = daysBetween(axisStart, axisEnd);
  const at = (iso: string) => (daysBetween(axisStart, iso) / span) * 100;
  const months: string[] = [];
  for (let m = axisStart; m < axisEnd; m = nextMonth(m)) months.push(m);
  const todayPct = at(today);

  const byMonth = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.deadline.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
  }

  const toggle = (value: "all" | "tracked", label: string) => (
    <Link
      href={value === "tracked" ? "/timeline?show=tracked" : "/timeline"}
      aria-current={(value === "tracked") === trackedOnly ? "page" : undefined}
      className={cn(
        "rounded px-3 py-1 text-sm transition-colors",
        (value === "tracked") === trackedOnly
          ? "bg-raised font-medium text-fg"
          : "text-muted hover:text-fg",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Timeline"
        description="Every deadline in the cycle, shaded by where each application stands."
        actions={
          <nav
            aria-label="Programs shown"
            className="flex rounded-md border border-line bg-surface p-0.5"
          >
            {toggle("all", "All programs")}
            {toggle("tracked", "Tracked")}
          </nav>
        }
      />

      <ul className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
        {APPLICATION_STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <StatusGlyph status={s} />
            {APPLICATION_STATUS_LABEL[s]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <StatusGlyph status={null} />
          Not tracking
        </li>
        <li className="flex items-center gap-1.5">
          <span className="block size-2.5 rounded-full bg-arterial" />
          At risk or missed
        </li>
      </ul>

      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-semicondensed text-lg font-semibold text-fg">
            {trackedOnly
              ? "No tracked program has a deadline on record."
              : "No deadlines on record."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {trackedOnly
              ? "Track programs from the Programs page to see them here."
              : "Deadlines appear once a cycle's dates are recorded in Admin."}
          </p>
        </div>
      ) : (
        <>
          {/* Wide screens: one row per program across the cycle's months. */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[11rem_minmax(0,1fr)] border-b border-line-strong text-xs text-muted">
              <span />
              <div className="relative h-6">
                {months.map((m) => (
                  <span
                    key={m}
                    className="absolute top-0 border-l border-line-strong pl-1"
                    style={{ left: `${at(m)}%` }}
                  >
                    {MONTH_NAMES[Number(m.slice(5, 7)) - 1]!.slice(0, 3)}
                    {m.slice(5, 7) === "01" && (
                      <span className="ml-1 font-mono">{m.slice(0, 4)}</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative">
              {/* Month rules at their true positions (months differ in length),
                under the rows. */}
              <div
                className="pointer-events-none absolute inset-y-0 right-0 left-[11rem]"
                aria-hidden="true"
              >
                {months.map((m) => (
                  <div
                    key={m}
                    className="absolute inset-y-0 w-px bg-grid"
                    style={{ left: `${at(m)}%` }}
                  />
                ))}
              </div>
              <ol className="relative">
                {entries.map((e) => {
                  const urgent =
                    e.urgency === "at_risk" || e.urgency === "missed";
                  return (
                    <li
                      key={e.row.programId}
                      className="group grid grid-cols-[11rem_minmax(0,1fr)] items-center border-b border-line hover:bg-raised/40"
                    >
                      <Link
                        href={`/programs/${e.row.schoolSlug}/${e.row.programSlug}`}
                        className={cn(
                          "relative truncate py-1.5 pr-3 text-sm hover:underline",
                          e.row.saved ? "font-medium text-fg" : "text-muted",
                          urgent && "text-arterial",
                        )}
                        title={e.row.schoolName}
                      >
                        {shortSchoolName(e.row.schoolName)}
                        <span className="sr-only">, {describe(e, today)}</span>
                      </Link>
                      <div className="relative h-8" aria-hidden="true">
                        {/* Closed time: everything before today, faintly hatched. */}
                        <div
                          className="absolute inset-y-0 left-0 opacity-60"
                          style={{
                            width: `${todayPct}%`,
                            backgroundImage:
                              "repeating-linear-gradient(135deg, var(--grid) 0 1px, transparent 1px 6px)",
                          }}
                        />
                        {e.taskDates.map((d, i) => (
                          <span
                            key={`${d}-${i}`}
                            className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-accent"
                            style={{ left: `${at(d)}%` }}
                          />
                        ))}
                        <span
                          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${at(e.deadline)}%` }}
                        >
                          <Marker entry={e} />
                        </span>
                        <span
                          className={cn(
                            "absolute top-1/2 ml-2.5 -translate-y-1/2 font-mono text-xs whitespace-nowrap",
                            urgent ? "text-arterial" : "text-subtle",
                            at(e.deadline) > 85 &&
                              "-translate-x-[calc(100%+1.25rem)]",
                          )}
                          style={{ left: `${at(e.deadline)}%` }}
                        >
                          {shortDate(e.deadline, today)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {/* Today runs through every row, above the markers. */}
              <div
                className="pointer-events-none absolute inset-y-0 right-0 left-[11rem]"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 w-0.5 bg-fg"
                  style={{ left: `${todayPct}%` }}
                >
                  <span className="absolute -bottom-6 left-1 text-xs font-semibold whitespace-nowrap text-fg">
                    Today
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-8 text-xs text-subtle">
              Thin ticks mark open checklist tasks with due dates.
            </p>
          </div>

          {/* Phones: the same deadlines as an agenda, month by month. */}
          <div className="space-y-8 md:hidden">
            {[...byMonth.entries()].map(([month, list]) => (
              <section key={month} aria-label={month}>
                <h2 className="font-semicondensed mb-2 border-b border-line pb-1 text-lg font-semibold">
                  {MONTH_NAMES[Number(month.slice(5, 7)) - 1]}{" "}
                  <span className="font-mono text-sm font-normal text-muted">
                    {month.slice(0, 4)}
                  </span>
                </h2>
                <ol className="space-y-2">
                  {list.map((e) => {
                    const urgent =
                      e.urgency === "at_risk" || e.urgency === "missed";
                    const days = daysBetween(today, e.deadline);
                    return (
                      <li
                        key={e.row.programId}
                        className={cn(
                          "grid grid-cols-[3.5rem_1rem_minmax(0,1fr)] items-center gap-2",
                          days < 0 && "opacity-60",
                        )}
                      >
                        <span className="font-mono text-sm">
                          {shortDate(e.deadline)}
                        </span>
                        <Marker entry={e} />
                        <Link
                          href={`/programs/${e.row.schoolSlug}/${e.row.programSlug}`}
                          className={cn(
                            "relative truncate text-sm hover:underline",
                            urgent ? "text-arterial" : "text-fg",
                          )}
                        >
                          {e.row.schoolName}
                          <span className="sr-only">
                            , {describe(e, today)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </>
      )}

      {undated.length > 0 && (
        <section aria-label="No deadline on record" className="mt-10">
          <h2 className="font-semicondensed mb-2 text-lg font-semibold">
            No deadline on record
          </h2>
          <p className="mb-3 text-sm text-muted">
            Not on the chart: the school publishes no date, uses rolling
            admission, or hasn&rsquo;t been researched for this cycle.
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            {undated.map((r) => (
              <li key={r.programId}>
                <Link
                  href={`/programs/${r.schoolSlug}/${r.programSlug}`}
                  className="text-muted hover:text-fg hover:underline"
                >
                  {r.schoolName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
