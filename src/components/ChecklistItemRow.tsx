// src/components/ChecklistItemRow.tsx
"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  deleteChecklistItemAction,
  updateChecklistItemDueDateAction,
  updateChecklistItemStatusAction,
} from "@/app/actions/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";
import { CHECKLIST_STATUS_LABEL } from "@/lib/categories";
import { taskTitle } from "@/lib/taskTitle";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { cn } from "./ui/cn";

type Status = (typeof CHECKLIST_ITEM_STATUSES)[number];

type Item = {
  id: number;
  title: string;
  category?: string | null;
  derivedFromRequirementId?: number | null;
  dueAt: Date | null;
  status: Status;
  linkUrl: string | null;
};

function formatDueDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isOverdue(d: Date | null, status: Item["status"]): boolean {
  const now = new Date();
  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return (
    d !== null &&
    d.getTime() < todayUtcMidnight &&
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
  const [status, setStatus] = useOptimistic(item.status);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const title = taskTitle(item);
  const closed = status === "done" || status === "skipped";
  const overdue = isOverdue(item.dueAt, status);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
      {/* A checkbox for the common case: done or not. */}
      <input
        type="checkbox"
        checked={status === "done"}
        aria-label={`Mark "${title}" done`}
        disabled={isPending}
        onChange={(e) => {
          const next: Status = e.target.checked ? "done" : "todo";
          startTransition(async () => {
            setStatus(next);
            await updateChecklistItemStatusAction(item.id, next);
          });
        }}
        className="size-4 shrink-0 accent-[var(--venous)]"
      />

      <span
        title={item.title}
        className={cn(
          "min-w-40 flex-1 transition-colors",
          closed ? "text-subtle line-through" : "text-fg",
        )}
      >
        {title}
        {programLabel && (
          <span className="block text-xs text-muted no-underline">
            {programLabel}
          </span>
        )}
      </span>

      <Select
        value={status}
        disabled={isPending}
        aria-label={`Status of "${title}"`}
        onChange={(e) => {
          const next = e.target.value as Status;
          startTransition(async () => {
            setStatus(next);
            await updateChecklistItemStatusAction(item.id, next);
          });
        }}
        compact
      >
        {CHECKLIST_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CHECKLIST_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>

      <form
        action={updateChecklistItemDueDateAction.bind(null, item.id)}
        className="flex items-center gap-1"
      >
        <Input
          compact
          type="date"
          name="dueAt"
          aria-label={`Due date for "${title}"`}
          defaultValue={item.dueAt ? formatDueDate(item.dueAt) : ""}
          className={cn(
            "font-mono",
            overdue && "border-arterial text-arterial",
          )}
        />
        <Button type="submit" variant="ghost" size="sm">
          Set
        </Button>
      </form>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:text-accent-strong hover:underline"
        >
          Link
        </a>
      )}

      {confirmingDelete ? (
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="danger"
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await deleteChecklistItemAction(item.id);
              })
            }
          >
            Delete task
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmingDelete(false)}
          >
            Keep
          </Button>
        </span>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete "${title}"`}
          onClick={() => setConfirmingDelete(true)}
          className="ml-auto"
        >
          Delete
        </Button>
      )}
    </li>
  );
}
