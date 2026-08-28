// src/components/AddChecklistItemForm.tsx
"use client";

import { addChecklistItemAction } from "@/app/actions/checklists";

export function AddChecklistItemForm({ checklistId }: { checklistId: number }) {
  return (
    <form
      action={addChecklistItemAction.bind(null, checklistId)}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <input
        type="text"
        name="title"
        placeholder="New task"
        required
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="date"
        name="dueAt"
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="url"
        name="linkUrl"
        placeholder="Link (optional)"
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add task
      </button>
    </form>
  );
}
