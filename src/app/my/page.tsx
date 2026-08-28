import Link from "next/link";
import { db } from "@/db/client";
import { listSavedPrograms } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { generateChecklistAction } from "@/app/actions/checklists";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import { AddChecklistItemForm } from "@/components/AddChecklistItemForm";

export default function MyApplicationsPage() {
  const savedPrograms = listSavedPrograms(db);

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Applications</h1>

      {savedPrograms.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          No saved programs yet. Save one from its program page.
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {savedPrograms.map(({ savedProgram, school, program }) => {
            const checklists = listChecklistsForSavedProgram(
              db,
              savedProgram.id,
            );
            return (
              <li
                key={savedProgram.id}
                className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/programs/${school.slug}/${program.slug}`}
                    className="font-medium hover:underline"
                  >
                    {school.name} — {program.name}
                  </Link>
                  {savedProgram.priority && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                      {savedProgram.priority}
                    </span>
                  )}
                </div>
                {savedProgram.personalNote && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {savedProgram.personalNote}
                  </p>
                )}

                {checklists.length === 0 ? (
                  <form
                    action={generateChecklistAction.bind(null, savedProgram.id)}
                    className="mt-3"
                  >
                    <button
                      type="submit"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                    >
                      Generate checklist
                    </button>
                  </form>
                ) : (
                  checklists.map(({ checklist, items }) => (
                    <div key={checklist.id} className="mt-3">
                      <h2 className="text-sm font-semibold">
                        {checklist.title}
                      </h2>
                      <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
                        {items.map((item) => (
                          <ChecklistItemRow key={item.id} item={item} />
                        ))}
                      </ul>
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
