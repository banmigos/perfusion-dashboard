import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { checklistItems, personalChecklists, savedPrograms } from "@/db/schema/personal";

export const savedProgramInsertSchema = createInsertSchema(savedPrograms);
export const savedProgramSelectSchema = createSelectSchema(savedPrograms);

export const personalChecklistInsertSchema = createInsertSchema(personalChecklists);
export const personalChecklistSelectSchema = createSelectSchema(personalChecklists);

export const checklistItemInsertSchema = createInsertSchema(checklistItems);
export const checklistItemSelectSchema = createSelectSchema(checklistItems);
