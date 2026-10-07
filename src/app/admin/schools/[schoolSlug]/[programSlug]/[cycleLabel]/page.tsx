// src/app/admin/schools/[schoolSlug]/[programSlug]/[cycleLabel]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { resolveRequirementClaim } from "@/domain/admin/requirements";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveCycleAction,
  archiveRequirementAction,
  createRequirementAction,
  updateCycleAction,
  updateRequirementAction,
} from "@/app/actions/admin";
import {
  CAS_SERVICES,
  DEADLINE_TYPES,
  REQUIREMENT_CATEGORIES,
} from "@/db/schema/canonical";

export const dynamic = "force-dynamic";

export default async function AdminCyclePage({
  params,
}: {
  params: Promise<{
    schoolSlug: string;
    programSlug: string;
    cycleLabel: string;
  }>;
}) {
  const { schoolSlug, programSlug, cycleLabel: rawCycleLabel } = await params;
  // Next leaves dynamic segments percent-encoded; labels are free text.
  const cycleLabel = decodeURIComponent(rawCycleLabel);

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

  const [cycle] = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, program.id),
        eq(schema.applicationCycles.cycleLabel, cycleLabel),
      ),
    )
    .all();
  if (!cycle) notFound();

  const requirements = db
    .select()
    .from(schema.requirements)
    .where(
      and(
        eq(schema.requirements.cycleId, cycle.id),
        ne(schema.requirements.status, "archived"),
      ),
    )
    .orderBy(asc(schema.requirements.sortOrder))
    .all();

  const cycleClaims = listClaimsForSubject(db, "application_cycles", cycle.id);

  return (
    <div>
      <p className="text-sm">
        <Link
          href={`/admin/schools/${school.slug}/${program.slug}`}
          className="underline"
        >
          {program.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{cycle.cycleLabel}</h1>

      <form
        action={updateCycleAction.bind(
          null,
          cycle.id,
          school.slug,
          program.slug,
        )}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          cycle label
          <input
            type="text"
            name="cycleLabel"
            defaultValue={cycle.cycleLabel}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          entry year
          <input
            type="number"
            name="entryYear"
            defaultValue={cycle.entryYear ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          deadline
          <input
            type="date"
            name="deadlineDate"
            defaultValue={cycle.deadlineDate ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          deadline type
          <select
            name="deadlineType"
            defaultValue={cycle.deadlineType ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {DEADLINE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          CAS service
          <select
            name="casService"
            defaultValue={cycle.casService ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {CAS_SERVICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
      </form>

      {cycle.status !== "archived" && (
        <form action={archiveCycleAction.bind(null, cycle.id)} className="mt-2">
          <button
            type="submit"
            className="text-xs text-red-600 underline dark:text-red-400"
          >
            Archive cycle
          </button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="application_cycles"
        subjectId={cycle.id}
        claims={cycleClaims}
      />

      <h2 className="mt-6 text-sm font-semibold">Requirements</h2>
      <ul className="mt-2 space-y-4">
        {requirements.map((req) => {
          // Show every claim on the requirement: legacy/lead imports key
          // claims on empty requirements by value_number/value_bool.
          const reqClaims = listClaimsForSubject(db, "requirements", req.id);
          const backing = resolveRequirementClaim(req, (key) =>
            reqClaims.find((c) => c.fieldKey === key),
          );
          return (
            <li
              key={req.id}
              className="rounded border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <form
                action={updateRequirementAction.bind(null, req.id)}
                className="flex flex-wrap items-end gap-2"
              >
                <select
                  name="category"
                  defaultValue={req.category}
                  required
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="label"
                  defaultValue={req.label}
                  required
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  name="valueText"
                  placeholder="Text value"
                  defaultValue={req.valueText ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  name="valueNumber"
                  placeholder="Numeric value"
                  defaultValue={req.valueNumber ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <select
                  name="valueBool"
                  defaultValue={
                    req.valueBool === null
                      ? ""
                      : req.valueBool
                        ? "true"
                        : "false"
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">bool —</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
                <input
                  type="date"
                  name="valueDate"
                  defaultValue={req.valueDate ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <select
                  name="isRequired"
                  defaultValue={
                    req.isRequired === null
                      ? ""
                      : req.isRequired
                        ? "true"
                        : "false"
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">required? unknown</option>
                  <option value="true">required</option>
                  <option value="false">not required</option>
                </select>
                <button
                  type="submit"
                  className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Save
                </button>
              </form>
              <form
                action={archiveRequirementAction.bind(null, req.id)}
                className="mt-1"
              >
                <button
                  type="submit"
                  className="text-xs text-red-600 underline dark:text-red-400"
                >
                  Archive requirement
                </button>
              </form>
              <p className="mt-1 text-xs text-zinc-500">
                {backing.claim
                  ? `value backed by claim: ${backing.fieldKey}`
                  : "no claim backs this value yet"}
              </p>
              <ClaimsPanel
                subjectTable="requirements"
                subjectId={req.id}
                claims={reqClaims}
              />
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a requirement</h3>
      <form
        action={createRequirementAction.bind(null, cycle.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <select
          name="category"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {REQUIREMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="label"
          placeholder="Label, e.g. Minimum overall GPA"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="valueText"
          placeholder="Text value"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="valueNumber"
          placeholder="Numeric value"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="valueBool"
          defaultValue=""
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">bool —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <input
          type="date"
          name="valueDate"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="isRequired"
          defaultValue=""
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">required? unknown</option>
          <option value="true">required</option>
          <option value="false">not required</option>
        </select>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add requirement
        </button>
      </form>
    </div>
  );
}
