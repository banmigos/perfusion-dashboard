import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { claims, sources } from "@/db/schema/provenance";

export const sourceInsertSchema = createInsertSchema(sources);
export const sourceSelectSchema = createSelectSchema(sources);

export const claimInsertSchema = createInsertSchema(claims);
export const claimSelectSchema = createSelectSchema(claims);
