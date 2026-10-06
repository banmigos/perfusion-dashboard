// src/components/admin/ClaimsPanel.tsx
import type { ClaimWithSource, SubjectTable } from "@/domain/claims";
import { CLAIM_STATES, SOURCE_TYPES } from "@/db/schema/provenance";
import {
  upsertClaimAction,
  setClaimVerificationAction,
} from "@/app/actions/adminClaims";

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function ClaimsPanel({
  subjectTable,
  subjectId,
  claims,
}: {
  subjectTable: SubjectTable;
  subjectId: number;
  claims: ClaimWithSource[];
}) {
  return (
    <div className="mt-4 rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Claims</h3>

      {claims.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">No claims recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{claim.fieldKey}</span>
                <span>{claim.state}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                  {claim.verification}
                </span>
                {claim.source && (
                  <a
                    href={claim.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    source
                  </a>
                )}
              </div>
              {claim.quote && (
                <p className="mt-1 italic">&ldquo;{claim.quote}&rdquo;</p>
              )}
              {claim.note && (
                <p className="mt-1 whitespace-pre-line text-zinc-500">
                  {claim.note}
                </p>
              )}
              {claim.checkedAt && (
                <p className="mt-1 text-zinc-500">
                  checked {formatDate(claim.checkedAt)}
                </p>
              )}
              {claim.verification !== "verified" && (
                <form
                  action={setClaimVerificationAction.bind(
                    null,
                    claim.id,
                    "verified",
                  )}
                  className="mt-1 inline"
                >
                  <button
                    type="submit"
                    className="text-green-700 underline dark:text-green-400"
                  >
                    mark verified
                  </button>
                </form>
              )}
              {claim.verification !== "needs_review" && (
                <form
                  action={setClaimVerificationAction.bind(
                    null,
                    claim.id,
                    "needs_review",
                  )}
                  className="ml-2 mt-1 inline"
                >
                  <button
                    type="submit"
                    className="text-amber-700 underline dark:text-amber-400"
                  >
                    mark needs review
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        action={upsertClaimAction.bind(null, subjectTable, subjectId)}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          field key
          <input
            type="text"
            name="fieldKey"
            required
            placeholder="e.g. deadline_date"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          state
          <select
            name="state"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {CLAIM_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          source URL
          <input
            type="url"
            name="sourceUrl"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          source type
          <select
            name="sourceType"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          quote
          <input
            type="text"
            name="quote"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          checked at
          <input
            type="date"
            name="checkedAt"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          note (blank keeps existing)
          <textarea
            name="note"
            rows={2}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save claim
        </button>
      </form>
    </div>
  );
}
