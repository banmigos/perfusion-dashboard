import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { changeLog, importBatches, importConflicts } from "@/db/schema/audit";

export const importBatchInsertSchema = createInsertSchema(importBatches);
export const importBatchSelectSchema = createSelectSchema(importBatches);

export const importConflictInsertSchema = createInsertSchema(importConflicts);
export const importConflictSelectSchema = createSelectSchema(importConflicts);

export const changeLogInsertSchema = createInsertSchema(changeLog);
export const changeLogSelectSchema = createSelectSchema(changeLog);
