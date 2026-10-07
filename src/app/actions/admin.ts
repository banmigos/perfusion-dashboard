// src/app/actions/admin.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  archiveSchool,
  createSchool,
  updateSchool,
} from "@/domain/admin/schools";
import {
  archiveProgram,
  createProgram,
  updateProgram,
} from "@/domain/admin/programs";
import { archiveCycle, createCycle, updateCycle } from "@/domain/admin/cycles";
import {
  archiveRequirement,
  createRequirement,
  updateRequirement,
} from "@/domain/admin/requirements";
import { findOrCreateSource, updateSource } from "@/domain/admin/sources";
import {
  CREDENTIALS,
  DEADLINE_TYPES,
  MODALITIES,
  REQUIREMENT_CATEGORIES,
  CAS_SERVICES,
} from "@/db/schema/canonical";
import { SOURCE_TYPES } from "@/db/schema/provenance";
import { slugify } from "@/lib/slug";
import { httpUrl, optionalHttpUrl } from "@/lib/zod/httpUrl";

function revalidateAdmin(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/verify");
  revalidatePath("/programs", "layout");
}

const optionalTrimmed = z
  .string()
  .transform((v) => (v.trim() === "" ? null : v.trim()));

// --- schools ---

const schoolFormSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  city: optionalTrimmed,
  state: optionalTrimmed,
  websiteUrl: optionalHttpUrl,
});

export async function createSchoolAction(formData: FormData): Promise<void> {
  const parsed = schoolFormSchema.parse({
    name: formData.get("name") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
  });
  createSchool(db, { slug: slugify(parsed.name), ...parsed });
  revalidateAdmin();
}

export async function updateSchoolAction(
  schoolId: number,
  formData: FormData,
): Promise<void> {
  const parsed = schoolFormSchema.parse({
    name: formData.get("name") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
  });
  updateSchool(db, schoolId, parsed);
  revalidateAdmin();
}

export async function archiveSchoolAction(schoolId: number): Promise<void> {
  archiveSchool(db, schoolId);
  revalidateAdmin();
}

// --- programs ---

const credentialSchema = z.enum(CREDENTIALS);
const modalitySchema = z.enum(MODALITIES);

const programFormSchema = z.object({
  name: z.string().trim().min(1, "name required"),
  directorName: optionalTrimmed,
  credential: z
    .union([credentialSchema, z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  modality: z
    .union([modalitySchema, z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  websiteUrl: optionalHttpUrl,
});

export async function createProgramAction(
  schoolId: number,
  formData: FormData,
): Promise<void> {
  const parsed = programFormSchema.parse({
    name: formData.get("name") ?? "",
    directorName: formData.get("directorName") ?? "",
    credential: formData.get("credential") ?? "",
    modality: formData.get("modality") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
  });
  createProgram(db, { schoolId, slug: slugify(parsed.name), ...parsed });
  revalidateAdmin();
}

export async function updateProgramAction(
  programId: number,
  formData: FormData,
): Promise<void> {
  const parsed = programFormSchema.parse({
    name: formData.get("name") ?? "",
    directorName: formData.get("directorName") ?? "",
    credential: formData.get("credential") ?? "",
    modality: formData.get("modality") ?? "",
    websiteUrl: formData.get("websiteUrl") ?? "",
  });
  updateProgram(db, programId, parsed);
  revalidateAdmin();
}

export async function archiveProgramAction(programId: number): Promise<void> {
  archiveProgram(db, programId);
  revalidateAdmin();
}

// --- application cycles ---

const calendarDateSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : v));

const cycleFormSchema = z.object({
  cycleLabel: z.string().trim().min(1, "cycle label required"),
  entryYear: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .refine((v) => v === null || Number.isFinite(v), "invalid year")
    .refine((v) => v === null || Number.isInteger(v), "invalid year"),
  deadlineDate: calendarDateSchema,
  deadlineType: z
    .union([z.enum(DEADLINE_TYPES), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  casService: z
    .union([z.enum(CAS_SERVICES), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
});

export async function createCycleAction(
  programId: number,
  formData: FormData,
): Promise<void> {
  const parsed = cycleFormSchema.parse({
    cycleLabel: formData.get("cycleLabel") ?? "",
    entryYear: formData.get("entryYear") ?? "",
    deadlineDate: formData.get("deadlineDate") ?? "",
    deadlineType: formData.get("deadlineType") ?? "",
    casService: formData.get("casService") ?? "",
  });
  createCycle(db, { programId, ...parsed });
  revalidateAdmin();
}

export async function updateCycleAction(
  cycleId: number,
  schoolSlug: string,
  programSlug: string,
  formData: FormData,
): Promise<void> {
  const parsed = cycleFormSchema.parse({
    cycleLabel: formData.get("cycleLabel") ?? "",
    entryYear: formData.get("entryYear") ?? "",
    deadlineDate: formData.get("deadlineDate") ?? "",
    deadlineType: formData.get("deadlineType") ?? "",
    casService: formData.get("casService") ?? "",
  });
  updateCycle(db, cycleId, parsed);
  revalidateAdmin();
  // The label is part of the URL; follow a rename. Outside any try/catch.
  redirect(
    `/admin/schools/${encodeURIComponent(schoolSlug)}/${encodeURIComponent(programSlug)}/${encodeURIComponent(parsed.cycleLabel)}`,
  );
}

export async function archiveCycleAction(cycleId: number): Promise<void> {
  archiveCycle(db, cycleId);
  revalidateAdmin();
}

// --- requirements ---

const valueBoolFormSchema = z
  .enum(["", "true", "false"])
  .transform((v) => (v === "" ? null : v === "true"));

const requirementFormSchema = z.object({
  category: z.enum(REQUIREMENT_CATEGORIES),
  label: z.string().trim().min(1, "label required"),
  valueText: optionalTrimmed,
  valueNumber: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .refine((v) => v === null || Number.isFinite(v), "invalid number"),
  valueBool: valueBoolFormSchema,
  valueDate: calendarDateSchema,
  // Tri-state: "" = unknown (null), never coerced to false.
  isRequired: valueBoolFormSchema,
});

export async function createRequirementAction(
  cycleId: number,
  formData: FormData,
): Promise<void> {
  const parsed = requirementFormSchema.parse({
    category: formData.get("category") ?? "",
    label: formData.get("label") ?? "",
    valueText: formData.get("valueText") ?? "",
    valueNumber: formData.get("valueNumber") ?? "",
    valueBool: formData.get("valueBool") ?? "",
    valueDate: formData.get("valueDate") ?? "",
    isRequired: formData.get("isRequired") ?? "",
  });
  createRequirement(db, { cycleId, ...parsed });
  revalidateAdmin();
}

export async function updateRequirementAction(
  requirementId: number,
  formData: FormData,
): Promise<void> {
  const parsed = requirementFormSchema.parse({
    category: formData.get("category") ?? "",
    label: formData.get("label") ?? "",
    valueText: formData.get("valueText") ?? "",
    valueNumber: formData.get("valueNumber") ?? "",
    valueBool: formData.get("valueBool") ?? "",
    valueDate: formData.get("valueDate") ?? "",
    isRequired: formData.get("isRequired") ?? "",
  });
  updateRequirement(db, requirementId, parsed);
  revalidateAdmin();
}

export async function archiveRequirementAction(
  requirementId: number,
): Promise<void> {
  archiveRequirement(db, requirementId);
  revalidateAdmin();
}

// --- sources ---

const sourceFormSchema = z.object({
  url: httpUrl,
  sourceType: z.enum(SOURCE_TYPES),
  title: optionalTrimmed,
  publisher: optionalTrimmed,
});

export async function createSourceAction(formData: FormData): Promise<void> {
  const parsed = sourceFormSchema.parse({
    url: formData.get("url") ?? "",
    sourceType: formData.get("sourceType") ?? "",
    title: formData.get("title") ?? "",
    publisher: formData.get("publisher") ?? "",
  });
  findOrCreateSource(db, parsed);
  revalidateAdmin();
}

export async function updateSourceAction(
  sourceId: number,
  formData: FormData,
): Promise<void> {
  const title = formData.get("title");
  const publisher = formData.get("publisher");
  updateSource(db, sourceId, {
    title:
      typeof title === "string" && title.trim() !== "" ? title.trim() : null,
    publisher:
      typeof publisher === "string" && publisher.trim() !== ""
        ? publisher.trim()
        : null,
  });
  revalidateAdmin();
}
