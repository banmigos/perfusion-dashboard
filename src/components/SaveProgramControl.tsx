"use client";

import { useTransition } from "react";
import {
  saveProgramAction,
  unsaveProgramAction,
  updateSavedProgramAction,
} from "@/app/actions/saved";
import { generateChecklistAction } from "@/app/actions/checklists";
import { PRIORITIES } from "@/db/schema/personal";

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
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void saveProgramAction(programId, schoolSlug, programSlug);
          })
        }
        className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Save program
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void unsaveProgramAction(programId, schoolSlug, programSlug);
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          Unsave
        </button>

        <button
          type="button"
          disabled={isPending || hasChecklist}
          onClick={() =>
            startTransition(() => {
              void generateChecklistAction(savedProgram.id);
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          {hasChecklist ? "Checklist generated" : "Generate checklist"}
        </button>

        {hasChecklist && (
          <a
            href="/my"
            className="text-xs text-blue-600 underline dark:text-blue-400"
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
        <label className="flex items-center gap-1 text-xs">
          Priority
          <select
            name="priority"
            defaultValue={savedProgram.priority ?? ""}
            className="rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">unset</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <textarea
          name="personalNote"
          defaultValue={savedProgram.personalNote ?? ""}
          placeholder="Personal note"
          rows={2}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          Save note
        </button>
      </form>
    </div>
  );
}
