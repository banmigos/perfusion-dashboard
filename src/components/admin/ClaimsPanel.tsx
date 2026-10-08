// src/components/admin/ClaimsPanel.tsx
import type { ClaimWithSource, SubjectTable } from "@/domain/claims";
import { standardClaimFieldKeys } from "@/domain/admin/claims";
import { ClaimEvidence } from "./ClaimEvidence";
import { FreshnessPill } from "../FreshnessPill";
import { CLAIM_STATES, SOURCE_TYPES } from "@/db/schema/provenance";
import {
  upsertClaimAction,
  setClaimVerificationAction,
} from "@/app/actions/adminClaims";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";

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
  // Suggest keys already on this subject plus its standard fact columns, so
  // a typo doesn't create an orphan claim nothing reads.
  const fieldKeyOptions = [
    ...new Set([
      ...claims.map((c) => c.fieldKey),
      ...standardClaimFieldKeys(subjectTable),
    ]),
  ];
  const datalistId = `claim-field-keys-${subjectTable}-${subjectId}`;

  return (
    <Card inset className="mt-4 p-3">
      <h3 className="text-sm font-semibold text-fg">Claims</h3>

      {claims.length === 0 ? (
        <p className="mt-1 text-xs text-muted">No claims recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="rounded-md border border-line bg-surface p-3 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-fg">{claim.fieldKey}</span>
                <span className="text-muted">{claim.state}</span>
                <FreshnessPill
                  verification={claim.verification}
                  isStale={false}
                />
              </div>
              <ClaimEvidence
                sourceUrl={claim.source?.url ?? null}
                quote={claim.quote}
                note={claim.note}
              />
              {claim.checkedAt && (
                <p className="mt-1 text-muted">
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
                  <Button type="submit" variant="secondary" size="sm">
                    mark verified
                  </Button>
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
                  <Button type="submit" variant="secondary" size="sm">
                    mark needs review
                  </Button>
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
        <label className="flex flex-col gap-1 text-xs text-muted">
          field key
          <Input
            type="text"
            name="fieldKey"
            required
            list={datalistId}
            placeholder="e.g. deadline_date"
          />
          <datalist id={datalistId}>
            {fieldKeyOptions.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          state
          <Select name="state" defaultValue="">
            <option value="">— keep current state —</option>
            {CLAIM_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          source URL
          <Input type="url" name="sourceUrl" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          source type
          <Select name="sourceType">
            <option value="">—</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          quote
          <Input type="text" name="quote" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          checked at
          <Input type="date" name="checkedAt" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          note (blank keeps existing)
          <Textarea name="note" rows={2} />
        </label>
        <Button type="submit" variant="primary" size="sm">
          Save claim
        </Button>
      </form>
    </Card>
  );
}
