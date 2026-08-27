import { isStale } from "@/lib/freshness";

export type ClaimState =
  "known" | "unknown" | "not_published" | "not_applicable";
export type Verification =
  "draft" | "needs_review" | "verified" | "stale" | "archived";

export type ClaimLike = {
  state: ClaimState;
  verification: Verification;
  checkedAt: Date | null;
  quote: string | null;
  source: { url: string; title: string | null } | null;
};

export type FactDisplay =
  | { kind: "not_researched" }
  | { kind: "unknown"; checkedAt: Date | null }
  | { kind: "not_published"; checkedAt: Date | null }
  | { kind: "not_applicable"; checkedAt: Date | null }
  | {
      kind: "known";
      verification: Verification;
      isStale: boolean;
      source: { url: string; title: string | null } | null;
      quote: string | null;
      checkedAt: Date | null;
    };

export function factState(
  claim: ClaimLike | undefined,
  now: Date,
  staleAfterDays: number,
): FactDisplay {
  if (!claim) {
    return { kind: "not_researched" };
  }

  if (claim.state !== "known") {
    return { kind: claim.state, checkedAt: claim.checkedAt };
  }

  return {
    kind: "known",
    verification: claim.verification,
    isStale: isStale(claim.checkedAt, now, staleAfterDays),
    source: claim.source,
    quote: claim.quote,
    checkedAt: claim.checkedAt,
  };
}
