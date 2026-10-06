// src/app/actions/adminClaims.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { setClaimVerification, upsertClaim } from "@/domain/admin/claims";
import { CLAIM_STATES, SOURCE_TYPES } from "@/db/schema/provenance";
import type { SubjectTable } from "@/domain/claims";

function revalidateAdmin(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/verify");
  revalidatePath("/programs", "layout");
}

const checkedAtSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00.000Z`)));

const claimFormSchema = z
  .object({
    fieldKey: z.string().trim().min(1, "field key required"),
    state: z.enum(CLAIM_STATES),
    sourceUrl: z.string().trim(),
    sourceType: z.union([z.enum(SOURCE_TYPES), z.literal("")]),
    quote: z.string().trim(),
    note: z.string().trim(),
    checkedAt: checkedAtSchema,
  })
  .refine((v) => v.state !== "known" || v.sourceUrl !== "", {
    message: "a known fact requires a source URL",
    path: ["sourceUrl"],
  });

export async function upsertClaimAction(
  subjectTable: SubjectTable,
  subjectId: number,
  formData: FormData,
): Promise<void> {
  const parsed = claimFormSchema.parse({
    fieldKey: formData.get("fieldKey") ?? "",
    state: formData.get("state") ?? "",
    sourceUrl: formData.get("sourceUrl") ?? "",
    sourceType: formData.get("sourceType") ?? "",
    quote: formData.get("quote") ?? "",
    note: formData.get("note") ?? "",
    checkedAt: formData.get("checkedAt") ?? "",
  });

  upsertClaim(db, {
    subjectTable,
    subjectId,
    fieldKey: parsed.fieldKey,
    state: parsed.state,
    sourceUrl: parsed.sourceUrl === "" ? null : parsed.sourceUrl,
    sourceType: parsed.sourceType === "" ? undefined : parsed.sourceType,
    quote: parsed.quote === "" ? null : parsed.quote,
    // Empty note = keep the existing one: claims.note holds imported
    // legacy/lead values that an edit must not wipe.
    note: parsed.note === "" ? undefined : parsed.note,
    checkedAt: parsed.checkedAt,
  });
  revalidateAdmin();
}

const verificationActionSchema = z.enum(["verified", "needs_review"]);

export async function setClaimVerificationAction(
  claimId: number,
  verification: string,
): Promise<void> {
  setClaimVerification(
    db,
    claimId,
    verificationActionSchema.parse(verification),
  );
  revalidateAdmin();
}
