# Phase 2 — Schema and Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the full Drizzle schema for perfusion-dash (14 tables across canonical/provenance/personal/audit concerns), generate and commit the `0000_init` migration, wire a PRAGMA-correct SQLite connection, mirror the schema in Zod, and prove every unique key, FK policy, CHECK constraint, and the soft-delete pattern with integration tests that run real migrations against a temp file. No UI, no domain layer, no import script — those are later phases.

**Architecture:** Drizzle ORM (`drizzle-orm` 0.45.2) targets SQLite via `better-sqlite3` (13.0.3). Schema is authored as camelCase TypeScript, mapped to the spec's snake_case column names automatically via Drizzle's `casing: "snake_case"` option (verified against the installed `drizzle-orm`/`drizzle-kit` type definitions — see "API notes" below), so no column is given an explicit string name. `drizzle-kit` (0.31.10) diffs the schema into committed SQL migrations under `drizzle/`. Zod schemas are generated from the Drizzle tables via `drizzle-zod` (0.8.3), one file per schema concern, mirroring `src/db/schema/`. Integration tests spin up a real temp-file SQLite database, run the real migration, and assert constraints — never `db.push()`.

**Tech Stack:** drizzle-orm, drizzle-kit, better-sqlite3, drizzle-zod, zod, server-only, tsx (for running `scripts/*.ts` outside Next.js). All already installed in `package.json` as of this plan (see Task 1).

**Spec:** `docs/data-model.md` (schema, §3–§7) and `docs/plan.md` (§4 Phase 2 scope, §3 folder structure). Both travel with this plan; executors should read `docs/data-model.md` §3 in full before Task 2.

## Global Constraints

- npm is the package manager (`CLAUDE.md`).
- `drizzle/` migrations are committed; `data/` (the actual `.db`/WAL files) stays gitignored. Never `db.push()` — every schema change is a versioned migration (`CLAUDE.md`, `docs/plan.md` §6).
- Integration tests run real migrations against a temp SQLite file (`docs/plan.md` §6).
- ~~`src/db/**` imports `server-only`~~ **Superseded by Task 4 ruling (see ledger):** `server-only` throws unconditionally when loaded outside Next's bundler (no `react-server` export condition), which breaks `drizzle-kit generate`, `tsx scripts/*.ts`, and Vitest — none of those load through Next's module graph. None of `src/db/schema/**`, `src/db/migrate.ts`, or `src/db/client.ts` import it. The client-component guard from `docs/plan.md` §2 is deferred to Phase 3+'s domain layer (`src/domain/**`), the actual boundary application code crosses to reach the database.
- `PRAGMA foreign_keys = ON` per connection — SQLite defaults this OFF, which would silently void every FK constraint (`docs/data-model.md` §7).
- `PRAGMA journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL` (`docs/data-model.md` §7).
- Calendar dates (deadlines) are `TEXT` `YYYY-MM-DD`, never epoch timestamps. Audit instants are `INTEGER` epoch ms. Money is integer cents. Booleans are `INTEGER 0/1` via Drizzle's `{ mode: 'boolean' }` (`docs/data-model.md` §7, `CLAUDE.md`).
- Canonical data is soft-deleted via `status='archived'`, never hard-deleted (`CLAUDE.md`, `docs/data-model.md` §5).
- FK policy: `RESTRICT` on canonical parents, `CASCADE` on personal children (`docs/data-model.md` §5).
- Zod validates all external input (`CLAUDE.md`) — Phase 2 lays the typed foundation; business-rule refinements (e.g. "known state requires a citation") are Phase 6's import validator, not this phase.
- `users` carries exactly one row, seeded by the initial migration itself, not by application code (`docs/data-model.md` §3).

## API notes (verified against installed packages, not memory)

These are the exact, version-checked APIs this plan relies on — checked in `node_modules` because "this is NOT the Next.js you know" applies equally to a freshly-installed Drizzle major version:

- `sqliteTable(name, columns, (t) => [...])` — the extra-config callback returns an **array** of `unique()`, `index()`, `check()`, not an object (drizzle-orm 0.45 API).
- `integer()` / `text()` etc. take no name argument when used as an object-literal value; the column name is derived from the object key and transformed by `casing`.
- `integer({ mode: 'timestamp_ms' })` maps a JS `Date` to epoch-ms `INTEGER`. `.$defaultFn(() => new Date())` sets an insert-time default; `.$onUpdate(() => new Date())` refreshes on update.
- `integer({ mode: 'boolean' })` maps `boolean` to `INTEGER 0/1`.
- `text({ enum: [...] as const })` gives a TS literal union but **does not** emit a SQL `CHECK` — enum enforcement is TS/Zod-level only unless a `check()` is added explicitly.
- `check(name, sql\`...\`)` from `drizzle-orm/sqlite-core` is how real `CHECK` constraints are added — used only where `docs/data-model.md` explicitly calls for one (the two `claims` checks plus the `subject_table` allow-list mitigation it names).
- `.references(() => otherTable.col, { onDelete: 'restrict' | 'cascade' | 'set null' | 'no action' })`.
- `drizzle.config.ts` (drizzle-kit 0.31): `defineConfig({ dialect: "sqlite", schema, out, casing: "snake_case", dbCredentials: { url } })`. A `url` of `file:./data/app.db` is accepted as-is — drizzle-kit strips the `file:` prefix internally for the better-sqlite3 driver.
- `drizzle-kit generate --name=<slug>` names the migration file `NNNN_<slug>.sql` instead of a random adjective-noun pair.
- `migrate(db, { migrationsFolder })` from `drizzle-orm/better-sqlite3/migrator` is synchronous and runs real SQL files — this is what both `scripts/migrate.ts` and the integration test harness call.
- `createInsertSchema` / `createSelectSchema` are imported directly from `drizzle-zod` (no factory needed) and infer enums straight from `text({ enum })` columns.

## Known spec ambiguity — flagged, not silently resolved

`docs/data-model.md` §3's preamble says "Canonical tables carry `status` and `archived_at`," but the explicit per-table column lists for `prerequisite_courses` and `tuition_estimates` omit both. This plan follows the **explicit per-table lists** (the more specific, more recently-authored text) — so `prerequisite_courses` and `tuition_estimates` get `created_at`/`updated_at` only, no `status`/`archived_at`. If that's wrong, it's a two-column addition plus a follow-up migration; flagging it here so it's a deliberate choice, not a miss. Also: `users.name` is seeded with the placeholder `'Owner'` in the migration (Task 4) rather than a real name, to avoid committing personal data to a migration file that lives in Git history forever — trivially changed with an `UPDATE` if you want your name there instead.

---

### Task 1: Dependencies, drizzle-kit config, npm scripts

**Files:**
- Modify: `package.json` (dependencies, devDependencies, scripts)
- Create: `drizzle.config.ts`

**Interfaces:**
- Produces: `drizzle.config.ts` used by every `npm run db:generate` in later tasks. `package.json` scripts `db:generate` and `db:migrate` used by Tasks 4 and 5.

- [ ] **Step 1: Install runtime and dev dependencies**

```bash
npm install drizzle-orm better-sqlite3 zod drizzle-zod server-only
npm install -D drizzle-kit @types/better-sqlite3 tsx
```

Expected versions (already resolved as of this plan): `drizzle-orm@0.45.2`, `better-sqlite3@13.0.3`, `zod@4.4.3`, `drizzle-zod@0.8.3`, `server-only@0.0.1`, `drizzle-kit@0.31.10`, `tsx@4.23.12`.

Note: `npm audit` will report moderate advisories in `esbuild`/`@esbuild-kit/*`, pulled in transitively by `drizzle-kit`'s TS-config loader. These affect esbuild's *dev-server* CORS behavior; `drizzle-kit` never runs that dev server in our usage (only `generate`/`migrate` commands, which are one-shot CLI invocations). Do not run `npm audit fix --force` — it downgrades `drizzle-kit` to 0.18.1, a breaking change, to fix a non-exploitable transitive advisory.

- [ ] **Step 2: Write `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/app.db",
  },
});
```

- [ ] **Step 3: Add `db:generate` and `db:migrate` scripts to `package.json`**

In the `"scripts"` block, add (alongside the existing `dev`/`build`/... entries):

```json
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
```

- [ ] **Step 4: Confirm the project still type-checks with no schema yet**

Run: `npm run typecheck`
Expected: PASS (no schema files exist yet, so this only proves the new deps didn't break the existing Phase 1 build).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts
git commit -m "Phase 2: add Drizzle/SQLite dependencies and drizzle-kit config"
```

---

### Task 2: Canonical schema (`src/db/schema/_helpers.ts`, `src/db/schema/canonical.ts`)

**Files:**
- Create: `src/db/schema/_helpers.ts`
- Create: `src/db/schema/canonical.ts`

**Interfaces:**
- Consumes: nothing (first schema file).
- Produces: `id()`, `createdAt()`, `updatedAt()`, `archivedAt()`, `canonicalStatus()` column-builder factories from `_helpers.ts`, reused by every later schema file. Tables `users`, `schools`, `programs`, `applicationCycles`, `requirements`, `prerequisiteCourses`, `tuitionEstimates` and enum-value arrays `CREDENTIALS`, `MODALITIES`, `DEADLINE_TYPES`, `CAS_SERVICES`, `REQUIREMENT_CATEGORIES`, `RESIDENCIES`, `TUITION_COVERS`, all exported from `canonical.ts` — consumed by `personal.ts` (Task 3), `provenance.ts`'s CHECK constraints conceptually reference these table names (Task 3), and every fixture/test in Tasks 7–11.

- [ ] **Step 1: Write `src/db/schema/_helpers.ts`**

```ts
import { integer, text } from "drizzle-orm/sqlite-core";

export const id = () => integer().primaryKey({ autoIncrement: true });

export const createdAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const updatedAt = () =>
  integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());

export const archivedAt = () => integer({ mode: "timestamp_ms" });

export const CANONICAL_STATUSES = [
  "draft",
  "needs_review",
  "verified",
  "stale",
  "archived",
] as const;

export const canonicalStatus = () =>
  text({ enum: CANONICAL_STATUSES }).notNull().default("draft");
```

- [ ] **Step 2: Write `src/db/schema/canonical.ts`**

```ts
import { index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { archivedAt, canonicalStatus, createdAt, id, updatedAt } from "./_helpers";

export const users = sqliteTable("users", {
  id: id(),
  name: text().notNull(),
  createdAt: createdAt(),
});

export const CREDENTIALS = ["MS", "MPS", "MHS", "BS", "Certificate", "Other"] as const;
export const MODALITIES = ["in_person", "hybrid", "online"] as const;
export const DEADLINE_TYPES = ["rolling", "firm", "priority", "unknown"] as const;
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
export const RESIDENCIES = ["in_state", "out_of_state", "international", "flat"] as const;
export const TUITION_COVERS = ["total_program", "per_year", "per_credit"] as const;

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
    unique("application_cycles_program_label_unique").on(t.programId, t.cycleLabel),
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
  cycleId: integer().references(() => applicationCycles.id, { onDelete: "restrict" }),
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
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/_helpers.ts src/db/schema/canonical.ts
git commit -m "Phase 2: add canonical schema (schools, programs, cycles, requirements)"
```

---

### Task 3: Provenance, personal, and audit schema + barrel export

**Files:**
- Create: `src/db/schema/provenance.ts`
- Create: `src/db/schema/personal.ts`
- Create: `src/db/schema/audit.ts`
- Create: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `id`, `createdAt`, `updatedAt` from `./_helpers` (Task 2); `applicationCycles`, `programs`, `requirements`, `users` from `./canonical` (Task 2).
- Produces: `sources`, `claims`, `SUBJECT_TABLES` from `provenance.ts`; `savedPrograms`, `personalChecklists`, `checklistItems` from `personal.ts`; `importBatches`, `importConflicts`, `changeLog` from `audit.ts`. All re-exported from `index.ts`, which is what `drizzle.config.ts` (Task 1) points at and what every later import (`client.ts`, Zod schemas, tests) uses as `import * as schema from "@/db/schema"`.

- [ ] **Step 1: Write `src/db/schema/provenance.ts`**

```ts
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "./_helpers";

export const SOURCE_TYPES = [
  "program_site",
  "accreditor",
  "cas",
  "pdf",
  "email",
  "phone",
  "other",
] as const;
export const CLAIM_STATES = ["known", "unknown", "not_published", "not_applicable"] as const;
export const VERIFICATION_STATES = [
  "draft",
  "needs_review",
  "verified",
  "stale",
  "archived",
] as const;
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const SUBJECT_TABLES = [
  "schools",
  "programs",
  "application_cycles",
  "requirements",
  "prerequisite_courses",
  "tuition_estimates",
] as const;

export const sources = sqliteTable(
  "sources",
  {
    id: id(),
    url: text().notNull(),
    canonicalUrl: text(),
    title: text(),
    publisher: text(),
    sourceType: text({ enum: SOURCE_TYPES }).notNull(),
    fetchedAt: integer({ mode: "timestamp_ms" }),
    contentHash: text(),
    snapshotPath: text(),
    notes: text(),
    createdAt: createdAt(),
  },
  (t) => [unique("sources_url_unique").on(t.url)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: id(),
    subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
    subjectId: integer().notNull(),
    fieldKey: text().notNull(),
    state: text({ enum: CLAIM_STATES }).notNull(),
    sourceId: integer().references(() => sources.id, { onDelete: "restrict" }),
    quote: text(),
    note: text(),
    checkedAt: integer({ mode: "timestamp_ms" }),
    verification: text({ enum: VERIFICATION_STATES }).notNull().default("draft"),
    locked: integer({ mode: "boolean" }).notNull().default(false),
    confidence: text({ enum: CONFIDENCE_LEVELS }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("claims_subject_field_unique").on(t.subjectTable, t.subjectId, t.fieldKey),
    index("claims_verification_idx").on(t.verification),
    index("claims_checked_at_idx").on(t.checkedAt),
    index("claims_subject_idx").on(t.subjectTable, t.subjectId),
    check(
      "claims_known_requires_source",
      sql`(${t.state} != 'known') OR (${t.sourceId} IS NOT NULL)`,
    ),
    check(
      "claims_verified_requires_checked_at",
      sql`(${t.verification} = 'draft') OR (${t.checkedAt} IS NOT NULL)`,
    ),
    check(
      "claims_subject_table_known",
      sql`${t.subjectTable} IN ('schools','programs','application_cycles','requirements','prerequisite_courses','tuition_estimates')`,
    ),
  ],
);
```

- [ ] **Step 2: Write `src/db/schema/personal.ts`**

```ts
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "./_helpers";
import { applicationCycles, programs, requirements, users } from "./canonical";

export const PRIORITIES = ["reach", "target", "likely", "dropped"] as const;
export const CHECKLIST_ITEM_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "done",
  "skipped",
] as const;

export const savedPrograms = sqliteTable(
  "saved_programs",
  {
    id: id(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: integer()
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    addedAt: integer({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    priority: text({ enum: PRIORITIES }),
    personalNote: text(),
  },
  (t) => [unique("saved_programs_user_program_unique").on(t.userId, t.programId)],
);

export const personalChecklists = sqliteTable("personal_checklists", {
  id: id(),
  userId: integer()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  savedProgramId: integer()
    .notNull()
    .references(() => savedPrograms.id, { onDelete: "cascade" }),
  cycleId: integer().references(() => applicationCycles.id, { onDelete: "restrict" }),
  title: text().notNull(),
  createdAt: integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: id(),
    checklistId: integer()
      .notNull()
      .references(() => personalChecklists.id, { onDelete: "cascade" }),
    title: text().notNull(),
    detail: text(),
    category: text(),
    dueAt: integer({ mode: "timestamp_ms" }),
    status: text({ enum: CHECKLIST_ITEM_STATUSES }).notNull().default("todo"),
    completedAt: integer({ mode: "timestamp_ms" }),
    linkUrl: text(),
    derivedFromRequirementId: integer().references(() => requirements.id, {
      onDelete: "set null",
    }),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("checklist_items_status_due_idx").on(t.status, t.dueAt)],
);
```

- [ ] **Step 3: Write `src/db/schema/audit.ts`**

```ts
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { id } from "./_helpers";
import { SUBJECT_TABLES } from "./provenance";

export const IMPORT_MODES = ["dry_run", "apply"] as const;
export const IMPORT_BATCH_STATUSES = ["running", "succeeded", "failed", "rolled_back"] as const;
export const CONFLICT_RESOLUTIONS = ["accepted", "rejected", "pending"] as const;
export const CHANGE_LOG_ACTIONS = ["create", "update", "delete", "archive", "verify"] as const;

export const importBatches = sqliteTable("import_batches", {
  id: id(),
  startedAt: integer({ mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  finishedAt: integer({ mode: "timestamp_ms" }),
  mode: text({ enum: IMPORT_MODES }).notNull(),
  sourceLabel: text().notNull(),
  fileHash: text(),
  actor: text(),
  summaryJson: text({ mode: "json" }),
  status: text({ enum: IMPORT_BATCH_STATUSES }).notNull().default("running"),
});

export const importConflicts = sqliteTable("import_conflicts", {
  id: id(),
  batchId: integer()
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
  subjectId: integer().notNull(),
  fieldKey: text().notNull(),
  currentJson: text({ mode: "json" }),
  proposedJson: text({ mode: "json" }),
  reason: text(),
  resolvedAt: integer({ mode: "timestamp_ms" }),
  resolution: text({ enum: CONFLICT_RESOLUTIONS }).notNull().default("pending"),
});

export const changeLog = sqliteTable(
  "change_log",
  {
    id: id(),
    at: integer({ mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    actor: text(),
    action: text({ enum: CHANGE_LOG_ACTIONS }).notNull(),
    subjectTable: text({ enum: SUBJECT_TABLES }).notNull(),
    subjectId: integer().notNull(),
    fieldKey: text(),
    beforeJson: text({ mode: "json" }),
    afterJson: text({ mode: "json" }),
    batchId: integer().references(() => importBatches.id),
    note: text(),
  },
  (t) => [
    index("change_log_subject_idx").on(t.subjectTable, t.subjectId),
    index("change_log_at_idx").on(t.at),
  ],
);
```

- [ ] **Step 4: Write `src/db/schema/index.ts`**

```ts

export * from "./canonical";
export * from "./provenance";
export * from "./personal";
export * from "./audit";
```

- [ ] **Step 5: Type-check**

Run: `npm run typecheck`
Expected: PASS. If it fails on a circular-import error between `canonical.ts`/`personal.ts`/`provenance.ts`/`audit.ts`, check that `personal.ts` imports only from `./canonical`, `audit.ts` imports only from `./provenance` — the dependency graph is a DAG (`canonical` → `provenance` → `audit`, `canonical` → `personal`), so no file should import from `./index`.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/provenance.ts src/db/schema/personal.ts src/db/schema/audit.ts src/db/schema/index.ts
git commit -m "Phase 2: add provenance, personal, and audit schema"
```

---

### Task 4: Generate and commit the `0000_init` migration, seed the one `users` row

**Files:**
- Create: `drizzle/0000_init.sql` (generated, then hand-edited)
- Create: `drizzle/meta/_journal.json`, `drizzle/meta/0000_snapshot.json` (generated, untouched)

**Interfaces:**
- Consumes: `src/db/schema/index.ts` (Task 3) via `drizzle.config.ts` (Task 1).
- Produces: the migration file every later task's `migrate()` call (client.ts in Task 5, test harness in Task 7) applies.

- [ ] **Step 1: Generate the migration**

```bash
npm run db:generate -- --name=init
```

Expected: `drizzle/0000_init.sql` plus `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json` are created. No prompts should appear — if drizzle-kit interactively asks about a rename vs. create for any column (it does this by comparing against an empty prior snapshot, so it shouldn't here), choose "create" for every table since this is the first migration.

- [ ] **Step 2: Read the generated SQL and verify the two things that don't show up in TypeScript**

Run: `cat drizzle/0000_init.sql`

Confirm, by eye:
1. Every `CREATE TABLE` for a table with a `.references()` column has the matching `ON DELETE RESTRICT` / `ON DELETE CASCADE` / `ON DELETE SET NULL` clause — Drizzle emits these as part of the column definition or a trailing `FOREIGN KEY` clause depending on table complexity; either form is correct as long as the action matches what Task 2/3 declared.
2. The three `claims` `CHECK` constraints and are present verbatim (search for `claims_known_requires_source`, `claims_verified_requires_checked_at`, `claims_subject_table_known`).

If either is missing, stop — it means the `check()`/`.references()` calls in Task 2/3 didn't reach the generator, which is a schema-file bug, not a migration bug. Do not hand-patch the SQL to compensate; fix the schema and regenerate.

- [ ] **Step 3: Append the one-time `users` seed row to the end of `drizzle/0000_init.sql`**

`docs/data-model.md` §3 requires the single `users` row to be "seeded by the initial migration," not by application code. Open `drizzle/0000_init.sql` and append this as the final statement (after the last generated `CREATE TABLE`/`CREATE INDEX` statement, respecting whatever `--> statement-breakpoint` convention the rest of the file uses):

```sql
INSERT INTO `users` (`name`, `created_at`) VALUES ('Owner', unixepoch() * 1000);
```

This is safe to hand-edit: the migration has not been applied to any database yet (Task 4 is the first task that generates it), so there is no drift between a recorded hash and the file contents to worry about.

- [ ] **Step 4: Sanity-check the seed statement runs standalone**

```bash
mkdir -p /tmp/perfusion-migration-check
sqlite3 /tmp/perfusion-migration-check/check.db < drizzle/0000_init.sql
sqlite3 /tmp/perfusion-migration-check/check.db "SELECT id, name FROM users;"
rm -rf /tmp/perfusion-migration-check
```

Expected: the `SELECT` prints exactly one row, `1|Owner`. (If the `sqlite3` CLI isn't installed on this machine — `docs/plan.md` notes it wasn't as of Phase 0 — skip this step; Task 7's integration test harness will exercise the same file through `better-sqlite3` and catch any syntax error just as reliably.)

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "Phase 2: generate 0000_init migration, seed the single users row"
```

---

### Task 5: `src/db/client.ts` connection + `src/db/migrate.ts` + `scripts/migrate.ts`

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/migrate.ts`
- Create: `scripts/migrate.ts`

**Interfaces:**
- Consumes: `schema` from `src/db/schema/index.ts` (Task 3); the committed `drizzle/` folder (Task 4).
- Produces: `db` (a `BetterSQLite3Database<typeof schema>`) exported from `src/db/client.ts` — this is what every later domain/query module (Phase 3+) and the integration test harness (Task 7) import. `runMigrations(db)` from `src/db/migrate.ts`, shared by `scripts/migrate.ts` and the test harness so the migration-running logic exists in exactly one place.

- [ ] **Step 1: Write `src/db/migrate.ts`**

```ts
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

export function runMigrations<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema>,
): void {
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
```

- [ ] **Step 2: Write `src/db/client.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

function resolveDatabasePath(databaseUrl: string): string {
  return databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
}

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const databasePath = resolveDatabasePath(databaseUrl);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("synchronous = NORMAL");

export const db = drizzle(sqlite, { schema, casing: "snake_case" });
```

- [ ] **Step 3: Write `scripts/migrate.ts`**

```ts
import { db } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

runMigrations(db);
console.log("Migrations applied.");
```

- [ ] **Step 4: Run the migration against the real dev database**

```bash
npm run db:migrate
```

Expected: prints `Migrations applied.`, creates `data/app.db` (gitignored — confirm with `git status` that it does not appear as untracked).

- [ ] **Step 5: Verify PRAGMAs actually took effect**

```bash
sqlite3 data/app.db "PRAGMA foreign_keys; PRAGMA journal_mode;"
```

Expected: `foreign_keys` prints `0` — this is expected and NOT a bug: `PRAGMA foreign_keys` is a per-connection setting the `sqlite3` CLI's own fresh connection doesn't inherit, it doesn't reflect anything persisted in the file. `journal_mode` should print `wal`, since WAL mode *is* persisted in the database file header. Task 9's integration test asserts `foreign_keys` is ON from *inside* a `better-sqlite3` connection, which is the setting that actually matters. If `sqlite3` isn't installed, skip this step.

- [ ] **Step 6: Re-run `npm run db:migrate` to confirm idempotency**

```bash
npm run db:migrate
```

Expected: prints `Migrations applied.` again with no error and no duplicate `users` row (`drizzle-orm`'s migrator tracks applied migrations in its own `__drizzle_migrations` table and no-ops on a second run).

- [ ] **Step 7: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/client.ts src/db/migrate.ts scripts/migrate.ts
git commit -m "Phase 2: add SQLite client with PRAGMAs and a migration runner"
```

---

### Task 6: Zod schemas mirroring the Drizzle schema

**Files:**
- Create: `src/lib/zod/canonical.ts`
- Create: `src/lib/zod/provenance.ts`
- Create: `src/lib/zod/personal.ts`
- Create: `src/lib/zod/audit.ts`
- Create: `src/lib/zod/index.ts`

**Interfaces:**
- Consumes: every table from `src/db/schema/*` (Tasks 2–3).
- Produces: `<table>InsertSchema` / `<table>SelectSchema` pairs for all 14 tables, re-exported from `src/lib/zod/index.ts`. Phase 6's import validator will refine these further (e.g. requiring a citation when `state === 'known'`); this phase only needs the structural mirror.

- [ ] **Step 1: Write `src/lib/zod/canonical.ts`**

```ts
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

export const applicationCycleInsertSchema = createInsertSchema(applicationCycles);
export const applicationCycleSelectSchema = createSelectSchema(applicationCycles);

export const requirementInsertSchema = createInsertSchema(requirements);
export const requirementSelectSchema = createSelectSchema(requirements);

export const prerequisiteCourseInsertSchema = createInsertSchema(prerequisiteCourses);
export const prerequisiteCourseSelectSchema = createSelectSchema(prerequisiteCourses);

export const tuitionEstimateInsertSchema = createInsertSchema(tuitionEstimates);
export const tuitionEstimateSelectSchema = createSelectSchema(tuitionEstimates);
```

- [ ] **Step 2: Write `src/lib/zod/provenance.ts`**

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { claims, sources } from "@/db/schema/provenance";

export const sourceInsertSchema = createInsertSchema(sources);
export const sourceSelectSchema = createSelectSchema(sources);

export const claimInsertSchema = createInsertSchema(claims);
export const claimSelectSchema = createSelectSchema(claims);
```

- [ ] **Step 3: Write `src/lib/zod/personal.ts`**

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { checklistItems, personalChecklists, savedPrograms } from "@/db/schema/personal";

export const savedProgramInsertSchema = createInsertSchema(savedPrograms);
export const savedProgramSelectSchema = createSelectSchema(savedPrograms);

export const personalChecklistInsertSchema = createInsertSchema(personalChecklists);
export const personalChecklistSelectSchema = createSelectSchema(personalChecklists);

export const checklistItemInsertSchema = createInsertSchema(checklistItems);
export const checklistItemSelectSchema = createSelectSchema(checklistItems);
```

- [ ] **Step 4: Write `src/lib/zod/audit.ts`**

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { changeLog, importBatches, importConflicts } from "@/db/schema/audit";

export const importBatchInsertSchema = createInsertSchema(importBatches);
export const importBatchSelectSchema = createSelectSchema(importBatches);

export const importConflictInsertSchema = createInsertSchema(importConflicts);
export const importConflictSelectSchema = createSelectSchema(importConflicts);

export const changeLogInsertSchema = createInsertSchema(changeLog);
export const changeLogSelectSchema = createSelectSchema(changeLog);
```

- [ ] **Step 5: Write `src/lib/zod/index.ts`**

```ts
export * from "./canonical";
export * from "./provenance";
export * from "./personal";
export * from "./audit";
```

- [ ] **Step 6: Prove the schemas actually validate, not just type-check**

Create `tests/unit/zod-schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { schoolInsertSchema, claimInsertSchema } from "@/lib/zod";

describe("zod schemas mirror the Drizzle schema", () => {
  it("accepts a valid school insert", () => {
    const result = schoolInsertSchema.safeParse({
      slug: "duke-university",
      name: "Duke University",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a school insert missing the required name", () => {
    const result = schoolInsertSchema.safeParse({ slug: "duke-university" });
    expect(result.success).toBe(false);
  });

  it("rejects a claim with a state outside the enum", () => {
    const result = claimInsertSchema.safeParse({
      subjectTable: "schools",
      subjectId: 1,
      fieldKey: "name",
      state: "definitely_not_a_real_state",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 7: Run the new unit test**

Run: `npm run test -- tests/unit/zod-schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Type-check**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/zod tests/unit/zod-schemas.test.ts
git commit -m "Phase 2: add Zod schemas mirroring the Drizzle schema"
```

---

### Task 7: Integration test harness + hand-written fixture school

**Files:**
- Create: `tests/integration/helpers/db.ts`
- Create: `tests/fixtures/school.ts`
- Create: `tests/integration/fixture.test.ts`
- Modify: `vitest.config.ts` (broaden `include` to pick up `tests/integration`)

**Interfaces:**
- Consumes: `schema` from `src/db/schema` (Task 3), the committed `drizzle/` migration (Task 4), `runMigrations` from `src/db/migrate.ts` (Task 5).
- Produces: `createTestDb()` from `tests/integration/helpers/db.ts` — returns `{ db, close }`, used by every test in Tasks 8–11. `seedFixtureSchool(db)` from `tests/fixtures/school.ts` — inserts one fully-worked school→program→cycle→requirement/prerequisite/tuition→source→claim chain and returns every inserted row, used by Tasks 8–11 wherever a realistic row is needed instead of a bare insert.

- [ ] **Step 1: Broaden `vitest.config.ts` to include integration tests**

Read the current file first, then update the `include` array:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write `tests/integration/helpers/db.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { runMigrations } from "@/db/migrate";

export function createTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "perfusion-test-"));
  const file = path.join(dir, "test.db");

  const sqlite = new Database(file);
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema, casing: "snake_case" });
  runMigrations(db);

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export type TestDb = ReturnType<typeof createTestDb>["db"];
```

- [ ] **Step 3: Write `tests/fixtures/school.ts`**

```ts
import * as schema from "@/db/schema";
import type { TestDb } from "../integration/helpers/db";

export async function seedFixtureSchool(db: TestDb) {
  const [school] = await db
    .insert(schema.schools)
    .values({
      slug: "duke-university",
      name: "Duke University",
      city: "Durham",
      state: "NC",
      websiteUrl: "https://example.edu/duke-perfusion",
    })
    .returning();

  const [program] = await db
    .insert(schema.programs)
    .values({
      schoolId: school!.id,
      slug: "perfusion-ms",
      name: "MS in Cardiovascular Perfusion",
      credential: "MS",
      modality: "in_person",
    })
    .returning();

  const [cycle] = await db
    .insert(schema.applicationCycles)
    .values({
      programId: program!.id,
      cycleLabel: "2026-27",
      entryYear: 2027,
      deadlineDate: "2026-11-01",
      deadlineType: "firm",
    })
    .returning();

  const [requirement] = await db
    .insert(schema.requirements)
    .values({
      cycleId: cycle!.id,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
      unit: "gpa",
      isRequired: true,
    })
    .returning();

  const [prerequisite] = await db
    .insert(schema.prerequisiteCourses)
    .values({
      cycleId: cycle!.id,
      subject: "Anatomy & Physiology",
      minCredits: 4,
      labRequired: true,
    })
    .returning();

  const [tuition] = await db
    .insert(schema.tuitionEstimates)
    .values({
      programId: program!.id,
      cycleId: cycle!.id,
      residency: "in_state",
      amountCents: 4_600_000,
      covers: "per_year",
      asOfYear: 2026,
    })
    .returning();

  const [source] = await db
    .insert(schema.sources)
    .values({
      url: "https://example.edu/duke-perfusion/admissions",
      sourceType: "program_site",
    })
    .returning();

  const [claim] = await db
    .insert(schema.claims)
    .values({
      subjectTable: "requirements",
      subjectId: requirement!.id,
      fieldKey: "value_number",
      state: "known",
      sourceId: source!.id,
      quote: "Minimum cumulative GPA of 3.0 is required.",
      checkedAt: new Date(),
      verification: "verified",
    })
    .returning();

  return {
    school: school!,
    program: program!,
    cycle: cycle!,
    requirement: requirement!,
    prerequisite: prerequisite!,
    tuition: tuition!,
    source: source!,
    claim: claim!,
  };
}
```

`tests/` sits outside `src/`, so it isn't reachable through the `@/*` → `./src/*` alias — that's why `TestDb` is imported with a relative path (`../integration/helpers/db`, resolving from `tests/fixtures/school.ts` to `tests/integration/helpers/db.ts`) while everything else in this file uses the `@/*` alias.

- [ ] **Step 4: Write `tests/integration/fixture.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("fixture school", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("inserts a full school -> program -> cycle -> requirement/prerequisite/tuition -> source -> claim chain", async () => {
    const fixture = await seedFixtureSchool(db);

    expect(fixture.program.schoolId).toBe(fixture.school.id);
    expect(fixture.cycle.programId).toBe(fixture.program.id);
    expect(fixture.requirement.cycleId).toBe(fixture.cycle.id);
    expect(fixture.prerequisite.cycleId).toBe(fixture.cycle.id);
    expect(fixture.tuition.programId).toBe(fixture.program.id);
    expect(fixture.tuition.cycleId).toBe(fixture.cycle.id);
    expect(fixture.claim.subjectTable).toBe("requirements");
    expect(fixture.claim.subjectId).toBe(fixture.requirement.id);
    expect(fixture.claim.sourceId).toBe(fixture.source.id);
  });

  it("seeded exactly one users row from the initial migration", async () => {
    const rows = await db.select().from(schema.users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Owner");
  });
});
```

- [ ] **Step 5: Run the new test**

Run: `npm run test -- tests/integration/fixture.test.ts`
Expected: PASS (2 tests). If it fails with a `SqliteError: no such table`, the migration didn't run — check that `src/db/migrate.ts`'s `migrationsFolder` (Task 5) resolves to the repo-root `drizzle/` folder via `process.cwd()`, so this test must be run via `npm run test`/`vitest` from the repo root, not from inside `tests/`.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/integration/helpers/db.ts tests/fixtures/school.ts tests/integration/fixture.test.ts
git commit -m "Phase 2: add integration test harness and fixture school"
```

---

### Task 8: Unique constraint tests

**Files:**
- Create: `tests/integration/unique-constraints.test.ts`

**Interfaces:**
- Consumes: `createTestDb` (Task 7), `seedFixtureSchool` (Task 7), `schema` from `src/db/schema`.

- [ ] **Step 1: Write `tests/integration/unique-constraints.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("unique constraints", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("rejects a duplicate school slug", async () => {
    await db.insert(schema.schools).values({ slug: "duke-university", name: "Duke" });

    await expect(
      db.insert(schema.schools).values({ slug: "duke-university", name: "Duke Again" }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a duplicate (school_id, slug) program but allows the same slug under a different school", async () => {
    const [schoolA] = await db
      .insert(schema.schools)
      .values({ slug: "school-a", name: "School A" })
      .returning();
    const [schoolB] = await db
      .insert(schema.schools)
      .values({ slug: "school-b", name: "School B" })
      .returning();

    await db.insert(schema.programs).values({
      schoolId: schoolA!.id,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    });

    await expect(
      db.insert(schema.programs).values({
        schoolId: schoolA!.id,
        slug: "perfusion-ms",
        name: "Duplicate slug, same school",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    await expect(
      db.insert(schema.programs).values({
        schoolId: schoolB!.id,
        slug: "perfusion-ms",
        name: "Same slug, different school",
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a duplicate (program_id, cycle_label) application cycle", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.applicationCycles).values({
        programId: fixture.program.id,
        cycleLabel: "2026-27",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a duplicate (subject_table, subject_id, field_key) claim", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "requirements",
        subjectId: fixture.requirement.id,
        fieldKey: "value_number",
        state: "unknown",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a duplicate source url", async () => {
    await db.insert(schema.sources).values({
      url: "https://example.edu/duplicate",
      sourceType: "program_site",
    });

    await expect(
      db.insert(schema.sources).values({
        url: "https://example.edu/duplicate",
        sourceType: "accreditor",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a duplicate (user_id, program_id) saved program", async () => {
    const fixture = await seedFixtureSchool(db);
    const [user] = await db.select().from(schema.users);

    await db.insert(schema.savedPrograms).values({
      userId: user!.id,
      programId: fixture.program.id,
    });

    await expect(
      db.insert(schema.savedPrograms).values({
        userId: user!.id,
        programId: fixture.program.id,
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test -- tests/integration/unique-constraints.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/unique-constraints.test.ts
git commit -m "Phase 2: add unique constraint integration tests"
```

---

### Task 9: Foreign key RESTRICT / CASCADE / SET NULL tests

**Files:**
- Create: `tests/integration/foreign-keys.test.ts`

**Interfaces:**
- Consumes: `createTestDb`, `seedFixtureSchool` (Task 7), `schema`.

- [ ] **Step 1: Write `tests/integration/foreign-keys.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("foreign key policy", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("RESTRICTs deleting a school that still has a program", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.delete(schema.schools).where(eq(schema.schools.id, fixture.school.id)),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("RESTRICTs deleting a program that still has a cycle", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.delete(schema.programs).where(eq(schema.programs.id, fixture.program.id)),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("RESTRICTs deleting a cycle that still has a requirement, prerequisite, or tuition estimate", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db
        .delete(schema.applicationCycles)
        .where(eq(schema.applicationCycles.id, fixture.cycle.id)),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("CASCADEs deleting a user to saved_programs", async () => {
    const fixture = await seedFixtureSchool(db);
    const [user] = await db.select().from(schema.users);
    await db
      .insert(schema.savedPrograms)
      .values({ userId: user!.id, programId: fixture.program.id });

    await db.delete(schema.users).where(eq(schema.users.id, user!.id));

    const remaining = await db.select().from(schema.savedPrograms);
    expect(remaining).toHaveLength(0);
  });

  it("CASCADEs deleting a saved_program to personal_checklists, and a checklist to its items", async () => {
    const fixture = await seedFixtureSchool(db);
    const [user] = await db.select().from(schema.users);
    const [saved] = await db
      .insert(schema.savedPrograms)
      .values({ userId: user!.id, programId: fixture.program.id })
      .returning();
    const [checklist] = await db
      .insert(schema.personalChecklists)
      .values({ userId: user!.id, savedProgramId: saved!.id, title: "Application tasks" })
      .returning();
    await db.insert(schema.checklistItems).values({
      checklistId: checklist!.id,
      title: "Submit transcript",
    });

    await db.delete(schema.savedPrograms).where(eq(schema.savedPrograms.id, saved!.id));

    const remainingChecklists = await db.select().from(schema.personalChecklists);
    const remainingItems = await db.select().from(schema.checklistItems);
    expect(remainingChecklists).toHaveLength(0);
    expect(remainingItems).toHaveLength(0);
  });

  it("CASCADEs deleting an import_batch to its import_conflicts", async () => {
    const [batch] = await db
      .insert(schema.importBatches)
      .values({ mode: "dry_run", sourceLabel: "test-bundle" })
      .returning();
    await db.insert(schema.importConflicts).values({
      batchId: batch!.id,
      subjectTable: "schools",
      subjectId: 1,
      fieldKey: "name",
    });

    await db.delete(schema.importBatches).where(eq(schema.importBatches.id, batch!.id));

    const remaining = await db.select().from(schema.importConflicts);
    expect(remaining).toHaveLength(0);
  });

  it("SET NULLs checklist_items.derived_from_requirement_id when the requirement is deleted", async () => {
    const fixture = await seedFixtureSchool(db);
    const [user] = await db.select().from(schema.users);
    const [saved] = await db
      .insert(schema.savedPrograms)
      .values({ userId: user!.id, programId: fixture.program.id })
      .returning();
    const [checklist] = await db
      .insert(schema.personalChecklists)
      .values({ userId: user!.id, savedProgramId: saved!.id, title: "Application tasks" })
      .returning();
    const [item] = await db
      .insert(schema.checklistItems)
      .values({
        checklistId: checklist!.id,
        title: "Meet minimum GPA",
        derivedFromRequirementId: fixture.requirement.id,
      })
      .returning();

    // Requirements are RESTRICT-protected by application_cycles being their own
    // parent, not the other way around, so deleting the requirement directly is
    // legal here — nothing else references application_cycles through it.
    await db.delete(schema.requirements).where(eq(schema.requirements.id, fixture.requirement.id));

    const [reloaded] = await db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.id, item!.id));
    expect(reloaded?.derivedFromRequirementId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test -- tests/integration/foreign-keys.test.ts`
Expected: PASS (7 tests). If the RESTRICT tests fail by *succeeding* instead of throwing, `PRAGMA foreign_keys = ON` isn't actually active on the test connection — check `tests/integration/helpers/db.ts` sets it on `sqlite` before `drizzle()` wraps it (Task 7, Step 2).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/foreign-keys.test.ts
git commit -m "Phase 2: add foreign key RESTRICT/CASCADE/SET NULL integration tests"
```

---

### Task 10: Claims CHECK constraint tests

**Files:**
- Create: `tests/integration/claims-check-constraints.test.ts`

**Interfaces:**
- Consumes: `createTestDb`, `seedFixtureSchool` (Task 7), `schema`.

- [ ] **Step 1: Write `tests/integration/claims-check-constraints.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("claims CHECK constraints", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("rejects state='known' with no source_id", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "credential",
        state: "known",
        sourceId: null,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows state='unknown' with no source_id", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "credential",
        state: "unknown",
        sourceId: null,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects verification != 'draft' with no checked_at", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
        verification: "needs_review",
        checkedAt: null,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows verification='draft' with no checked_at", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
        verification: "draft",
        checkedAt: null,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a subject_table outside the known canonical table allow-list at the database level", async () => {
    const fixture = await seedFixtureSchool(db);

    // Bypass the Drizzle/TS enum (which would reject this at compile time) by
    // going through the raw driver, to prove the DB-level CHECK is real and
    // not just a TypeScript-level restriction.
    expect(() =>
      ctx.sqlite
        .prepare(
          `INSERT INTO claims (subject_table, subject_id, field_key, state, source_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run("not_a_real_table", fixture.program.id, "name", "known", fixture.source.id),
    ).toThrow(/CHECK constraint failed/);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test -- tests/integration/claims-check-constraints.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/claims-check-constraints.test.ts
git commit -m "Phase 2: add claims CHECK constraint integration tests"
```

---

### Task 11: PRAGMA assertion + soft-delete/archive lifecycle test

**Files:**
- Create: `tests/integration/pragmas-and-lifecycle.test.ts`

**Interfaces:**
- Consumes: `createTestDb`, `seedFixtureSchool` (Task 7), `schema`.

- [ ] **Step 1: Write `tests/integration/pragmas-and-lifecycle.test.ts`**

```ts
import { eq, ne } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("PRAGMAs and soft-delete lifecycle", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("has foreign_keys ON for this connection", () => {
    const result = ctx.sqlite.pragma("foreign_keys", { simple: true });
    expect(result).toBe(1);
  });

  it("archives a school in place instead of deleting it", async () => {
    const fixture = await seedFixtureSchool(db);
    const archivedAt = new Date();

    await db
      .update(schema.schools)
      .set({ status: "archived", archivedAt })
      .where(eq(schema.schools.id, fixture.school.id));

    const [row] = await db.select().from(schema.schools).where(eq(schema.schools.id, fixture.school.id));
    expect(row?.status).toBe("archived");
    expect(row?.archivedAt).toBeInstanceOf(Date);

    // The row still exists, and everything it owns is untouched (archiving
    // does not cascade to claims — docs/data-model.md §5).
    const claims = await db.select().from(schema.claims);
    expect(claims).toHaveLength(1);
  });

  it("a default query filtered on status != 'archived' excludes an archived school but keeps active ones", async () => {
    const fixture = await seedFixtureSchool(db);
    await db.insert(schema.schools).values({ slug: "active-school", name: "Active School" });

    await db
      .update(schema.schools)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.schools.id, fixture.school.id));

    const active = await db.select().from(schema.schools).where(ne(schema.schools.status, "archived"));

    expect(active.map((s) => s.slug)).toEqual(["active-school"]);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm run test -- tests/integration/pragmas-and-lifecycle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/integration/pragmas-and-lifecycle.test.ts
git commit -m "Phase 2: add PRAGMA and soft-delete lifecycle integration tests"
```

---

### Task 12: Full verify pass and cleanup

**Files:** none new — this task only runs checks and fixes whatever they surface.

**Interfaces:** none.

- [ ] **Step 1: Run the full verify pipeline**

```bash
npm run verify
```

This runs `format:check && typecheck && lint && test && test:e2e` in sequence. Expected: all green. `test` now includes every integration test from Tasks 7–11 in addition to the Phase 1 unit tests and the new `zod-schemas.test.ts` from Task 6.

- [ ] **Step 2: If `format:check` fails**

Run: `npm run format`
Then re-run `npm run format:check` to confirm, and re-run the rest of `npm run verify`.

- [ ] **Step 3: If `lint` fails on an unused import or `no-explicit-any`**

Fix the specific file — every file in this plan was written without deliberate `any` usage or unused imports, so a failure here means a step above was transcribed with a mistake. Re-read the relevant Task's code block, correct the drift, re-run `npm run lint`.

- [ ] **Step 4: Confirm `data/` never got committed**

```bash
git status
```

Expected: clean, or only showing files this plan intentionally created. `data/app.db*` must not appear (it's gitignored per Phase 1's `.gitignore` — this step is a final check, not a fix, since Task 1's `CLAUDE.md`-derived global constraints already forbid committing it).

- [ ] **Step 5: Final commit if Steps 2–3 changed anything**

```bash
git add -A
git commit -m "Phase 2: fix formatting/lint issues surfaced by npm run verify"
```

(Skip this step entirely if `npm run verify` was already green on the first run in Step 1 — don't create an empty commit.)

---

## Self-review

**Spec coverage** — every table in `docs/data-model.md` §3 has a task: `users`/`schools`/`programs`/`application_cycles`/`requirements`/`prerequisite_courses`/`tuition_estimates` (Task 2), `sources`/`claims` (Task 3), `saved_programs`/`personal_checklists`/`checklist_items` (Task 3), `import_batches`/`import_conflicts`/`change_log` (Task 3). The three `claims` CHECK constraints (Task 3, tested in Task 10). Unique keys (Task 2/3, tested in Task 8). FK RESTRICT/CASCADE/SET NULL policy (Task 2/3, tested in Task 9). `PRAGMA foreign_keys/journal_mode/busy_timeout/synchronous` (Task 5, tested in Task 11). Soft-delete via `status='archived'` (tested in Task 11). The single seeded `users` row (Task 4, tested in Task 7). Zod mirror (Task 6). Real migrations, never `db.push()` (Task 4, Task 7). `src/db/**` does NOT import `server-only` — see the Global Constraints note on the Task 4 ruling that superseded this. `docs/plan.md`'s Phase 2 gate — "constraint tests prove unique keys, FK restrict, and soft-delete work" — is Tasks 8, 9, and 11 respectively.

**Placeholder scan** — no `TBD`/"add error handling"/"similar to Task N" patterns; every step has literal code or a literal shell command.

**Type consistency** — `TestDb` type is defined once in `tests/integration/helpers/db.ts` (Task 7) and imported everywhere else that needs it (Tasks 8–11) rather than redefined. `seedFixtureSchool`'s return shape (`school`, `program`, `cycle`, `requirement`, `prerequisite`, `tuition`, `source`, `claim`) is used consistently by field name across Tasks 8–11 without renaming.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-26-phase-2-schema-and-migrations.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
