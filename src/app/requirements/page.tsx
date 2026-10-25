import Link from "next/link";
import { db } from "@/db/client";
import { checklistProgress, listApplicationRows } from "@/domain/applications";
import { FactCell } from "@/components/FactCell";
import { Meter } from "@/components/applications/Meter";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/components/ui/cn";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type Category,
} from "@/lib/categories";
import { dateToIso, shortDate, todayIso } from "@/lib/deadlines";
import { STALE_AFTER_DAYS } from "@/lib/freshness";
import { taskTitle } from "@/lib/taskTitle";

export const dynamic = "force-dynamic";

/** What "done" means for each kind of work, in the user's words. */
const DONE_WORD: Partial<Record<Category, [done: string, open: string]>> = {
  letters: ["received", "pending"],
  transcript: ["sent", "pending"],
  essay: ["final", "drafting"],
  prerequisite: ["complete", "remaining"],
  shadowing: ["logged", "to do"],
  fee: ["paid", "unpaid"],
};

export default function RequirementsPage() {
  const now = new Date();
  const today = todayIso(now);
  const tracked = listApplicationRows(db).filter((r) => r.saved);

  const allItems = tracked.flatMap((r) =>
    r.items.map((item) => ({ item, row: r })),
  );
  const overall = checklistProgress(allItems.map((a) => a.item));

  const byCategory = CATEGORY_ORDER.map((category) => {
    const entries = allItems.filter(({ item }) =>
      category === "other"
        ? !item.category ||
          item.category === "other" ||
          !CATEGORY_ORDER.includes(item.category as Category)
        : item.category === category,
    );
    return {
      category,
      entries,
      progress: checklistProgress(entries.map((e) => e.item)),
    };
  });
  const active = byCategory.filter((c) => c.entries.length > 0);
  const empty = byCategory.filter((c) => c.entries.length === 0);

  if (tracked.length === 0) {
    return (
      <div>
        <PageHeader title="Requirements" />
        <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-semicondensed text-lg font-semibold text-fg">
            Nothing to tally yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Track programs and add letters, essays and transcripts to their
            checklists; progress across every application collects here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <PageHeader
        title="Requirements"
        description={`Your progress on the work applications need, across ${tracked.length} tracked ${tracked.length === 1 ? "program" : "programs"}.`}
      />

      {overall.total > 0 && (
        <section aria-label="Overall" className="max-w-xl">
          <div className="flex items-baseline gap-3">
            <p className="font-condensed text-6xl leading-none font-semibold tabular-nums">
              {overall.total === 0
                ? "0"
                : Math.round((overall.done / overall.total) * 100)}
              <span className="text-3xl">%</span>
            </p>
            <p className="text-sm text-muted">
              of {overall.total} checklist{" "}
              {overall.total === 1 ? "task" : "tasks"} done
            </p>
          </div>
          <Meter
            className="mt-3"
            done={overall.done}
            total={overall.total}
            label="All checklist tasks"
          />
        </section>
      )}

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-10">
          {active.length === 0 && (
            <p className="text-sm text-muted">
              Tracked programs have no checklist tasks yet. Generate a checklist
              on a program&rsquo;s page, then add tasks by kind.
            </p>
          )}
          {active.map(({ category, entries, progress }) => {
            const [doneWord, openWord] = DONE_WORD[category] ?? [
              "done",
              "open",
            ];
            const sorted = [...entries].sort(
              (a, b) =>
                Number(a.item.status === "done") -
                  Number(b.item.status === "done") ||
                (a.item.dueAt?.getTime() ?? Infinity) -
                  (b.item.dueAt?.getTime() ?? Infinity),
            );
            return (
              <section key={category} aria-label={CATEGORY_LABEL[category]}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line pb-2">
                  <h2 className="font-semicondensed text-lg font-semibold">
                    {CATEGORY_LABEL[category]}
                  </h2>
                  <p className="text-xs text-muted">
                    <span className="font-mono text-fg">{progress.done}</span>{" "}
                    {doneWord},{" "}
                    <span className="font-mono text-fg">{progress.open}</span>{" "}
                    {openWord}
                  </p>
                </div>
                <Meter
                  done={progress.done}
                  total={progress.total}
                  label={`${CATEGORY_LABEL[category]} progress`}
                />
                <ul className="mt-3 divide-y divide-line">
                  {sorted.map(({ item, row }) => {
                    const done = item.status === "done";
                    const overdue =
                      !done &&
                      item.status !== "skipped" &&
                      item.dueAt !== null &&
                      dateToIso(item.dueAt) < today;
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm"
                      >
                        <span
                          className={cn(
                            "min-w-0",
                            done ? "text-subtle line-through" : "text-fg",
                          )}
                        >
                          {taskTitle(item)}
                          <Link
                            href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                            className="block text-xs text-muted no-underline hover:text-fg hover:underline"
                          >
                            {row.schoolName}
                          </Link>
                        </span>
                        <span
                          className={cn(
                            "font-mono text-xs",
                            overdue ? "text-arterial" : "text-muted",
                          )}
                        >
                          {done
                            ? doneWord
                            : item.dueAt
                              ? `${overdue ? "overdue " : "due "}${shortDate(dateToIso(item.dueAt), today)}`
                              : openWord}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {empty.length > 0 && (
            <section aria-label="Kinds with no tasks">
              <h2 className="text-sm font-medium text-muted">
                No tasks of these kinds yet
              </h2>
              <p className="mt-1 text-sm text-subtle">
                {empty.map((c) => CATEGORY_LABEL[c.category]).join(", ")}. Add
                one from any program&rsquo;s checklist by choosing its kind.
              </p>
            </section>
          )}
        </div>

        <aside className="space-y-10">
          <section aria-label="By program">
            <h2 className="font-semicondensed mb-3 border-b border-line pb-2 text-lg font-semibold">
              By program
            </h2>
            <ul className="space-y-3">
              {tracked.map((r) => (
                <li key={r.programId} className="text-sm">
                  <Link
                    href={`/programs/${r.schoolSlug}/${r.programSlug}`}
                    className="text-fg hover:underline"
                  >
                    {r.schoolName}
                  </Link>
                  {r.progress.total > 0 ? (
                    <Meter
                      className="mt-1"
                      done={r.progress.done}
                      total={r.progress.total}
                      label={`Checklist for ${r.schoolName}`}
                    />
                  ) : (
                    <p className="text-xs text-subtle">No checklist tasks</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Official minimums">
            <h2 className="font-semicondensed border-b border-line pb-2 text-lg font-semibold">
              Official GPA minimums
            </h2>
            <p className="mt-2 mb-3 text-xs text-muted">
              As each school publishes it, with its source. These are the
              programs&rsquo; requirements, not your tasks.
            </p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              {tracked.map((r) => (
                <div key={r.programId} className="contents">
                  <dt className="truncate text-muted">{r.schoolName}</dt>
                  <dd>
                    <FactCell
                      {...r.gpa}
                      now={now}
                      staleAfterDays={STALE_AFTER_DAYS}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
