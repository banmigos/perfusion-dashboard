import { z } from "zod";

export const legacyRawRecordSchema = z
  .object({
    name: z.string().min(1),
    city: z.string().min(1),
    degree: z.string().min(1),
    deadline: z.string().min(1),
    gpa: z.number(),
    gre: z.string(),
    tuition: z.number(),
    classSize: z.number().int(),
    lat: z.number(),
    lng: z.number(),
    url: z.string().url(),
    prereqs: z.array(z.string()),
    notes: z.string().optional(),
  })
  .strict();

export const legacyRecordSchema = z
  .object({
    raw: legacyRawRecordSchema,
    triage: z.array(z.string()),
  })
  .strict();

export const legacyCaptureSchema = z
  .object({
    format: z.string(),
    captured_at: z.string(),
    origin: z
      .object({
        app: z.string(),
        repo: z.string(),
        commit: z.string(),
        file: z.string(),
        exported_symbol: z.string(),
      })
      .strict(),
    import_policy: z
      .object({
        verification: z.string(),
        locked: z.boolean(),
        claim_state: z.string(),
        checked_at: z.null(),
        rationale: z.string(),
      })
      .strict(),
    known_issues: z.array(z.string()),
    record_count: z.number().int(),
    records: z.array(legacyRecordSchema),
  })
  .strict();

export type LegacyCapture = z.infer<typeof legacyCaptureSchema>;
export type LegacyRecord = z.infer<typeof legacyRecordSchema>;
