// src/app/verify/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { listVerifyQueue, type VerifyQueueItem } from "@/domain/verify";
import { setClaimVerificationAction } from "@/app/actions/adminClaims";
import { ClaimEvidence } from "@/components/admin/ClaimEvidence";

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

export default function VerifyPage() {
  const queue = listVerifyQueue(db);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Needs Verification</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {queue.length} claim{queue.length === 1 ? "" : "s"} pending. Saved
        programs with the nearest deadline are listed first.
      </p>

      {queue.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Nothing to verify.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {queue.map((item) => {
            const href = adminHref(item);
            return (
              <li
                key={item.claim.id}
                className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <Link href={href} className="font-medium hover:underline">
                      {item.subjectLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.subjectLabel}</span>
                  )}
                  <span className="text-xs text-zinc-500">
                    {item.school?.name}
                    {item.program ? ` — ${item.program.name}` : ""}
                  </span>
                  {item.isSaved && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      saved
                    </span>
                  )}
                  {item.deadlineDate && (
                    <span className="text-xs text-zinc-500">
                      due {item.deadlineDate}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {item.claim.fieldKey} — {item.claim.state} —{" "}
                  {item.claim.verification}
                </p>
                <div className="text-xs">
                  <ClaimEvidence
                    sourceUrl={item.source?.url ?? null}
                    quote={item.claim.quote}
                    note={item.claim.note}
                  />
                </div>
                <form
                  action={setClaimVerificationAction.bind(
                    null,
                    item.claim.id,
                    "verified",
                  )}
                  className="mt-2 inline"
                >
                  <button
                    type="submit"
                    className="text-xs text-green-700 underline dark:text-green-400"
                  >
                    mark verified
                  </button>
                </form>
                <form
                  action={setClaimVerificationAction.bind(
                    null,
                    item.claim.id,
                    "needs_review",
                  )}
                  className="ml-3 mt-2 inline"
                >
                  <button
                    type="submit"
                    className="text-xs text-amber-700 underline dark:text-amber-400"
                  >
                    mark needs review
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
