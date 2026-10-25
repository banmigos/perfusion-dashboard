import Link from "next/link";
import type { ApplicationRow } from "@/domain/applications";
import {
  programsHref,
  type ApplicationQuery,
  type SortKey,
} from "@/lib/applicationQuery";
import {
  daysBetween,
  relativeDays,
  shortDate,
  urgencyOf,
} from "@/lib/deadlines";
import { Meter } from "../applications/Meter";
import { StatusControl, TrackButton } from "../applications/StatusControl";
import { FactCell } from "../FactCell";
import { cn } from "../ui/cn";

type Props = {
  rows: ApplicationRow[];
  now: Date;
  today: string;
  staleAfterDays: number;
  query: ApplicationQuery & { q?: string; credential?: string };
};

type Column = { name: string; sort?: SortKey; className?: string };

const COLUMNS: Column[] = [
  { name: "School", sort: "school", className: "min-w-64" },
  { name: "Status", sort: "status" },
  { name: "Deadline", sort: "deadline", className: "min-w-36" },
  { name: "Checklist", sort: "checklist", className: "min-w-32" },
  { name: "Credential" },
  { name: "Length", sort: "length" },
  { name: "Class size", sort: "class" },
  { name: "GPA" },
  { name: "Tuition", className: "min-w-36" },
  { name: "Note", className: "min-w-48" },
];

const TD = "px-3 py-3 align-top";

const target = (r: ApplicationRow) => ({
  programId: r.programId,
  schoolSlug: r.schoolSlug,
  programSlug: r.programSlug,
  schoolName: r.schoolName,
});

function SortHeader({
  column,
  query,
}: {
  column: Column;
  query: Props["query"];
}) {
  const active = query.sort === column.sort;
  const ariaSort = active
    ? query.dir === "asc"
      ? "ascending"
      : "descending"
    : undefined;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "px-3 py-2.5 font-medium whitespace-nowrap",
        column.className,
      )}
    >
      {column.sort ? (
        <Link
          href={programsHref(query, {
            sort: column.sort,
            dir: active && query.dir === "asc" ? "desc" : "asc",
          })}
          className={cn(
            "inline-flex items-center gap-1 hover:text-fg",
            active && "text-fg",
          )}
        >
          {column.name}
          <span aria-hidden="true" className="w-2 text-[0.6rem]">
            {active ? (query.dir === "asc" ? "▲" : "▼") : ""}
          </span>
        </Link>
      ) : (
        column.name
      )}
    </th>
  );
}

/** The deadline as a readout: date, then distance from today. */
function DeadlineValue({ row, today }: { row: ApplicationRow; today: string }) {
  const date = row.deadline.value;
  if (date === null) return null;
  const days = daysBetween(today, date);
  const urgency = urgencyOf(date, row.saved?.status ?? null, today);
  return (
    <span className="inline-flex flex-col">
      <span className="font-mono text-sm">{shortDate(date, today)}</span>
      <span
        className={cn(
          "text-xs",
          urgency === "at_risk" || urgency === "missed"
            ? "font-medium text-arterial"
            : days < 0
              ? "text-subtle"
              : "text-muted",
        )}
      >
        {days < 0 && row.saved === null ? "closed" : relativeDays(days)}
      </span>
    </span>
  );
}

function StatusCell({ row }: { row: ApplicationRow }) {
  return row.saved ? (
    <StatusControl
      savedProgramId={row.saved.id}
      status={row.saved.status}
      target={target(row)}
    />
  ) : (
    <TrackButton target={target(row)} />
  );
}

function ChecklistCell({ row }: { row: ApplicationRow }) {
  if (!row.saved) return <span className="text-subtle">Not tracking</span>;
  if (row.progress.total === 0)
    return <span className="text-subtle">No checklist</span>;
  return (
    <Meter
      done={row.progress.done}
      total={row.progress.total}
      label={`Checklist for ${row.schoolName}`}
    />
  );
}

/**
 * Wide screens get a sortable table; phones get the same rows as a stacked
 * list (the table is hidden there, not squeezed).
 */
export function ProgramsTable({
  rows,
  now,
  today,
  staleAfterDays,
  query,
}: Props) {
  const fact = { now, staleAfterDays };

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border border-line bg-surface md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line-strong text-xs text-muted">
              {COLUMNS.map((c) => (
                <SortHeader key={c.name} column={c} query={query} />
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const urgency = urgencyOf(
                row.deadline.value,
                row.saved?.status ?? null,
                today,
              );
              return (
                <tr
                  key={`${row.schoolSlug}/${row.programSlug}`}
                  className={cn(
                    "transition-colors hover:bg-raised/40",
                    !row.saved && "text-muted",
                  )}
                >
                  <td
                    className={cn(
                      TD,
                      "border-l-2",
                      urgency === "at_risk" || urgency === "missed"
                        ? "border-l-arterial"
                        : "border-l-transparent",
                    )}
                  >
                    <Link
                      href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                      className="font-medium text-fg hover:underline"
                    >
                      {row.schoolName}
                    </Link>
                    <span className="block text-xs text-muted">
                      {row.programName}
                      {row.location && `, ${row.location}`}
                    </span>
                  </td>
                  <td className={TD} data-col="status">
                    <StatusCell row={row} />
                  </td>
                  <td className={TD} data-col="deadline">
                    <FactCell
                      {...row.deadline}
                      value={<DeadlineValue row={row} today={today} />}
                      {...fact}
                    />
                  </td>
                  <td className={TD} data-col="checklist">
                    <ChecklistCell row={row} />
                  </td>
                  <td className={TD} data-col="credential">
                    <FactCell {...row.credential} {...fact} />
                  </td>
                  <td className={TD} data-col="length">
                    <FactCell {...row.length} {...fact} />
                  </td>
                  <td className={TD} data-col="class-size">
                    <FactCell {...row.classSize} {...fact} />
                  </td>
                  <td className={TD} data-col="gpa">
                    <FactCell {...row.gpa} {...fact} />
                  </td>
                  <td className={TD} data-col="tuition">
                    {row.tuition.length === 0 ? (
                      <FactCell value={null} claim={undefined} {...fact} />
                    ) : (
                      <ul className="space-y-1.5">
                        {row.tuition.map((t) => (
                          <li key={t.label}>
                            <FactCell {...t} {...fact} />
                            <span
                              className="block text-xs text-subtle"
                              title={t.label}
                            >
                              {t.shortLabel}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={TD} data-col="note">
                    {row.saved?.note ? (
                      <p
                        className="line-clamp-2 max-w-56 text-muted"
                        title={row.saved.note}
                      >
                        {row.saved.note}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line border-y border-line md:hidden">
        {rows.map((row) => {
          const urgency = urgencyOf(
            row.deadline.value,
            row.saved?.status ?? null,
            today,
          );
          return (
            <li
              key={`${row.schoolSlug}/${row.programSlug}`}
              className={cn(
                "space-y-3 border-l-2 py-4 pl-3",
                urgency === "at_risk" || urgency === "missed"
                  ? "border-l-arterial"
                  : "border-l-transparent",
              )}
            >
              <div>
                <Link
                  href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                  className="font-medium text-fg hover:underline"
                >
                  {row.schoolName}
                </Link>
                <p className="text-xs text-muted">
                  {row.programName}
                  {row.location && `, ${row.location}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <StatusCell row={row} />
                {row.deadline.value !== null ? (
                  <FactCell
                    {...row.deadline}
                    value={<DeadlineValue row={row} today={today} />}
                    {...fact}
                  />
                ) : (
                  <FactCell {...row.deadline} {...fact} />
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Checklist</dt>
                <dd>
                  <ChecklistCell row={row} />
                </dd>
                <dt className="text-muted">Length</dt>
                <dd>
                  <FactCell {...row.length} {...fact} />
                </dd>
                <dt className="text-muted">Class size</dt>
                <dd>
                  <FactCell {...row.classSize} {...fact} />
                </dd>
                <dt className="text-muted">Tuition</dt>
                <dd>
                  {row.tuition[0] ? (
                    <>
                      <FactCell {...row.tuition[0]} {...fact} />
                      <span className="ml-2 text-xs text-subtle">
                        {row.tuition[0].shortLabel}
                        {row.tuition.length > 1 &&
                          `, +${row.tuition.length - 1} more`}
                      </span>
                    </>
                  ) : (
                    <FactCell value={null} claim={undefined} {...fact} />
                  )}
                </dd>
              </dl>
              {row.saved?.note && (
                <p className="text-sm text-muted">{row.saved.note}</p>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
