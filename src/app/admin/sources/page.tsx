// src/app/admin/sources/page.tsx
import { listSources } from "@/domain/admin/sources";
import { db } from "@/db/client";
import { createSourceAction, updateSourceAction } from "@/app/actions/admin";
import { SOURCE_TYPES } from "@/db/schema/provenance";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Breadcrumb } from "@/components/shell/Breadcrumb";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default function AdminSourcesPage() {
  const sources = listSources(db);

  return (
    <div>
      <Breadcrumb href="/admin" label="Admin" />
      <PageHeader title="Sources" />

      <ul className="space-y-3">
        {sources.map((source) => (
          <li key={source.id}>
            <Card className="p-4 text-sm">
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent-strong hover:underline"
              >
                {source.url}
              </a>
              <Badge className="ml-2">{source.sourceType}</Badge>
              <form
                action={updateSourceAction.bind(null, source.id)}
                className="mt-3 flex flex-wrap gap-2"
              >
                <Input
                  type="text"
                  name="title"
                  placeholder="Title"
                  defaultValue={source.title ?? ""}
                  compact
                />
                <Input
                  type="text"
                  name="publisher"
                  placeholder="Publisher"
                  defaultValue={source.publisher ?? ""}
                  compact
                />
                <Button type="submit" variant="ghost" size="sm">
                  save
                </Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 mb-2 text-base font-semibold text-fg">
        Add a source
      </h2>
      <form
        action={createSourceAction}
        className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-4"
      >
        <Input type="url" name="url" placeholder="https://..." required />
        <Select name="sourceType" required>
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary">
          Add source
        </Button>
      </form>
    </div>
  );
}
