import type { ReactNode } from "react";
import { factState, type ClaimLike } from "@/lib/factState";
import { FreshnessPill } from "./FreshnessPill";
import { SourceBadge } from "./SourceBadge";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Rendering of one fact, shared by the programs table (`compact`) and the
 * detail page (`detail`, which spells out source title and check date). The four fact states stay
 * distinct: no claim → "Not researched"; unknown → "Unknown"; not_published →
 * "Not published"; known → the value, flagged unless verified and fresh.
 */
export function FactCell({
  value,
  claim,
  now,
  staleAfterDays,
  variant = "compact",
}: {
  value: ReactNode;
  claim: ClaimLike | undefined;
  now: Date;
  staleAfterDays: number;
  variant?: "compact" | "detail";
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
          {variant === "detail" && state.checkedAt
            ? ` — checked ${isoDate(state.checkedAt)}`
            : ""}
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
          {variant === "detail" && state.checkedAt
            ? ` — checked ${isoDate(state.checkedAt)}`
            : ""}
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
            <SourceBadge
              url={state.source.url}
              title={state.source.title}
              label={variant === "compact" ? "src↗" : undefined}
            />
          )}
          {variant === "detail" && state.checkedAt && (
            <span className="text-xs text-subtle">
              checked {isoDate(state.checkedAt)}
            </span>
          )}
        </span>
      );
    }
  }
}
