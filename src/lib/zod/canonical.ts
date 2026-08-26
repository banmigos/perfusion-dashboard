import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import {
  applicationCycles,
  prerequisiteCourses,
  programs,
  requirements,
  schools,
  tuitionEstimates,
  users,
} from "@/db/schema/canonical";

export const userInsertSchema = createInsertSchema(users);
export const userSelectSchema = createSelectSchema(users);

export const schoolInsertSchema = createInsertSchema(schools);
export const schoolSelectSchema = createSelectSchema(schools);

export const programInsertSchema = createInsertSchema(programs);
export const programSelectSchema = createSelectSchema(programs);

export const applicationCycleInsertSchema =
  createInsertSchema(applicationCycles);
export const applicationCycleSelectSchema =
  createSelectSchema(applicationCycles);

export const requirementInsertSchema = createInsertSchema(requirements);
export const requirementSelectSchema = createSelectSchema(requirements);

export const prerequisiteCourseInsertSchema =
  createInsertSchema(prerequisiteCourses);
export const prerequisiteCourseSelectSchema =
  createSelectSchema(prerequisiteCourses);

export const tuitionEstimateInsertSchema = createInsertSchema(tuitionEstimates);
export const tuitionEstimateSelectSchema = createSelectSchema(tuitionEstimates);
