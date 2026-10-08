import type { Verification } from "@/lib/factState";
import { Badge, type BadgeTone } from "./ui/Badge";

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
  const label =
    isStale && verification !== "stale" ? "stale" : LABEL[verification];
  const treatAsStale =
    isStale || verification === "stale" || verification === "needs_review";

  const tone: BadgeTone =
    verification === "verified" && !isStale
      ? "ok"
      : treatAsStale
        ? "warn"
        : "neutral";

  return <Badge tone={tone}>{label}</Badge>;
}
