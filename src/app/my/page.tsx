import Link from "next/link";
import { db } from "@/db/client";
import { listApplicationRows } from "@/domain/applications";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { AddChecklistItemForm } from "@/components/AddChecklistItemForm";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import { GenerateChecklistButton } from "@/components/SaveProgramControl";
import { Meter } from "@/components/applications/Meter";
import { StatusControl } from "@/components/applications/StatusControl";
import { PageHeader } from "@/components/shell/PageHeader";
import { sortRows } from "@/lib/applicationQuery";
import { todayIso } from "@/lib/deadlines";

export const dynamic = "force-dynamic";

/** Every tracked program's checklist in one place, soonest deadline first. */
export default function ChecklistsPage() {
  const today = todayIso(new Date());
  const tracked = sortRows(
    listApplicationRows(db).filter((r) => r.saved),
    "deadline",
    "asc",
    today,
  );

  return (
    <div>
      <PageHeader
        title="Checklists"
        description="Your own tasks per tracked program: letters, essays, transcripts and anything else. Official requirements stay on each program's page."
      />

      {tracked.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-semicondensed text-lg font-semibold text-fg">
            No tracked programs yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Track a program from{" "}
            <Link href="/programs" className="text-accent hover:underline">
              Programs
            </Link>{" "}
            and its checklist will live here.
          </p>
        </div>
      ) : (
        <ul className="space-y-12">
          {tracked.map((row) => {
            const saved = row.saved!;
            const checklists = listChecklistsForSavedProgram(db, saved.id);
            return (
              <li key={saved.id}>
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
                  <div className="min-w-0">
                    <h2 className="font-semicondensed text-xl font-semibold">
                      <Link
                        href={`/programs/${row.schoolSlug}/${row.programSlug}`}
                        className="text-fg hover:underline"
                      >
                        {row.schoolName}
                      </Link>
                    </h2>
                    <p className="text-sm text-muted">{row.programName}</p>
                    {saved.note && (
                      <p className="mt-1 max-w-prose text-sm text-muted">
                        {saved.note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {row.progress.total > 0 && (
                      <Meter
                        className="w-32"
                        done={row.progress.done}
                        total={row.progress.total}
                        label={`Checklist for ${row.schoolName}`}
                      />
                    )}
                    <StatusControl
                      savedProgramId={saved.id}
                      status={saved.status}
                      target={{
                        programId: row.programId,
                        schoolSlug: row.schoolSlug,
                        programSlug: row.programSlug,
                        schoolName: row.schoolName,
                      }}
                    />
                  </div>
                </div>

                {checklists.length === 0 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <p className="text-sm text-muted">No checklist yet.</p>
                    <GenerateChecklistButton savedProgramId={saved.id} />
                  </div>
                ) : (
                  checklists.map(({ checklist, items }) => (
                    <div key={checklist.id} className="mt-3">
                      <h3 className="text-xs text-subtle">{checklist.title}</h3>
                      {items.length === 0 ? (
                        <p className="py-3 text-sm text-muted">
                          No tasks yet. Add the letters, essays and transcripts
                          this application needs.
                        </p>
                      ) : (
                        <ul className="divide-y divide-line">
                          {items.map((item) => (
                            <ChecklistItemRow key={item.id} item={item} />
                          ))}
                        </ul>
                      )}
                      <AddChecklistItemForm checklistId={checklist.id} />
                    </div>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
