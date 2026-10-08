// src/app/admin/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createSchoolAction } from "@/app/actions/admin";
import { Button, buttonClass } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/shell/PageHeader";
import { Input } from "@/components/ui/Input";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const schools = db
    .select()
    .from(schema.schools)
    .orderBy(asc(schema.schools.name))
    .all();

  return (
    <div>
      <PageHeader
        title="Admin"
        description="Schools, programs, cycles, requirements, and sources."
        actions={
          <Link href="/admin/sources" className={buttonClass("secondary")}>
            Manage sources
          </Link>
        }
      />

      <Card className="px-4">
        <ul className="divide-y divide-line">
          {schools.map((school) => (
            <li key={school.id} className="py-2.5 text-sm">
              <Link
                href={`/admin/schools/${school.slug}`}
                className="text-fg hover:text-accent-strong hover:underline"
              >
                {school.name}
              </Link>
              {school.status === "archived" && (
                <Badge className="ml-2">archived</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <h2 className="mt-8 mb-2 text-base font-semibold text-fg">
        Add a school
      </h2>
      <form
        action={createSchoolAction}
        className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4"
      >
        <Input type="text" name="name" placeholder="School name" required />
        <Input type="text" name="city" placeholder="City" />
        <Input type="text" name="state" placeholder="State" />
        <Input type="url" name="websiteUrl" placeholder="Website URL" />
        <Button type="submit" variant="primary">
          Add school
        </Button>
      </form>
    </div>
  );
}
