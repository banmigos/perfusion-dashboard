import Link from "next/link";
import type { ApplicationRow } from "@/domain/applications";
import {
  daysBetween,
  relativeDays,
  shortDate,
  urgencyOf,
} from "@/lib/deadlines";
import { Meter } from "../applications/Meter";
import { StatusControl } from "../applications/StatusControl";
import { StatusGlyph } from "../applications/StatusGlyph";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
} from "../applications/status";
import { cn } from "../ui/cn";

/**
 * Tracked applications in pipeline columns. Cards move with their status
 * select rather than drag-and-drop, so moving one works from the keyboard
 * and on a phone exactly as it does with a mouse.
 */
export function ProgramsBoard({
  rows,
  today,
  untrackedCount,
}: {
  rows: ApplicationRow[];
  today: string;
  untrackedCount: number;
}) {
  const tracked = rows.filter((r) => r.saved);

  if (tracked.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
        <p className="font-semicondensed text-lg font-semibold text-fg">
          The board shows applications you&rsquo;re tracking.
        </p>
        <p className="mt-1 text-sm text-muted">
          None match these filters. Switch to the table and use Track on a
          program to place it in Not started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {APPLICATION_STATUSES.map((status) => {
          const cards = tracked.filter((r) => r.saved!.status === status);
          return (
            <section
              key={status}
              aria-label={APPLICATION_STATUS_LABEL[status]}
              className="w-72 shrink-0 snap-start xl:w-auto"
            >
              <h2 className="mb-3 flex items-center gap-2 border-b border-line-strong pb-2 text-sm font-semibold text-fg">
                <StatusGlyph status={status} />
                {APPLICATION_STATUS_LABEL[status]}
                <span className="ml-auto font-mono text-xs font-normal text-muted">
                  {cards.length}
                </span>
              </h2>
              {cards.length === 0 ? (
                <p className="py-2 text-xs text-subtle">None</p>
              ) : (
                <ul className="space-y-3">
                  {cards.map((row) => {
                    const deadline = row.deadline.value;
                    const urgency = urgencyOf(
                      deadline,
                      row.saved!.status,
                      today,
                    );
                    const urgent =
                      urgency === "at_risk" || urgency === "missed";
                    return (
                      <li
                        key={row.programId}
                        className={cn(
                          "rounded-md border border-line bg-surface p-3",
                          urgent && "border-l-2 border-l-arterial",
                        )}
                      >
                        <Link
                          href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                          className="font-medium text-fg hover:underline"
                        >
                          {row.schoolName}
                        </Link>
                        <p className="text-xs text-muted">{row.programName}</p>
                        {deadline && (
                          <p className="mt-2 text-sm">
                            <span className="font-mono">
                              {shortDate(deadline, today)}
                            </span>{" "}
                            <span
                              className={cn(
                                "text-xs",
                                urgent
                                  ? "font-medium text-arterial"
                                  : "text-muted",
                              )}
                            >
                              {relativeDays(daysBetween(today, deadline))}
                            </span>
                          </p>
                        )}
                        {row.progress.total > 0 && (
                          <Meter
                            className="mt-2"
                            done={row.progress.done}
                            total={row.progress.total}
                            label={`Checklist for ${row.schoolName}`}
                          />
                        )}
                        <StatusControl
                          className="mt-3"
                          savedProgramId={row.saved!.id}
                          status={row.saved!.status}
                          target={{
                            programId: row.programId,
                            schoolSlug: row.schoolSlug,
                            programSlug: row.programSlug,
                            schoolName: row.schoolName,
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {untrackedCount > 0 && (
        <p className="mt-4 text-xs text-subtle">
          {untrackedCount} matching{" "}
          {untrackedCount === 1 ? "program isn't" : "programs aren't"} tracked
          and {untrackedCount === 1 ? "is" : "are"} not on the board.
        </p>
      )}
    </div>
  );
}
