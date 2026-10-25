"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  saveProgram,
  setApplicationStatus,
  unsaveProgram,
  updateSavedProgram,
} from "@/domain/saved";
import { APPLICATION_STATUSES, PRIORITIES } from "@/db/schema/personal";

/** Every page that reads saved-program state. */
function revalidateApplicationViews(schoolSlug: string, programSlug: string) {
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/programs");
  revalidatePath("/timeline");
  revalidatePath("/requirements");
  revalidatePath("/my");
  revalidatePath("/");
}

export async function saveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  saveProgram(db, programId);
  revalidateApplicationViews(schoolSlug, programSlug);
}

export async function unsaveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  unsaveProgram(db, programId);
  revalidateApplicationViews(schoolSlug, programSlug);
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
  revalidateApplicationViews(schoolSlug, programSlug);
}

const applicationStatusSchema = z.enum(APPLICATION_STATUSES);

export async function setApplicationStatusAction(
  savedProgramId: number,
  schoolSlug: string,
  programSlug: string,
  status: string,
): Promise<void> {
  setApplicationStatus(
    db,
    savedProgramId,
    applicationStatusSchema.parse(status),
  );
  revalidateApplicationViews(schoolSlug, programSlug);
}
