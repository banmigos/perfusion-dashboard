import { z } from "zod";
import { CLAIM_STATES, SOURCE_TYPES } from "@/db/schema/provenance";
import { optionalHttpUrl } from "./httpUrl";

const checkedAtSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00.000Z`)));

/**
 * The admin claim form. Every blank field means "keep existing" — including
 * state ("" → undefined), so editing a claim to add a note can never silently
 * change its state. A brand-new claim with no state is rejected by upsertClaim.
 */
export const claimFormSchema = z
  .object({
    fieldKey: z.string().trim().min(1, "field key required"),
    state: z
      .union([z.enum(CLAIM_STATES), z.literal("")])
      .transform((v) => (v === "" ? undefined : v)),
    sourceUrl: optionalHttpUrl,
    sourceType: z.union([z.enum(SOURCE_TYPES), z.literal("")]),
    quote: z.string().trim(),
    note: z.string().trim(),
    checkedAt: checkedAtSchema,
  })
  // Only an explicit "known" is checked here; a kept state keeps its source,
  // and upsertClaim re-checks known-requires-source against the merged row.
  .refine((v) => v.state !== "known" || v.sourceUrl !== null, {
    message: "a known fact requires a source URL",
    path: ["sourceUrl"],
  });
