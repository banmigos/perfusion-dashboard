import type { ReactNode } from "react";
import { factState, type ClaimLike } from "@/lib/factState";
import { FreshnessPill } from "../FreshnessPill";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Compact, table-oriented rendering of one fact. The four fact states stay
 * distinct: no claim → "Not researched"; unknown → "Unknown"; not_published →
 * "Not published"; known → the value, flagged unless verified and fresh.
 */
export function FactCell({
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
      return (
        <span className="whitespace-nowrap text-subtle">Not researched</span>
      );
    case "unknown":
      return (
        <span
          className="text-muted italic"
          title={
            state.checkedAt
              ? `Looked, undetermined (checked ${isoDate(state.checkedAt)})`
              : "Looked, undetermined"
          }
        >
          Unknown
        </span>
      );
    case "not_published":
      return (
        <span
          className="text-muted"
          title={
            state.checkedAt
              ? `School does not publish this (checked ${isoDate(state.checkedAt)})`
              : "School does not publish this"
          }
        >
          Not published
        </span>
      );
    case "not_applicable":
      return <span className="text-muted">N/A</span>;
    case "known": {
      const detail = [
        state.checkedAt ? `checked ${isoDate(state.checkedAt)}` : null,
        state.quote ? `“${state.quote}”` : null,
      ]
        .filter(Boolean)
        .join(" — ");

      return (
        <span
          className="inline-flex flex-wrap items-center gap-x-2 gap-y-1"
          title={detail || undefined}
        >
          <span className="text-fg tabular-nums">{value ?? "—"}</span>
          <FreshnessPill
            verification={state.verification}
            isStale={state.isStale}
          />
          {state.source && (
            <a
              href={state.source.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Source: ${state.source.title ?? state.source.url}`}
              title={state.source.title ?? state.source.url}
              className="text-xs text-accent hover:text-accent-strong"
            >
              src↗
            </a>
          )}
        </span>
      );
    }
  }
}
