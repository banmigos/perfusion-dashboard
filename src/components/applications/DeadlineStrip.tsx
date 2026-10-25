import Link from "next/link";
import { addDays, daysBetween, monthLabel } from "@/lib/deadlines";
import { cn } from "../ui/cn";
import { STAGE_BG, type ApplicationStatus } from "./status";

export type StripMarker = {
  key: string;
  date: string;
  label: string;
  href: string;
  /** Null when the program is not tracked. */
  status: ApplicationStatus | null;
  atRisk: boolean;
  lead: boolean;
};

const LABEL_ROWS = 4;
/** Rough label width as a share of the strip, tuned for a ~900px strip. */
const labelSpan = (text: string) => ((text.length * 7 + 18) / 900) * 100;

/**
 * Greedy row packing: each label takes the first row whose previous label
 * ends before it starts. Labels that fit no row are dropped; their marker
 * still shows, and the deadline list below names every program.
 */
function packLabels(markers: (StripMarker & { pct: number })[]) {
  const rowEnds: number[] = Array(LABEL_ROWS).fill(-Infinity);
  return markers.map((m) => {
    const span = labelSpan(m.label);
    // Labels that would run off the right edge hang to the left instead.
    const flip = m.pct + span > 100;
    const start = flip ? m.pct - span : m.pct;
    const row = rowEnds.findIndex((end) => end < start);
    if (row === -1) return { ...m, row: null, flip };
    rowEnds[row] = start + span;
    return { ...m, row, flip };
  });
}

/**
 * The overview's centerpiece: the next `horizon` days drawn as chart paper
 * (a fine tick per day, a heavier rule per week, months named), with every
 * program's deadline plotted on it. Tracked applications are solid and take
 * their pipeline stage's shade; untracked ones are hollow. Red marks only an
 * application at risk.
 */
export function DeadlineStrip({
  today,
  horizon,
  markers,
}: {
  today: string;
  horizon: number;
  markers: StripMarker[];
}) {
  const at = (date: string) => (daysBetween(today, date) / horizon) * 100;

  const months: { date: string; pct: number }[] = [];
  for (let d = 1; d <= horizon; d++) {
    const date = addDays(today, d);
    if (date.endsWith("-01")) months.push({ date, pct: at(date) });
  }

  const placed = packLabels(
    markers
      .map((m) => ({ ...m, pct: at(m.date) }))
      .sort((a, b) => a.pct - b.pct || Number(b.lead) - Number(a.lead)),
  );
  const tracked = markers.filter((m) => m.status !== null).length;

  return (
    <figure
      className="relative select-none"
      aria-label={`Deadlines in the next ${horizon} days: ${markers.length} programs, ${tracked} of them tracked.`}
    >
      {/* Month names ride above the paper. */}
      <div className="relative h-5 text-xs text-subtle" aria-hidden="true">
        <span className="absolute left-0 hidden sm:inline">Today</span>
        {months.map((m) => (
          <span
            key={m.date}
            className="absolute -translate-x-px border-l border-line-strong pl-1 leading-none"
            style={{ left: `${m.pct}%` }}
          >
            {monthLabel(m.date)}
          </span>
        ))}
      </div>

      {/* The paper: day ticks, week rules, today's edge. */}
      <div
        className="relative h-14 border-y border-line-strong"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--line-strong) 1px, transparent 1px), linear-gradient(to right, var(--grid) 1px, transparent 1px)",
          backgroundSize: `calc(700% / ${horizon}) 100%, calc(100% / ${horizon}) 100%`,
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-0.5 bg-fg"
          aria-hidden="true"
        />
        {placed.map((m, i) => (
          <Link
            key={m.key}
            href={m.href}
            tabIndex={-1}
            aria-hidden="true"
            className="settle absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.pct}%`, animationDelay: `${120 + i * 45}ms` }}
          >
            <span
              className={cn(
                "block rounded-full ring-2 ring-surface transition-transform hover:scale-125",
                m.lead ? "size-4" : "size-3",
                m.status === null
                  ? "border-[1.5px] border-muted bg-surface"
                  : m.atRisk
                    ? "bg-arterial"
                    : STAGE_BG[m.status],
              )}
            />
          </Link>
        ))}
      </div>

      {/* Leader lines down to packed labels; hidden on narrow screens. */}
      <div
        className="relative hidden sm:block"
        style={{ height: `${LABEL_ROWS * 1.25 + 0.5}rem` }}
        aria-hidden="true"
      >
        {placed.map((m) =>
          m.row === null ? null : (
            <div
              key={m.key}
              className="absolute top-0"
              style={{ left: `${m.pct}%` }}
            >
              <div
                className={cn(
                  "w-px",
                  m.atRisk ? "bg-arterial" : "bg-line-strong",
                )}
                style={{ height: `${m.row * 1.25 + 0.65}rem` }}
              />
              <span
                className={cn(
                  "absolute text-xs leading-5 whitespace-nowrap",
                  m.flip ? "right-1.5" : "left-1.5",
                  m.atRisk
                    ? "font-medium text-arterial"
                    : m.status === null
                      ? "text-subtle"
                      : "font-medium text-fg",
                )}
                style={{ top: `${m.row * 1.25}rem` }}
              >
                {m.label}
              </span>
            </div>
          ),
        )}
      </div>
    </figure>
  );
}
