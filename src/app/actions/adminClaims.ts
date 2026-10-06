// src/app/actions/adminClaims.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { setClaimVerification, upsertClaim } from "@/domain/admin/claims";
import {
  CLAIM_STATES,
  SOURCE_TYPES,
  SUBJECT_TABLES,
} from "@/db/schema/provenance";
import type { SubjectTable } from "@/domain/claims";
import { optionalHttpUrl } from "@/lib/zod/httpUrl";

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
    sourceUrl: optionalHttpUrl,
    sourceType: z.union([z.enum(SOURCE_TYPES), z.literal("")]),
    quote: z.string().trim(),
    note: z.string().trim(),
    checkedAt: checkedAtSchema,
  })
  .refine((v) => v.state !== "known" || v.sourceUrl !== null, {
    message: "a known fact requires a source URL",
    path: ["sourceUrl"],
  });

const subjectTableSchema = z.enum(SUBJECT_TABLES);
const idSchema = z.number().int().positive();

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
    subjectTable: subjectTableSchema.parse(subjectTable),
    subjectId: idSchema.parse(subjectId),
    fieldKey: parsed.fieldKey,
    state: parsed.state,
    // Blank sourceUrl, quote, note and checkedAt all mean "keep existing":
    // the form is not pre-filled, so blank is "not provided", not "clear".
    // (A blank checkedAt must not become null, or upsertClaim would stamp
    // today onto a kept-verified claim: a fabricated check date.)
    sourceUrl: parsed.sourceUrl ?? undefined,
    sourceType: parsed.sourceType === "" ? undefined : parsed.sourceType,
    quote: parsed.quote === "" ? undefined : parsed.quote,
    // claims.note holds imported legacy/lead values an edit must not wipe.
    note: parsed.note === "" ? undefined : parsed.note,
    checkedAt: parsed.checkedAt ?? undefined,
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
    idSchema.parse(claimId),
    verificationActionSchema.parse(verification),
  );
  revalidateAdmin();
}
