import Link from "next/link";
import { db } from "@/db/client";
import { CREDENTIALS } from "@/db/schema/canonical";
import { listPrograms, parseProgramListFilters } from "@/domain/programs";

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const filters = parseProgramListFilters(rawParams);
  const items = listPrograms(db, filters);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Programs</h1>

      <form method="get" className="mt-4 flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-sm">
          Search
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="School or city"
            className="mt-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-sm">
          Credential
          <select
            name="credential"
            defaultValue={filters.credential ?? ""}
            className="mt-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">All</option>
            {CREDENTIALS.map((credential) => (
              <option key={credential} value={credential}>
                {credential}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Filter
        </button>
      </form>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No programs match.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800">
          {items.map((item) => (
            <li key={`${item.school.slug}/${item.program.slug}`} className="py-3">
              <Link
                href={`/programs/${item.school.slug}/${item.program.slug}`}
                className="font-medium hover:underline"
              >
                {item.school.name} — {item.program.name}
              </Link>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {item.school.city}, {item.school.state} ·{" "}
                {item.program.credential ?? "credential unknown"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
