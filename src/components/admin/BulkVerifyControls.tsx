"use client";

import { Button } from "@/components/ui/Button";

const FORM_ID = "bulk-verify";

// "select all" only ticks boxes marked data-bulk-eligible (known + quoted);
// "clear" unticks every box.
function setAll(checked: boolean): void {
  document
    .querySelectorAll<HTMLInputElement>(
      `input[name="claimId"][form="${FORM_ID}"]`,
    )
    .forEach((box) => {
      if (checked && box.dataset.bulkEligible !== "true") return;
      box.checked = checked;
    });
}

export function BulkVerifyControls() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <Button size="sm" onClick={() => setAll(true)}>
        select known + quoted
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAll(false)}>
        clear
      </Button>
      <Button type="submit" form={FORM_ID} variant="primary" size="sm">
        verify selected
      </Button>
      <span className="text-muted">
        Verifying asserts you re-read each source just now.
      </span>
    </div>
  );
}
