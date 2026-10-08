import Link from "next/link";
import { db } from "@/db/client";
import { getProgramDetail } from "@/domain/programs";
import { listDueItems } from "@/domain/checklists";
import { listSavedPrograms } from "@/domain/saved";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import { FactCell } from "@/components/FactCell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { STALE_AFTER_DAYS } from "@/lib/freshness";
import { buildProgramRow } from "@/lib/programRows";

export const dynamic = "force-dynamic";

const TIERS = [
  { key: "reach", label: "Reach" },
  { key: "target", label: "Target" },
  { key: "likely", label: "Likely" },
] as const;

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const now = new Date();
  const dueItems = listDueItems(db);
  const savedPrograms = listSavedPrograms(db);

  const byTier = { reach: [], target: [], likely: [] } as Record<
    (typeof TIERS)[number]["key"],
    typeof savedPrograms
  >;
  let unprioritized = 0;
  for (const saved of savedPrograms) {
    const { priority } = saved.savedProgram;
    if (
      priority === "reach" ||
      priority === "target" ||
      priority === "likely"
    ) {
      byTier[priority].push(saved);
    } else if (priority !== "dropped") {
      unprioritized += 1;
    }
  }

  // Application deadlines are cycle-specific facts, read through the same
  // domain query and fact presentation as the programs table.
  const deadlines = savedPrograms
    .flatMap(({ school, program }) => {
      const detail = getProgramDetail(db, school.slug, program.slug);
      return detail ? [buildProgramRow(detail)] : [];
    })
    .sort((a, b) => {
      if (a.deadline.value && b.deadline.value) {
        return a.deadline.value.localeCompare(b.deadline.value);
      }
      return a.deadline.value ? -1 : b.deadline.value ? 1 : 0;
    });

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description={`${savedPrograms.length} saved ${savedPrograms.length === 1 ? "program" : "programs"}`}
      />

      <section>
        <SectionHeading
          title="Priorities"
          hint={
            unprioritized > 0
              ? `${unprioritized} saved without a priority`
              : undefined
          }
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map(({ key, label }) => (
            <Card key={key} className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg">{label}</h3>
                <Badge tone="accent">{byTier[key].length}</Badge>
              </div>
              {byTier[key].length === 0 ? (
                <p className="mt-3 text-sm text-subtle">None</p>
              ) : (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {byTier[key].map(({ savedProgram, school, program }) => (
                    <li key={savedProgram.id}>
                      <Link
                        href={`/programs/${school.slug}/${program.slug}`}
                        className="text-muted hover:text-accent-strong hover:underline"
                      >
                        {school.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Next Actions"
          hint={`${dueItems.length} open ${dueItems.length === 1 ? "task" : "tasks"}`}
        />
        <Card className="px-4">
          {dueItems.length === 0 ? (
            <p className="py-4 text-sm text-muted">No open tasks.</p>
          ) : (
            <ul className="divide-y divide-line">
              {dueItems.map(({ item, school, program }) => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  programLabel={`${school.name} — ${program.name}`}
                />
              ))}
            </ul>
          )}
        </Card>
        <Link href="/my" className={buttonClass("secondary", "md", "mt-4")}>
          View all applications
        </Link>
      </section>

      <section>
        <SectionHeading
          title="Upcoming Deadlines"
          hint="Application deadlines for saved programs, by cycle"
        />
        <Card className="px-4">
          {deadlines.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              Save a program to track its deadline.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {deadlines.map((row) => (
                <li
                  key={`${row.schoolSlug}/${row.programSlug}`}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-3 text-sm"
                >
                  <Link
                    href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                    className="font-medium text-fg hover:text-accent-strong hover:underline"
                  >
                    {row.schoolName}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {row.programName}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    {row.deadline.cycleLabel && (
                      <span className="text-xs text-subtle">
                        {row.deadline.cycleLabel} cycle
                      </span>
                    )}
                    <FactCell
                      {...row.deadline}
                      now={now}
                      staleAfterDays={STALE_AFTER_DAYS}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
