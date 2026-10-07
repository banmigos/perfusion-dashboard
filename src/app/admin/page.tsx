// src/app/admin/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createSchoolAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const schools = db
    .select()
    .from(schema.schools)
    .orderBy(asc(schema.schools.name))
    .all();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Schools, programs, cycles, requirements, and sources.
      </p>

      <ul className="mt-6 space-y-1">
        {schools.map((school) => (
          <li key={school.id}>
            <Link
              href={`/admin/schools/${school.slug}`}
              className="hover:underline"
            >
              {school.name}
            </Link>
            {school.status === "archived" && (
              <span className="ml-2 text-xs text-zinc-500">archived</span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold">Add a school</h2>
      <form action={createSchoolAction} className="mt-2 flex flex-wrap gap-2">
        <input
          type="text"
          name="name"
          placeholder="School name"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="city"
          placeholder="City"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="state"
          placeholder="State"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="url"
          name="websiteUrl"
          placeholder="Website URL"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add school
        </button>
      </form>

      <p className="mt-4 text-sm">
        <Link href="/admin/sources" className="underline">
          Manage sources
        </Link>
      </p>
    </div>
  );
}
