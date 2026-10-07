// src/app/admin/schools/[schoolSlug]/[programSlug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveProgramAction,
  createCycleAction,
  updateProgramAction,
} from "@/app/actions/admin";
import { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";

export const dynamic = "force-dynamic";

export default async function AdminProgramPage({
  params,
}: {
  params: Promise<{ schoolSlug: string; programSlug: string }>;
}) {
  const { schoolSlug, programSlug } = await params;

  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) notFound();

  const [program] = db
    .select()
    .from(schema.programs)
    .where(
      and(
        eq(schema.programs.schoolId, school.id),
        eq(schema.programs.slug, programSlug),
      ),
    )
    .all();
  if (!program) notFound();

  const cycles = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, program.id),
        ne(schema.applicationCycles.status, "archived"),
      ),
    )
    .orderBy(desc(schema.applicationCycles.cycleLabel))
    .all();

  const claims = listClaimsForSubject(db, "programs", program.id);

  return (
    <div>
      <p className="text-sm">
        <Link href={`/admin/schools/${school.slug}`} className="underline">
          {school.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{program.name}</h1>

      <form
        action={updateProgramAction.bind(null, program.id)}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          name
          <input
            type="text"
            name="name"
            defaultValue={program.name}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          director
          <input
            type="text"
            name="directorName"
            defaultValue={program.directorName ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          credential
          <select
            name="credential"
            defaultValue={program.credential ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {CREDENTIALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          modality
          <select
            name="modality"
            defaultValue={program.modality ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {MODALITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          accreditation status
          <input
            type="text"
            name="accreditationStatus"
            defaultValue={program.accreditationStatus ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          length (months)
          <input
            type="number"
            name="programLengthMonths"
            min={1}
            step={1}
            defaultValue={program.programLengthMonths ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          class size
          <input
            type="number"
            name="classSize"
            min={1}
            step={1}
            defaultValue={program.classSize ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          website
          <input
            type="url"
            name="websiteUrl"
            defaultValue={program.websiteUrl ?? ""}
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

      {program.status !== "archived" && (
        <form
          action={archiveProgramAction.bind(null, program.id)}
          className="mt-2"
        >
          <button
            type="submit"
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            Archive program
          </button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="programs"
        subjectId={program.id}
        claims={claims}
      />

      <h2 className="mt-6 text-sm font-semibold">Cycles</h2>
      <ul className="mt-2 space-y-1">
        {cycles.map((cycle) => (
          <li key={cycle.id}>
            <Link
              href={`/admin/schools/${school.slug}/${program.slug}/${encodeURIComponent(cycle.cycleLabel)}`}
              className="hover:underline"
            >
              {cycle.cycleLabel}
              {cycle.deadlineDate ? ` — due ${cycle.deadlineDate}` : ""}
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a cycle</h3>
      <form
        action={createCycleAction.bind(null, program.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input
          type="text"
          name="cycleLabel"
          placeholder="2026-27"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          name="entryYear"
          placeholder="Entry year"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="date"
          name="deadlineDate"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add cycle
        </button>
      </form>
    </div>
  );
}
