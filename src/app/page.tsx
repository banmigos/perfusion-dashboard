import Link from "next/link";
import { db } from "@/db/client";
import { listDueItems } from "@/domain/checklists";
import { listSavedPrograms } from "@/domain/saved";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";

export default function DashboardPage() {
  const dueItems = listDueItems(db);
  const savedPrograms = listSavedPrograms(db);

  const counts = { reach: 0, target: 0, likely: 0, dropped: 0 };
  for (const { savedProgram } of savedPrograms) {
    if (savedProgram.priority) {
      counts[savedProgram.priority] += 1;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {savedPrograms.length} saved programs — {counts.reach} reach /{" "}
        {counts.target} target / {counts.likely} likely
      </p>

      {dueItems.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No open tasks.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">
          {dueItems.map(({ item, school, program }) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              programLabel={`${school.name} — ${program.name}`}
            />
          ))}
        </ul>
      )}

      <Link
        href="/my"
        className="mt-4 inline-block text-sm text-blue-600 underline dark:text-blue-400"
      >
        View all applications
      </Link>
    </div>
  );
}
