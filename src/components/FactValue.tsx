import type { ReactNode } from "react";
import { factState, type ClaimLike } from "@/lib/factState";
import { SourceBadge } from "./SourceBadge";
import { FreshnessPill } from "./FreshnessPill";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function FactValue({
  value,
  claim,
  now,
  staleAfterDays,
}: {
  value: ReactNode;
  claim: ClaimLike | undefined;
  now: Date;
  staleAfterDays: number;
}) {
  const state = factState(claim, now, staleAfterDays);

  switch (state.kind) {
    case "not_researched":
      return <span className="text-zinc-400">—</span>;
    case "unknown":
      return (
        <span className="text-amber-600 dark:text-amber-400">
          unknown
          {state.checkedAt ? ` — checked ${formatDate(state.checkedAt)}` : ""}
        </span>
      );
    case "not_published":
      return <span className="text-zinc-500">not published</span>;
    case "not_applicable":
      return <span className="text-zinc-500">n/a</span>;
    case "known":
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{value}</span>
          <FreshnessPill verification={state.verification} isStale={state.isStale} />
          {state.source && (
            <SourceBadge url={state.source.url} title={state.source.title} />
          )}
        </span>
      );
  }
}
