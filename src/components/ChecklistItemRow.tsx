// src/components/ChecklistItemRow.tsx
"use client";

import { useTransition } from "react";
import {
  deleteChecklistItemAction,
  updateChecklistItemDueDateAction,
  updateChecklistItemStatusAction,
} from "@/app/actions/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";

type Item = {
  id: number;
  title: string;
  dueAt: Date | null;
  status: (typeof CHECKLIST_ITEM_STATUSES)[number];
  linkUrl: string | null;
};

function formatDueDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isOverdue(d: Date | null, status: Item["status"]): boolean {
  return (
    d !== null &&
    d.getTime() < Date.now() &&
    status !== "done" &&
    status !== "skipped"
  );
}

export function ChecklistItemRow({
  item,
  programLabel,
}: {
  item: Item;
  programLabel?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <select
        value={item.status}
        disabled={isPending}
        onChange={(e) =>
          startTransition(() => {
            void updateChecklistItemStatusAction(item.id, e.target.value);
          })
        }
        className="rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        {CHECKLIST_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <span
        className={item.status === "done" ? "text-zinc-400 line-through" : ""}
      >
        {item.title}
      </span>

      {programLabel && (
        <span className="text-xs text-zinc-500">{programLabel}</span>
      )}

      <form
        action={updateChecklistItemDueDateAction.bind(null, item.id)}
        className="flex items-center gap-1"
      >
        <input
          type="date"
          name="dueAt"
          defaultValue={item.dueAt ? formatDueDate(item.dueAt) : ""}
          className={`rounded border px-1 py-0.5 text-xs dark:bg-zinc-900 ${
            isOverdue(item.dueAt, item.status)
              ? "border-red-400 text-red-600 dark:text-red-400"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
        <button type="submit" className="text-xs text-zinc-500 underline">
          set
        </button>
      </form>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 underline dark:text-blue-400"
        >
          link
        </a>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void deleteChecklistItemAction(item.id);
          })
        }
        className="ml-auto text-xs text-red-600 dark:text-red-400"
      >
        delete
      </button>
    </li>
  );
}
