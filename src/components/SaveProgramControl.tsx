"use client";

import { useTransition } from "react";
import {
  saveProgramAction,
  unsaveProgramAction,
  updateSavedProgramAction,
} from "@/app/actions/saved";
import { generateChecklistAction } from "@/app/actions/checklists";
import { PRIORITIES } from "@/db/schema/personal";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Select } from "./ui/Select";
import { Textarea } from "./ui/Textarea";

type SavedProgramState = {
  id: number;
  priority: (typeof PRIORITIES)[number] | null;
  personalNote: string | null;
} | null;

export function SaveProgramControl({
  programId,
  schoolSlug,
  programSlug,
  savedProgram,
  hasChecklist,
}: {
  programId: number;
  schoolSlug: string;
  programSlug: string;
  savedProgram: SavedProgramState;
  hasChecklist: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!savedProgram) {
    return (
      <Button
        variant="primary"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void saveProgramAction(programId, schoolSlug, programSlug);
          })
        }
      >
        Save program
      </Button>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void unsaveProgramAction(programId, schoolSlug, programSlug);
            })
          }
        >
          Unsave
        </Button>

        <Button
          size="sm"
          disabled={isPending || hasChecklist}
          onClick={() =>
            startTransition(() => {
              void generateChecklistAction(savedProgram.id);
            })
          }
        >
          {hasChecklist ? "Checklist generated" : "Generate checklist"}
        </Button>

        {hasChecklist && (
          <a
            href="/my"
            className="text-xs text-accent hover:text-accent-strong hover:underline"
          >
            View on My Applications
          </a>
        )}
      </div>

      <form
        action={updateSavedProgramAction.bind(
          null,
          savedProgram.id,
          schoolSlug,
          programSlug,
        )}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="flex items-center gap-2 text-xs text-muted">
          Priority
          <Select
            name="priority"
            defaultValue={savedProgram.priority ?? ""}
            compact
          >
            <option value="">unset</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </label>
        <Textarea
          name="personalNote"
          defaultValue={savedProgram.personalNote ?? ""}
          placeholder="Personal note"
          rows={2}
          compact
          className="w-full"
        />
        <Button type="submit" size="sm">
          Save note
        </Button>
      </form>
    </Card>
  );
}
