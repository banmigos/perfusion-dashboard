// src/components/AddChecklistItemForm.tsx
"use client";

import { useRef } from "react";
import { addChecklistItemAction } from "@/app/actions/checklists";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/categories";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

export function AddChecklistItemForm({ checklistId }: { checklistId: number }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await addChecklistItemAction(checklistId, formData);
        formRef.current?.reset();
      }}
      className="mt-4 flex flex-wrap items-end gap-2 border-t border-dashed border-line pt-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
        New task
        <Input
          type="text"
          name="title"
          placeholder="e.g. Ask Dr. Lee for a letter"
          required
          compact
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Kind
        <Select name="category" defaultValue="" compact>
          <option value="">Other</option>
          {CATEGORY_ORDER.filter((c) => c !== "other").map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Due
        <Input type="date" name="dueAt" compact />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Link
        <Input type="url" name="linkUrl" placeholder="Optional" compact />
      </label>
      <Button type="submit" variant="primary" size="sm">
        Add task
      </Button>
    </form>
  );
}
