import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";
import {
  archivedAt,
  canonicalStatus,
  createdAt,
  id,
  updatedAt,
} from "./_helpers";

export const users = sqliteTable("users", {
  id: id(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const CREDENTIALS = [
  "MS",
  "MPS",
  "MHS",
  "BS",
  "Certificate",
  "Other",
] as const;
export const MODALITIES = ["in_person", "hybrid", "online"] as const;
export const DEADLINE_TYPES = [
  "rolling",
  "firm",
  "priority",
  "unknown",
] as const;
export const CAS_SERVICES = ["none", "CASPA", "other"] as const;
export const REQUIREMENT_CATEGORIES = [
  "gpa",
  "prerequisite",
  "experience",
  "shadowing",
  "letters",
  "test",
  "transcript",
  "essay",
  "interview",
  "fee",
  "other",
] as const;
export const RESIDENCIES = [
  "in_state",
  "out_of_state",
  "international",
  "flat",
] as const;
export const TUITION_COVERS = [
  "total_program",
  "per_year",
  "per_credit",
] as const;

export const schools = sqliteTable(
  "schools",
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    city: text(),
    state: text(),
    country: text().notNull().default("US"),
    websiteUrl: text(),
    status: canonicalStatus(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("schools_slug_unique").on(t.slug)],
);

export const programs = sqliteTable(
  "programs",
  {
    id: id(),
    schoolId: integer()
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    slug: text().notNull(),
    name: text().notNull(),
    legacyKey: text(),
    directorName: text(),
    credential: text({ enum: CREDENTIALS }),
    modality: text({ enum: MODALITIES }),
    accreditationStatus: text(),
    caeAccredited: integer({ mode: "boolean" }),
    programLengthMonths: integer(),
    classSize: integer(),
    websiteUrl: text(),
    latitude: real(),
    longitude: real(),
    status: canonicalStatus(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("programs_school_slug_unique").on(t.schoolId, t.slug),
    index("programs_credential_idx").on(t.credential),
  ],
);

export const applicationCycles = sqliteTable(
  "application_cycles",
  {
    id: id(),
    programId: integer()
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    cycleLabel: text().notNull(),
    entryYear: integer(),
    applicationOpensDate: text(),
    deadlineDate: text(),
    deadlineTimeLocal: text(),
    deadlineTimezone: text(),
    deadlineType: text({ enum: DEADLINE_TYPES }),
    casService: text({ enum: CAS_SERVICES }),
    decisionNotificationDate: text(),
    status: canonicalStatus(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("application_cycles_program_label_unique").on(
      t.programId,
      t.cycleLabel,
    ),
    index("application_cycles_deadline_date_idx").on(t.deadlineDate),
    index("application_cycles_entry_year_idx").on(t.entryYear),
  ],
);

export const requirements = sqliteTable(
  "requirements",
  {
    id: id(),
    cycleId: integer()
      .notNull()
      .references(() => applicationCycles.id, { onDelete: "restrict" }),
    category: text({ enum: REQUIREMENT_CATEGORIES }).notNull(),
    label: text().notNull(),
    valueText: text(),
    valueNumber: real(),
    valueBool: integer({ mode: "boolean" }),
    valueDate: text(),
    unit: text(),
    isRequired: integer({ mode: "boolean" }),
    sortOrder: integer().notNull().default(0),
    status: canonicalStatus(),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("requirements_cycle_category_idx").on(t.cycleId, t.category)],
);

export const prerequisiteCourses = sqliteTable("prerequisite_courses", {
  id: id(),
  cycleId: integer()
    .notNull()
    .references(() => applicationCycles.id, { onDelete: "restrict" }),
  subject: text().notNull(),
  minCredits: real(),
  labRequired: integer({ mode: "boolean" }),
  minGrade: text(),
  recencyYears: integer(),
  notes: text(),
  sortOrder: integer().notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tuitionEstimates = sqliteTable("tuition_estimates", {
  id: id(),
  programId: integer()
    .notNull()
    .references(() => programs.id, { onDelete: "restrict" }),
  cycleId: integer().references(() => applicationCycles.id, {
    onDelete: "restrict",
  }),
  residency: text({ enum: RESIDENCIES }).notNull(),
  amountCents: integer().notNull(),
  currency: text().notNull().default("USD"),
  covers: text({ enum: TUITION_COVERS }).notNull(),
  depositCents: integer(),
  feesNote: text(),
  asOfYear: integer().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
