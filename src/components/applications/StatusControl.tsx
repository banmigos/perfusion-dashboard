"use client";

import { useOptimistic, useTransition } from "react";
import {
  saveProgramAction,
  setApplicationStatusAction,
} from "@/app/actions/saved";
import { cn } from "../ui/cn";
import { FIELD_BASE } from "../ui/Input";
import { StatusGlyph } from "./StatusGlyph";
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  type ApplicationStatus,
} from "./status";

type Target = {
  programId: number;
  schoolSlug: string;
  programSlug: string;
  /** Used in the accessible name so a table of these stays distinguishable. */
  schoolName: string;
};

/**
 * A native select behind the stage glyph: keyboard and screen-reader
 * behavior comes from the platform. The glyph updates optimistically so the
 * status transition shows immediately; the server action persists it.
 */
export function StatusControl({
  savedProgramId,
  status,
  target,
  className,
}: {
  savedProgramId: number;
  status: ApplicationStatus;
  target: Target;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(status);

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 text-sm",
        isPending && "opacity-70",
        className,
      )}
    >
      <StatusGlyph
        status={optimistic}
        className="pointer-events-none absolute left-2"
      />
      <span className="sr-only">
        Application status for {target.schoolName}
      </span>
      <select
        value={optimistic}
        onChange={(e) => {
          const next = e.target.value as ApplicationStatus;
          startTransition(async () => {
            setOptimistic(next);
            await setApplicationStatusAction(
              savedProgramId,
              target.schoolSlug,
              target.programSlug,
              next,
            );
          });
        }}
        className={cn(FIELD_BASE, "py-1 pr-2 pl-7 text-sm")}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {APPLICATION_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Starts tracking an untracked program; it enters the pipeline as Not started. */
export function TrackButton({
  target,
  className,
}: {
  target: Target;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-label={`Track ${target.schoolName}`}
      onClick={() =>
        startTransition(async () => {
          await saveProgramAction(
            target.programId,
            target.schoolSlug,
            target.programSlug,
          );
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded border border-dashed border-line-strong px-2 py-1 text-sm text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50",
        className,
      )}
    >
      <StatusGlyph status={null} />
      {isPending ? "Tracking" : "Track"}
    </button>
  );
}
