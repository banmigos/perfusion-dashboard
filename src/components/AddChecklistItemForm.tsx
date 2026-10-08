// src/components/AddChecklistItemForm.tsx
"use client";

import { addChecklistItemAction } from "@/app/actions/checklists";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

export function AddChecklistItemForm({ checklistId }: { checklistId: number }) {
  return (
    <form
      action={addChecklistItemAction.bind(null, checklistId)}
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      <Input type="text" name="title" placeholder="New task" required compact />
      <Input type="date" name="dueAt" compact />
      <Input type="url" name="linkUrl" placeholder="Link (optional)" compact />
      <Button type="submit" variant="primary" size="sm">
        Add task
      </Button>
    </form>
  );
}
