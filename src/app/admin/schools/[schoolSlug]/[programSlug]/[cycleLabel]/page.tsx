// src/app/admin/schools/[schoolSlug]/[programSlug]/[cycleLabel]/page.tsx
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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";

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
      <Breadcrumb
        href={`/admin/schools/${school.slug}/${program.slug}`}
        label={program.name}
      />
      <PageHeader title={cycle.cycleLabel} />

      <form
        action={updateCycleAction.bind(
          null,
          cycle.id,
          school.slug,
          program.slug,
        )}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          cycle label
          <Input
            type="text"
            name="cycleLabel"
            defaultValue={cycle.cycleLabel}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          entry year
          <Input
            type="number"
            name="entryYear"
            defaultValue={cycle.entryYear ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          deadline
          <Input
            type="date"
            name="deadlineDate"
            defaultValue={cycle.deadlineDate ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          deadline type
          <Select name="deadlineType" defaultValue={cycle.deadlineType ?? ""}>
            <option value="">—</option>
            {DEADLINE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          CAS service
          <Select name="casService" defaultValue={cycle.casService ?? ""}>
            <option value="">—</option>
            {CAS_SERVICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>

      {cycle.status !== "archived" && (
        <form action={archiveCycleAction.bind(null, cycle.id)} className="mt-3">
          <Button type="submit" variant="danger" size="sm">
            Archive cycle
          </Button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="application_cycles"
        subjectId={cycle.id}
        claims={cycleClaims}
      />

      <h2 className="mt-8 mb-2 text-base font-semibold text-fg">
        Requirements
      </h2>
      <ul className="mt-2 space-y-4">
        {requirements.map((req) => {
          // Show every claim on the requirement: legacy/lead imports key
          // claims on empty requirements by value_number/value_bool.
          const reqClaims = listClaimsForSubject(db, "requirements", req.id);
          const backing = resolveRequirementClaim(req, (key) =>
            reqClaims.find((c) => c.fieldKey === key),
          );
          return (
            <li key={req.id}>
              <Card className="p-4">
                <form
                  action={updateRequirementAction.bind(null, req.id)}
                  className="flex flex-wrap items-end gap-2"
                >
                  <Select
                    name="category"
                    defaultValue={req.category}
                    required
                    compact
                  >
                    {REQUIREMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="text"
                    name="label"
                    defaultValue={req.label}
                    required
                    compact
                  />
                  <Input
                    type="text"
                    name="valueText"
                    placeholder="Text value"
                    defaultValue={req.valueText ?? ""}
                    compact
                  />
                  <Input
                    type="text"
                    name="valueNumber"
                    placeholder="Numeric value"
                    defaultValue={req.valueNumber ?? ""}
                    compact
                  />
                  <Select
                    name="valueBool"
                    defaultValue={
                      req.valueBool === null
                        ? ""
                        : req.valueBool
                          ? "true"
                          : "false"
                    }
                    compact
                  >
                    <option value="">bool —</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </Select>
                  <Input
                    type="date"
                    name="valueDate"
                    defaultValue={req.valueDate ?? ""}
                    compact
                  />
                  <Select
                    name="isRequired"
                    defaultValue={
                      req.isRequired === null
                        ? ""
                        : req.isRequired
                          ? "true"
                          : "false"
                    }
                    compact
                  >
                    <option value="">required? unknown</option>
                    <option value="true">required</option>
                    <option value="false">not required</option>
                  </Select>
                  <Button type="submit" variant="primary" size="sm">
                    Save
                  </Button>
                </form>
                <form
                  action={archiveRequirementAction.bind(null, req.id)}
                  className="mt-1"
                >
                  <Button type="submit" variant="danger" size="sm">
                    Archive requirement
                  </Button>
                </form>
                <p className="mt-2 text-xs text-muted">
                  {backing.claim
                    ? `value backed by claim: ${backing.fieldKey}`
                    : "no claim backs this value yet"}
                </p>
                <ClaimsPanel
                  subjectTable="requirements"
                  subjectId={req.id}
                  claims={reqClaims}
                />
              </Card>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-6 mb-2 text-sm font-medium text-fg">
        Add a requirement
      </h3>
      <form
        action={createRequirementAction.bind(null, cycle.id)}
        className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4"
      >
        <Select name="category" required>
          {REQUIREMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Input
          type="text"
          name="label"
          placeholder="Label, e.g. Minimum overall GPA"
          required
        />
        <Input type="text" name="valueText" placeholder="Text value" />
        <Input type="text" name="valueNumber" placeholder="Numeric value" />
        <Select name="valueBool" defaultValue="">
          <option value="">bool —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </Select>
        <Input type="date" name="valueDate" />
        <Select name="isRequired" defaultValue="" compact>
          <option value="">required? unknown</option>
          <option value="true">required</option>
          <option value="false">not required</option>
        </Select>
        <Button type="submit" variant="primary">
          Add requirement
        </Button>
      </form>
    </div>
  );
}
