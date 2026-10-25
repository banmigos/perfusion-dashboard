import { APPLICATION_STATUS_LABEL, type ApplicationStatus } from "./status";
import {
  dateToIso,
  relativeDays,
  daysBetween,
  shortDate,
  todayIso,
} from "@/lib/deadlines";
import { taskTitle } from "@/lib/taskTitle";
import { cn } from "../ui/cn";

type Event = {
  key: string;
  date: string;
  label: string;
  kind: "opens" | "deadline" | "decision" | "task" | "status" | "today";
  /** Finished work (a done task) reads as settled, not pending. */
  settled?: boolean;
};

/**
 * Everything dated about one application on a single vertical rail: the
 * cycle's published dates, the user's task due dates, and when the status
 * last moved, with today marked in place.
 */
export function ProgramTimeline({
  today,
  cycle,
  deadline,
  urgent,
  status,
  statusChangedAt,
  items,
}: {
  today: string;
  cycle: { opensDate: string | null; decisionDate: string | null } | null;
  deadline: string | null;
  urgent: boolean;
  status: ApplicationStatus | null;
  statusChangedAt: Date | null;
  items: {
    id: number;
    title: string;
    category: string | null;
    derivedFromRequirementId: number | null;
    dueAt: Date | null;
    status: string;
  }[];
}) {
  const events: Event[] = [];
  if (cycle?.opensDate)
    events.push({
      key: "opens",
      date: cycle.opensDate,
      label: "Application opens",
      kind: "opens",
    });
  if (deadline)
    events.push({
      key: "deadline",
      date: deadline,
      label: "Application deadline",
      kind: "deadline",
    });
  if (cycle?.decisionDate)
    events.push({
      key: "decision",
      date: cycle.decisionDate,
      label: "Decisions released",
      kind: "decision",
    });
  for (const item of items) {
    if (!item.dueAt) continue;
    events.push({
      key: `task-${item.id}`,
      date: dateToIso(item.dueAt),
      label: taskTitle(item),
      kind: "task",
      settled: item.status === "done" || item.status === "skipped",
    });
  }
  if (status && statusChangedAt)
    events.push({
      key: "status",
      date: todayIso(statusChangedAt),
      label: `Marked ${APPLICATION_STATUS_LABEL[status]}`,
      kind: "status",
      settled: true,
    });
  events.push({ key: "today", date: today, label: "Today", kind: "today" });

  // Today sorts before same-day events so "due today" reads as still ahead.
  events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(b.kind === "today") - Number(a.kind === "today"),
  );

  if (events.length === 1) {
    return (
      <p className="text-sm text-muted">
        No dates on record for this cycle yet. Task due dates you add to the
        checklist will appear here.
      </p>
    );
  }

  return (
    <ol className="relative">
      {events.map((e, i) => {
        const past = e.date < today;
        const days = daysBetween(today, e.date);
        const last = i === events.length - 1;
        return (
          <li
            key={e.key}
            className="grid grid-cols-[5.5rem_1.25rem_minmax(0,1fr)] gap-x-3"
          >
            <span
              className={cn(
                "pt-0.5 text-right font-mono text-xs tabular-nums",
                e.kind === "today" ? "font-semibold text-fg" : "text-muted",
              )}
            >
              {shortDate(e.date, today)}
            </span>
            <span className="relative flex justify-center">
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-3 bottom-0 w-px",
                    past ? "bg-line-strong" : "bg-line",
                  )}
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative mt-1 block rounded-full",
                  e.kind === "today"
                    ? "size-3 bg-fg ring-4 ring-canvas"
                    : e.kind === "deadline"
                      ? cn("size-3", urgent ? "bg-arterial" : "bg-accent")
                      : e.settled
                        ? "size-2 bg-line-strong"
                        : "size-2 border border-accent bg-surface",
                )}
              />
            </span>
            <span
              className={cn(
                "pb-5 text-sm",
                e.kind === "deadline" ? "font-semibold" : "",
                e.kind === "today"
                  ? "font-semibold text-fg"
                  : past || e.settled
                    ? "text-subtle"
                    : e.kind === "deadline" && urgent
                      ? "text-arterial"
                      : "text-fg",
              )}
            >
              {e.label}
              {e.kind !== "today" && !past && !e.settled && (
                <span className="ml-2 text-xs font-normal text-muted">
                  {relativeDays(days)}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
