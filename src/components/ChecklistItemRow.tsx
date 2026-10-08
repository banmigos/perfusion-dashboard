// src/components/ChecklistItemRow.tsx
"use client";

import { useTransition } from "react";
import {
  deleteChecklistItemAction,
  updateChecklistItemDueDateAction,
  updateChecklistItemStatusAction,
} from "@/app/actions/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";
import { taskTitle } from "@/lib/taskTitle";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { cn } from "./ui/cn";

type Item = {
  id: number;
  title: string;
  category?: string | null;
  derivedFromRequirementId?: number | null;
  dueAt: Date | null;
  status: (typeof CHECKLIST_ITEM_STATUSES)[number];
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

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
      <Select
        value={item.status}
        disabled={isPending}
        aria-label="Status"
        onChange={(e) =>
          startTransition(() => {
            void updateChecklistItemStatusAction(item.id, e.target.value);
          })
        }
        compact
      >
        {CHECKLIST_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>

      <span
        title={item.title}
        className={cn(
          "text-fg",
          item.status === "done" && "text-subtle line-through",
        )}
      >
        {taskTitle(item)}
      </span>

      {programLabel && (
        <span className="text-xs text-muted">{programLabel}</span>
      )}

      <form
        action={updateChecklistItemDueDateAction.bind(null, item.id)}
        className="flex items-center gap-1"
      >
        <Input
          compact
          type="date"
          name="dueAt"
          aria-label="Due date"
          defaultValue={item.dueAt ? formatDueDate(item.dueAt) : ""}
          className={cn(
            isOverdue(item.dueAt, item.status) && "border-danger text-danger",
          )}
        />
        <Button type="submit" variant="ghost" size="sm">
          set
        </Button>
      </form>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:text-accent-strong hover:underline"
        >
          link
        </a>
      )}

      <Button
        variant="danger"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void deleteChecklistItemAction(item.id);
          })
        }
        className="ml-auto"
      >
        delete
      </Button>
    </li>
  );
}
