import { z } from "zod";
import { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";
import { optionalHttpUrl } from "./httpUrl";

/** Blank → null, otherwise trimmed. */
export const optionalTrimmed = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()));

/** Blank → null, otherwise a finite integer (never NaN). */
export const optionalInt = z
  .string()
  .transform((v) => (v.trim() === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), "invalid number")
  .refine((v) => v === null || Number.isInteger(v), "must be a whole number");

/**
 * The admin program create/edit form. updateProgramAction passes every parsed
 * field, so both forms must carry every field here or a save wipes it.
 */
export const programFormSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  directorName: optionalTrimmed,
  credential: z
    .union([z.enum(CREDENTIALS), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  modality: z
    .union([z.enum(MODALITIES), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  accreditationStatus: optionalTrimmed,
  programLengthMonths: optionalInt,
  classSize: optionalInt,
  websiteUrl: optionalHttpUrl,
});

export function programFormInput(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    directorName: formData.get("directorName") ?? "",
    credential: formData.get("credential") ?? "",
    modality: formData.get("modality") ?? "",
    accreditationStatus: formData.get("accreditationStatus") ?? "",
    programLengthMonths: formData.get("programLengthMonths") ?? "",
    classSize: formData.get("classSize") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
  };
}
