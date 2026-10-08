// src/app/verify/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { listVerifyQueue, type VerifyQueueItem } from "@/domain/verify";
import { setClaimVerificationAction } from "@/app/actions/adminClaims";
import { ClaimEvidence } from "@/components/admin/ClaimEvidence";
import { FreshnessPill } from "@/components/FreshnessPill";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

function adminHref(item: VerifyQueueItem): string | null {
  if (!item.school) return null;
  if (item.claim.subjectTable === "schools") {
    return `/admin/schools/${item.school.slug}`;
  }
  if (!item.program) return null;
  if (item.claim.subjectTable === "programs") {
    return `/admin/schools/${item.school.slug}/${item.program.slug}`;
  }
  // application_cycles, requirements, prerequisite_courses and tuition_estimates
  // link to the program page, which lists its cycles. This is a deliberate
  // fallback: queue items carry no cycle label to build a cycle URL from.
  return `/admin/schools/${item.school.slug}/${item.program.slug}`;
}

const STATE_LABEL: Record<VerifyQueueItem["claim"]["state"], string> = {
  known: "Known",
  unknown: "Unknown",
  not_published: "Not published",
  not_applicable: "N/A",
};

export default function VerifyPage() {
  const queue = listVerifyQueue(db);

  return (
    <div>
      <PageHeader
        title="Needs Verification"
        description={`${queue.length} claim${queue.length === 1 ? "" : "s"} pending. Saved programs with the nearest deadline are listed first.`}
      />

      {queue.length === 0 ? (
        <Card className="p-6 text-sm text-muted">Nothing to verify.</Card>
      ) : (
        <ul className="space-y-3">
          {queue.map((item) => {
            const href = adminHref(item);
            return (
              <li key={item.claim.id}>
                <Card className="p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {href ? (
                      <Link
                        href={href}
                        className="font-medium text-fg hover:text-accent-strong hover:underline"
                      >
                        {item.subjectLabel}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg">
                        {item.subjectLabel}
                      </span>
                    )}
                    <span className="text-xs text-muted">
                      {item.school?.name}
                      {item.program ? ` — ${item.program.name}` : ""}
                    </span>
                    {item.isSaved && <Badge tone="accent">saved</Badge>}
                    {item.deadlineDate && (
                      <span className="text-xs text-subtle">
                        due {item.deadlineDate}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-mono">{item.claim.fieldKey}</span>
                    <span
                      className={
                        item.claim.state === "known" ? "text-fg" : "italic"
                      }
                    >
                      {STATE_LABEL[item.claim.state]}
                    </span>
                    <FreshnessPill
                      verification={item.claim.verification}
                      isStale={false}
                    />
                  </p>
                  <div className="text-xs">
                    <ClaimEvidence
                      sourceUrl={item.source?.url ?? null}
                      quote={item.claim.quote}
                      note={item.claim.note}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form
                      action={setClaimVerificationAction.bind(
                        null,
                        item.claim.id,
                        "verified",
                      )}
                    >
                      <Button type="submit" variant="primary" size="sm">
                        mark verified
                      </Button>
                    </form>
                    <form
                      action={setClaimVerificationAction.bind(
                        null,
                        item.claim.id,
                        "needs_review",
                      )}
                    >
                      <Button type="submit" size="sm">
                        mark needs review
                      </Button>
                    </form>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
