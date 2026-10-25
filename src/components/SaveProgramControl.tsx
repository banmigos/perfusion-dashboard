"use client";

import { useState, useTransition } from "react";
import {
  saveProgramAction,
  unsaveProgramAction,
  updateSavedProgramAction,
} from "@/app/actions/saved";
import { generateChecklistAction } from "@/app/actions/checklists";
import { PRIORITIES } from "@/db/schema/personal";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { Textarea } from "./ui/Textarea";

type SavedProgramState = {
  id: number;
  priority: (typeof PRIORITIES)[number] | null;
  personalNote: string | null;
} | null;

const PRIORITY_LABEL: Record<(typeof PRIORITIES)[number], string> = {
  reach: "Reach",
  target: "Target",
  likely: "Likely",
  dropped: "Dropped",
};

/** Starts tracking a program from its detail page. */
export function TrackProgramButton({
  programId,
  schoolSlug,
  programSlug,
}: {
  programId: number;
  schoolSlug: string;
  programSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="primary"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await saveProgramAction(programId, schoolSlug, programSlug);
        })
      }
    >
      Track program
    </Button>
  );
}

/**
 * Stopping tracking deletes the program's checklists with it (FK cascade),
 * so it asks once before doing so.
 */
export function StopTrackingButton({
  programId,
  schoolSlug,
  programSlug,
}: {
  programId: number;
  schoolSlug: string;
  programSlug: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
        Stop tracking
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
      This deletes its checklist.
      <Button
        size="sm"
        variant="danger"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await unsaveProgramAction(programId, schoolSlug, programSlug);
          })
        }
      >
        Stop tracking and delete
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        Keep tracking
      </Button>
    </span>
  );
}

export function GenerateChecklistButton({
  savedProgramId,
}: {
  savedProgramId: number;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await generateChecklistAction(savedProgramId);
        })
      }
    >
      Generate checklist
    </Button>
  );
}

/** Priority and fit notes for a tracked program. */
export function FitNotesForm({
  savedProgram,
  schoolSlug,
  programSlug,
}: {
  savedProgram: NonNullable<SavedProgramState>;
  schoolSlug: string;
  programSlug: string;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <form
      action={async (formData) => {
        await updateSavedProgramAction(
          savedProgram.id,
          schoolSlug,
          programSlug,
          formData,
        );
        setSaved(true);
      }}
      onChange={() => setSaved(false)}
      className="flex flex-col gap-3 text-sm"
    >
      <label className="flex items-center justify-between gap-2 text-muted">
        Priority
        <Select
          name="priority"
          defaultValue={savedProgram.priority ?? ""}
          compact
        >
          <option value="">Unset</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-muted">
        Fit notes
        <Textarea
          name="personalNote"
          defaultValue={savedProgram.personalNote ?? ""}
          placeholder="Why this program, what to mention in the essay, who you spoke with"
          rows={5}
          className="w-full"
        />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">
          Save notes
        </Button>
        <span role="status" className="text-xs text-ok">
          {saved ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}
