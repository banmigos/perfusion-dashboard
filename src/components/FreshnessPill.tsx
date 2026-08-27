import type { Verification } from "@/lib/factState";

const LABEL: Record<Verification, string> = {
  draft: "draft",
  needs_review: "needs review",
  verified: "verified",
  stale: "stale",
  archived: "archived",
};

export function FreshnessPill({
  verification,
  isStale,
}: {
  verification: Verification;
  isStale: boolean;
}) {
  const label = isStale && verification !== "stale" ? "stale" : LABEL[verification];
  const treatAsStale = isStale || verification === "stale" || verification === "needs_review";

  const colorClass =
    verification === "verified" && !isStale
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      : treatAsStale
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
        : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
