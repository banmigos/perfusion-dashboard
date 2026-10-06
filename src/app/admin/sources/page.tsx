// src/app/admin/sources/page.tsx
import Link from "next/link";
import { listSources } from "@/domain/admin/sources";
import { db } from "@/db/client";
import { createSourceAction, updateSourceAction } from "@/app/actions/admin";
import { SOURCE_TYPES } from "@/db/schema/provenance";

export const dynamic = "force-dynamic";

export default function AdminSourcesPage() {
  const sources = listSources(db);

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Sources</h1>

      <ul className="mt-4 space-y-3">
        {sources.map((source) => (
          <li
            key={source.id}
            className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
          >
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {source.url}
            </a>
            <span className="ml-2 text-xs text-zinc-500">
              {source.sourceType}
            </span>
            <form
              action={updateSourceAction.bind(null, source.id)}
              className="mt-2 flex gap-2"
            >
              <input
                type="text"
                name="title"
                placeholder="Title"
                defaultValue={source.title ?? ""}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                type="text"
                name="publisher"
                placeholder="Publisher"
                defaultValue={source.publisher ?? ""}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="submit"
                className="text-xs text-blue-600 underline dark:text-blue-400"
              >
                save
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold">Add a source</h2>
      <form action={createSourceAction} className="mt-2 flex flex-wrap gap-2">
        <input
          type="url"
          name="url"
          placeholder="https://..."
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="sourceType"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add source
        </button>
      </form>
    </div>
  );
}
