"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  addChecklistItem,
  deleteChecklistItem,
  generateChecklist,
  updateChecklistItem,
} from "@/domain/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";

function revalidateChecklistViews() {
  revalidatePath("/programs", "layout");
  revalidatePath("/requirements");
  revalidatePath("/timeline");
  revalidatePath("/my");
  revalidatePath("/");
}

export async function generateChecklistAction(
  savedProgramId: number,
): Promise<void> {
  generateChecklist(db, savedProgramId);
  revalidateChecklistViews();
}

const dueDateSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00.000Z`)));

const addItemSchema = z.object({
  title: z.string().trim().min(1, "title required"),
  dueAt: dueDateSchema,
  linkUrl: z.string(),
  category: z.enum([...REQUIREMENT_CATEGORIES, ""]),
});

export async function addChecklistItemAction(
  checklistId: number,
  formData: FormData,
): Promise<void> {
  const parsed = addItemSchema.parse({
    title: formData.get("title") ?? "",
    dueAt: formData.get("dueAt") ?? "",
    linkUrl: formData.get("linkUrl") ?? "",
    category: formData.get("category") ?? "",
  });

  addChecklistItem(db, checklistId, {
    title: parsed.title,
    detail: null,
    category: parsed.category === "" ? null : parsed.category,
    dueAt: parsed.dueAt,
    linkUrl: parsed.linkUrl.trim() === "" ? null : parsed.linkUrl,
  });
  revalidateChecklistViews();
}

const statusSchema = z.enum(CHECKLIST_ITEM_STATUSES);

export async function updateChecklistItemStatusAction(
  itemId: number,
  status: string,
): Promise<void> {
  updateChecklistItem(db, itemId, { status: statusSchema.parse(status) });
  revalidateChecklistViews();
}

export async function updateChecklistItemDueDateAction(
  itemId: number,
  formData: FormData,
): Promise<void> {
  const dueAt = dueDateSchema.parse(formData.get("dueAt") ?? "");
  updateChecklistItem(db, itemId, { dueAt });
  revalidateChecklistViews();
}

export async function deleteChecklistItemAction(itemId: number): Promise<void> {
  deleteChecklistItem(db, itemId);
  revalidateChecklistViews();
}
