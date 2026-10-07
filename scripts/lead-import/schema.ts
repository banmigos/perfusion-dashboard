import { z } from "zod";
import { CREDENTIALS } from "@/db/schema/canonical";

/**
 * Verbatim directory cells. `null`, `"—"`, and (tuition only) `"verify"`
 * all mean "the directory shows no value"; see `isLeadValue` in apply.ts.
 */
export const leadRawRecordSchema = z
  .object({
    name: z.string().min(1),
    subtitle: z.string().nullable(),
    badge: z.string().nullable(),
    director: z.string().nullable(),
    location: z.string().min(1),
    degree: z.string().nullable(),
    length: z.string().nullable(),
    deadline: z.string().nullable(),
    min_gpa: z.string().nullable(),
    tuition: z.string().nullable(),
    key_requirements: z.string().nullable(),
    website_url: z.string().url().nullable(),
  })
  .strict();

export const leadTargetSchema = z.union([
  z.object({ legacy_key: z.string().min(1) }).strict(),
  z
    .object({
      create: z.object({ credential: z.enum(CREDENTIALS) }).strict(),
    })
    .strict(),
]);

export const leadRecordSchema = z
  .object({
    raw: leadRawRecordSchema,
    target: leadTargetSchema,
  })
  .strict();

export const leadCaptureSchema = z
  .object({
    format: z.literal("directory-lead-capture/v1"),
    captured_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    origin: z
      .object({
        url: z.string().url(),
        title: z.string().min(1),
        publisher: z.string().min(1),
        capture_method: z.string(),
      })
      .strict(),
    import_policy: z
      .object({
        verification: z.literal("draft"),
        locked: z.literal(false),
        claim_state: z.string(),
        checked_at: z.null(),
        rationale: z.string(),
      })
      .strict(),
    known_issues: z.array(z.string()),
    record_count: z.number().int(),
    records: z.array(leadRecordSchema),
  })
  .strict()
  .refine((capture) => capture.record_count === capture.records.length, {
    message: "record_count does not match records.length",
  });

export type LeadCapture = z.infer<typeof leadCaptureSchema>;
export type LeadRecord = z.infer<typeof leadRecordSchema>;
