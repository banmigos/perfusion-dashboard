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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";

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
      <Breadcrumb href={`/admin/schools/${school.slug}`} label={school.name} />
      <PageHeader title={program.name} />

      <form
        action={updateProgramAction.bind(null, program.id)}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          name
          <Input type="text" name="name" defaultValue={program.name} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          director
          <Input
            type="text"
            name="directorName"
            defaultValue={program.directorName ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          credential
          <Select name="credential" defaultValue={program.credential ?? ""}>
            <option value="">—</option>
            {CREDENTIALS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          modality
          <Select name="modality" defaultValue={program.modality ?? ""}>
            <option value="">—</option>
            {MODALITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          accreditation status
          <Input
            type="text"
            name="accreditationStatus"
            defaultValue={program.accreditationStatus ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          length (months)
          <Input
            type="number"
            name="programLengthMonths"
            min={1}
            step={1}
            defaultValue={program.programLengthMonths ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          class size
          <Input
            type="number"
            name="classSize"
            min={1}
            step={1}
            defaultValue={program.classSize ?? ""}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          website
          <Input
            type="url"
            name="websiteUrl"
            defaultValue={program.websiteUrl ?? ""}
          />
        </label>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>

      {program.status !== "archived" && (
        <form
          action={archiveProgramAction.bind(null, program.id)}
          className="mt-3"
        >
          <Button type="submit" variant="danger" size="sm">
            Archive program
          </Button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="programs"
        subjectId={program.id}
        claims={claims}
      />

      <h2 className="mt-8 mb-2 text-base font-semibold text-fg">Cycles</h2>
      <Card className="px-4">
        <ul className="divide-y divide-line">
          {cycles.map((cycle) => (
            <li key={cycle.id} className="py-2.5 text-sm">
              <Link
                href={`/admin/schools/${school.slug}/${program.slug}/${encodeURIComponent(cycle.cycleLabel)}`}
                className="text-fg hover:text-accent-strong hover:underline"
              >
                {cycle.cycleLabel}
                {cycle.deadlineDate ? ` — due ${cycle.deadlineDate}` : ""}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <h3 className="mt-6 mb-2 text-sm font-medium text-fg">Add a cycle</h3>
      <form
        action={createCycleAction.bind(null, program.id)}
        className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4"
      >
        <Input type="text" name="cycleLabel" placeholder="2026-27" required />
        <Input type="number" name="entryYear" placeholder="Entry year" />
        <Input type="date" name="deadlineDate" />
        <Button type="submit" variant="primary">
          Add cycle
        </Button>
      </form>
    </div>
  );
}
