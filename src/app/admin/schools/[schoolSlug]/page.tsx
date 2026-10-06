// src/app/admin/schools/[schoolSlug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveSchoolAction,
  createProgramAction,
  updateSchoolAction,
} from "@/app/actions/admin";
import { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";

export const dynamic = "force-dynamic";

export default async function AdminSchoolPage({
  params,
}: {
  params: Promise<{ schoolSlug: string }>;
}) {
  const { schoolSlug } = await params;

  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) {
    notFound();
  }

  const programs = db
    .select()
    .from(schema.programs)
    .where(
      and(
        eq(schema.programs.schoolId, school.id),
        ne(schema.programs.status, "archived"),
      ),
    )
    .orderBy(asc(schema.programs.name))
    .all();

  const claims = listClaimsForSubject(db, "schools", school.id);

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{school.name}</h1>

      <form
        action={updateSchoolAction.bind(null, school.id)}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          name
          <input
            type="text"
            name="name"
            defaultValue={school.name}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          city
          <input
            type="text"
            name="city"
            defaultValue={school.city ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          state
          <input
            type="text"
            name="state"
            defaultValue={school.state ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          website
          <input
            type="url"
            name="websiteUrl"
            defaultValue={school.websiteUrl ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
      </form>

      {school.status !== "archived" && (
        <form
          action={archiveSchoolAction.bind(null, school.id)}
          className="mt-2"
        >
          <button
            type="submit"
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            Archive school
          </button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="schools"
        subjectId={school.id}
        claims={claims}
      />

      <h2 className="mt-6 text-sm font-semibold">Programs</h2>
      <ul className="mt-2 space-y-1">
        {programs.map((program) => (
          <li key={program.id}>
            <Link
              href={`/admin/schools/${school.slug}/${program.slug}`}
              className="hover:underline"
            >
              {program.name}
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a program</h3>
      <form
        action={createProgramAction.bind(null, school.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input
          type="text"
          name="name"
          placeholder="Program name"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="credential"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">credential —</option>
          {CREDENTIALS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="modality"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">modality —</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
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
          Add program
        </button>
      </form>
    </div>
  );
}
