"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { saveProgram, unsaveProgram, updateSavedProgram } from "@/domain/saved";
import { PRIORITIES } from "@/db/schema/personal";

export async function saveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  saveProgram(db, programId);
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/my");
  revalidatePath("/");
}

export async function unsaveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  unsaveProgram(db, programId);
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/my");
  revalidatePath("/");
}

const updateSavedProgramSchema = z.object({
  priority: z.enum([...PRIORITIES, ""]),
  personalNote: z.string(),
});

export async function updateSavedProgramAction(
  savedProgramId: number,
  schoolSlug: string,
  programSlug: string,
  formData: FormData,
): Promise<void> {
  const parsed = updateSavedProgramSchema.parse({
    priority: formData.get("priority") ?? "",
    personalNote: formData.get("personalNote") ?? "",
  });

  updateSavedProgram(db, savedProgramId, {
    priority: parsed.priority === "" ? null : parsed.priority,
    personalNote:
      parsed.personalNote.trim() === "" ? null : parsed.personalNote,
  });
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/my");
  revalidatePath("/");
}
