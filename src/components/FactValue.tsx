import type { ReactNode } from "react";
import type { ClaimLike } from "@/lib/factState";
import { FactCell } from "./FactCell";

/** Detail-page fact: the same rendering as a table cell, with provenance spelled out. */
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
  return (
    <FactCell
      variant="detail"
      value={value}
      claim={claim}
      now={now}
      staleAfterDays={staleAfterDays}
    />
  );
}
