import Link from "next/link";
import { db } from "@/db/client";
import { listSavedPrograms } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { generateChecklistAction } from "@/app/actions/checklists";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import { AddChecklistItemForm } from "@/components/AddChecklistItemForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default function MyApplicationsPage() {
  const savedPrograms = listSavedPrograms(db);

  return (
    <div>
      <PageHeader title="My Applications" />

      {savedPrograms.length === 0 ? (
        <p className="text-sm text-muted">
          No saved programs yet. Save one from its program page.
        </p>
      ) : (
        <ul className="space-y-6">
          {savedPrograms.map(({ savedProgram, school, program }) => {
            const checklists = listChecklistsForSavedProgram(
              db,
              savedProgram.id,
            );
            return (
              <li key={savedProgram.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      href={`/programs/${school.slug}/${program.slug}`}
                      className="font-medium text-fg hover:text-accent-strong hover:underline"
                    >
                      {school.name} — {program.name}
                    </Link>
                    {savedProgram.priority && (
                      <Badge tone="accent">{savedProgram.priority}</Badge>
                    )}
                  </div>
                  {savedProgram.personalNote && (
                    <p className="mt-1 text-sm text-muted">
                      {savedProgram.personalNote}
                    </p>
                  )}

                  {checklists.length === 0 ? (
                    <form
                      action={generateChecklistAction.bind(
                        null,
                        savedProgram.id,
                      )}
                      className="mt-3"
                    >
                      <Button type="submit" size="sm">
                        Generate checklist
                      </Button>
                    </form>
                  ) : (
                    checklists.map(({ checklist, items }) => (
                      <div key={checklist.id} className="mt-4">
                        <h2 className="text-sm font-semibold text-fg">
                          {checklist.title}
                        </h2>
                        <ul className="mt-1 divide-y divide-line">
                          {items.map((item) => (
                            <ChecklistItemRow key={item.id} item={item} />
                          ))}
                        </ul>
                        <AddChecklistItemForm checklistId={checklist.id} />
                      </div>
                    ))
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
