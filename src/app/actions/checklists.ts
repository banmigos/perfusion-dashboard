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

export async function generateChecklistAction(
  savedProgramId: number,
): Promise<void> {
  generateChecklist(db, savedProgramId);
  revalidatePath("/my");
  revalidatePath("/");
}

const dueDateSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00.000Z`)));

const addItemSchema = z.object({
  title: z.string().trim().min(1, "title required"),
  dueAt: dueDateSchema,
  linkUrl: z.string(),
});

export async function addChecklistItemAction(
  checklistId: number,
  formData: FormData,
): Promise<void> {
  const parsed = addItemSchema.parse({
    title: formData.get("title") ?? "",
    dueAt: formData.get("dueAt") ?? "",
    linkUrl: formData.get("linkUrl") ?? "",
  });

  addChecklistItem(db, checklistId, {
    title: parsed.title,
    detail: null,
    dueAt: parsed.dueAt,
    linkUrl: parsed.linkUrl.trim() === "" ? null : parsed.linkUrl,
  });
  revalidatePath("/my");
  revalidatePath("/");
}

const statusSchema = z.enum(CHECKLIST_ITEM_STATUSES);

export async function updateChecklistItemStatusAction(
  itemId: number,
  status: string,
): Promise<void> {
  updateChecklistItem(db, itemId, { status: statusSchema.parse(status) });
  revalidatePath("/my");
  revalidatePath("/");
}

export async function updateChecklistItemDueDateAction(
  itemId: number,
  formData: FormData,
): Promise<void> {
  const dueAt = dueDateSchema.parse(formData.get("dueAt") ?? "");
  updateChecklistItem(db, itemId, { dueAt });
  revalidatePath("/my");
  revalidatePath("/");
}

export async function deleteChecklistItemAction(itemId: number): Promise<void> {
  deleteChecklistItem(db, itemId);
  revalidatePath("/my");
  revalidatePath("/");
}
