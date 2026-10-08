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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";

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
      <Breadcrumb href="/admin" label="Admin" />
      <PageHeader title={school.name} />

      <form
        action={updateSchoolAction.bind(null, school.id)}
        className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          name
          <Input type="text" name="name" defaultValue={school.name} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          city
          <Input type="text" name="city" defaultValue={school.city ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          state
          <Input type="text" name="state" defaultValue={school.state ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          website
          <Input
            type="url"
            name="websiteUrl"
            defaultValue={school.websiteUrl ?? ""}
          />
        </label>
        <Button type="submit" variant="primary">
          Save
        </Button>
      </form>

      {school.status !== "archived" && (
        <form
          action={archiveSchoolAction.bind(null, school.id)}
          className="mt-3"
        >
          <Button type="submit" variant="danger" size="sm">
            Archive school
          </Button>
        </form>
      )}

      <ClaimsPanel
        subjectTable="schools"
        subjectId={school.id}
        claims={claims}
      />

      <h2 className="mt-8 mb-2 text-base font-semibold text-fg">Programs</h2>
      <Card className="px-4">
        <ul className="divide-y divide-line">
          {programs.map((program) => (
            <li key={program.id} className="py-2.5 text-sm">
              <Link
                href={`/admin/schools/${school.slug}/${program.slug}`}
                className="text-fg hover:text-accent-strong hover:underline"
              >
                {program.name}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <h3 className="mt-6 mb-2 text-sm font-medium text-fg">Add a program</h3>
      <form
        action={createProgramAction.bind(null, school.id)}
        className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4"
      >
        <Input type="text" name="name" placeholder="Program name" required />
        <Input type="text" name="directorName" placeholder="Director" />
        <Select name="credential">
          <option value="">credential —</option>
          {CREDENTIALS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select name="modality">
          <option value="">modality —</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Input
          type="text"
          name="accreditationStatus"
          placeholder="Accreditation status"
        />
        <Input
          type="number"
          name="programLengthMonths"
          min={1}
          step={1}
          placeholder="Length (months)"
        />
        <Input
          type="number"
          name="classSize"
          min={1}
          step={1}
          placeholder="Class size"
        />
        <Input type="url" name="websiteUrl" placeholder="Website URL" />
        <Button type="submit" variant="primary">
          Add program
        </Button>
      </form>
    </div>
  );
}
