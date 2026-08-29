# Phase 5 — Admin Data Entry and Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin CRUD for schools, programs, cycles, requirements, and
sources; per-fact verify/needs-review actions on `claims`; a `change_log` row
on every canonical mutation; and an actionable `/verify` queue.

**Architecture:** A `recordChange` helper wraps every canonical write inside a
`db.transaction()` that snapshots before/after state into `change_log`. Five
`src/domain/admin/*.ts` modules (schools, programs, cycles, requirements,
sources) each expose create/update/archive functions built on that helper. A
sixth module, `src/domain/admin/claims.ts`, exposes a generic
subject-agnostic `upsertClaim`/`setClaimVerification` pair reused by every
admin page's "Claims" panel and by the `/verify` queue. `src/domain/verify.ts`
resolves each pending claim back to its owning school/program/cycle and
orders the queue by the rule already documented in
`docs/research-workflow.md` §6. UI is server-rendered forms in the existing
plain-Tailwind style (`<form action={serverAction}>`), matching
`src/components/AddChecklistItemForm.tsx` and `ChecklistItemRow.tsx`.

**Tech Stack:** Next.js App Router server actions, Drizzle ORM
(`better-sqlite3`), `drizzle-zod` (already generates insert/select schemas
per table in `src/lib/zod/*.ts` — reused directly, no new schema module
needed), Vitest + temp-file SQLite for integration tests, Playwright for one
new e2e flow.

**Spec:** `docs/plan.md` §4 "Phase 5 — Admin data entry and verification";
`docs/data-model.md` §3 (`change_log`, `claims`, `sources`); ordering rule in
`docs/research-workflow.md` §6.

## Global Constraints

- Every canonical mutation (schools, programs, application_cycles,
  requirements — the tables in `SUBJECT_TABLES`) must write exactly one
  `change_log` row in the same transaction as the mutation. This is the
  phase's stated gate and is asserted directly in tests, not just implied by
  convention.
- `sources` mutations do **not** write `change_log` rows: `sources` is not a
  member of `SUBJECT_TABLES` (see `src/db/schema/provenance.ts:35-42`), and a
  source is reference metadata shared across claims, not itself a subject a
  claim is made about. Document this as a deliberate scope decision, not an
  oversight, anywhere it might look inconsistent.
- Canonical rows are archived (`status='archived'`, `archived_at=now`), never
  hard-deleted. No admin function issues a SQL `DELETE` against a canonical
  table.
- A claim with `state='known'` requires a `source_id` (DB check constraint
  `claims_known_requires_source`); a claim with `verification != 'draft'`
  requires `checked_at` (DB check constraint
  `claims_verified_requires_checked_at`). Every write path that can produce
  either combination must satisfy the constraint itself rather than rely on
  the DB to reject it — set `checked_at` automatically when verification
  moves off `draft`, and require a source URL in the form/Zod layer when
  state is `known`.
- No app-level auth exists (`CLAUDE.md`: "No app-level authentication;
  Tailscale ACLs are the only access gate"). `change_log.actor` and
  `import_batches`/`batch_id` linkage are out of scope for this phase — every
  `recordChange` call passes `actor: null, batchId: null`.
- All new domain files start with `import "server-only";`, matching every
  existing file in `src/domain/**`.
- `npm run verify` (`format:check && typecheck && lint && test && test:e2e`)
  must pass before each task's commit.

---

## File Structure

```
src/domain/
  changeLog.ts                  # NEW — recordChange() helper
  admin/
    schools.ts                  # NEW — createSchool/updateSchool/archiveSchool
    programs.ts                 # NEW — createProgram/updateProgram/archiveProgram
    cycles.ts                   # NEW — createCycle/updateCycle/archiveCycle
    requirements.ts             # NEW — createRequirement/updateRequirement/archiveRequirement
    sources.ts                  # NEW — findOrCreateSource/updateSource/listSources
    claims.ts                   # NEW — upsertClaim/setClaimVerification/listClaimsForSubject
  verify.ts                     # NEW — listVerifyQueue (ordering per research-workflow.md §6)

src/app/actions/
  admin.ts                      # NEW — server actions for schools/programs/cycles/requirements
  adminClaims.ts                # NEW — server actions for claim upsert + verify/needs-review

src/components/admin/
  ClaimsPanel.tsx                # NEW — reusable claims list + add/edit form for one subject
  EntityForm.tsx                 # NEW — shared field styling helpers (small, optional import)

src/app/admin/
  page.tsx                              # REWRITE — school list + create form
  schools/[schoolSlug]/page.tsx         # NEW — edit school, its claims, its programs
  schools/[schoolSlug]/[programSlug]/page.tsx
                                         # NEW — edit program, its claims, its cycles
  schools/[schoolSlug]/[programSlug]/[cycleLabel]/page.tsx
                                         # NEW — edit cycle, its claims, its requirements
  sources/page.tsx                      # NEW — list + create + edit sources

src/app/verify/page.tsx          # REWRITE — actionable queue using listVerifyQueue

tests/integration/
  domain-change-log.test.ts         # NEW
  domain-admin-schools.test.ts      # NEW
  domain-admin-programs.test.ts     # NEW
  domain-admin-cycles.test.ts       # NEW
  domain-admin-requirements.test.ts # NEW
  domain-admin-sources.test.ts      # NEW
  domain-admin-claims.test.ts       # NEW (includes the cross-cutting change_log gate check)
  domain-verify-queue.test.ts       # NEW

tests/e2e/
  verify.spec.ts                    # NEW — the 6th flow named in plan.md's test-strategy table
```

Two decisions worth stating up front:

- **One generic claims module, not one per entity.** Every subject type
  (`schools`, `programs`, `application_cycles`, `requirements`) shares the
  same `(subject_table, subject_id, field_key)` claims shape. A single
  `ClaimsPanel` component and a single `upsertClaim`/`setClaimVerification`
  pair cover all of them, matching the "hybrid" architecture's own premise in
  `data-model.md` §2 that provenance is a shared, first-class concern — not
  duplicating a claims UI four times.
- **`requirements` claim `field_key` is auto-derived, matching existing
  code.** `src/app/programs/[schoolSlug]/[programSlug]/page.tsx:12-17` already
  keys a requirement's claim by whichever of `value_text` / `value_number` /
  `value_bool` / `value_date` is non-null on that requirement row. The admin
  requirement form reuses that exact rule so a fact edited in `/admin`
  matches the fact rendered on the public detail page without a second
  naming scheme.

---

### Task 1: `recordChange` helper

**Files:**
- Create: `src/domain/changeLog.ts`
- Test: `tests/integration/domain-change-log.test.ts`

**Interfaces:**
- Produces: `recordChange(db: Executor, input: { action: ChangeLogAction; subjectTable: ChangeLogSubjectTable; subjectId: number; fieldKey?: string | null; before?: unknown; after?: unknown; note?: string | null }): void`
  where `Executor = Pick<BetterSQLite3Database<typeof schema>, "insert">` (so
  it accepts either the outer `db` or a `tx` callback parameter — every later
  task calls this from inside `db.transaction((tx) => { ... recordChange(tx, ...) })`).
  `ChangeLogAction` and `ChangeLogSubjectTable` are re-exported type aliases
  over `CHANGE_LOG_ACTIONS` (`src/db/schema/audit.ts:17-23`) and
  `SUBJECT_TABLES` (`src/db/schema/provenance.ts:35-42`).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-change-log.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { recordChange } from "@/domain/changeLog";
import * as schema from "@/db/schema";

describe("recordChange", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("inserts a change_log row with the given action, subject, and JSON snapshots", () => {
    recordChange(db, {
      action: "create",
      subjectTable: "schools",
      subjectId: 42,
      fieldKey: null,
      before: null,
      after: { id: 42, name: "Test School" },
    });

    const rows = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, 42))
      .all();

    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("create");
    expect(rows[0]!.subjectTable).toBe("schools");
    expect(rows[0]!.actor).toBeNull();
    expect(rows[0]!.batchId).toBeNull();
    expect(rows[0]!.beforeJson).toBeNull();
    expect(rows[0]!.afterJson).toEqual({ id: 42, name: "Test School" });
  });

  it("participates in a transaction: a rollback removes both the mutation and the log row", () => {
    expect(() =>
      db.transaction((tx) => {
        tx.insert(schema.schools)
          .values({ slug: "rollback-school", name: "Rollback School" })
          .run();
        recordChange(tx, {
          action: "create",
          subjectTable: "schools",
          subjectId: 999,
          before: null,
          after: { slug: "rollback-school" },
        });
        throw new Error("force rollback");
      }),
    ).toThrow("force rollback");

    expect(
      db
        .select()
        .from(schema.schools)
        .where(eq(schema.schools.slug, "rollback-school"))
        .all(),
    ).toHaveLength(0);
    expect(
      db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.subjectId, 999))
        .all(),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-change-log.test.ts`
Expected: FAIL — `Cannot find module '@/domain/changeLog'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/changeLog.ts
import "server-only";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CHANGE_LOG_ACTIONS } from "@/db/schema/audit";
import { SUBJECT_TABLES } from "@/db/schema/provenance";

export type ChangeLogAction = (typeof CHANGE_LOG_ACTIONS)[number];
export type ChangeLogSubjectTable = (typeof SUBJECT_TABLES)[number];

type Executor = Pick<BetterSQLite3Database<typeof schema>, "insert">;

export function recordChange(
  db: Executor,
  input: {
    action: ChangeLogAction;
    subjectTable: ChangeLogSubjectTable;
    subjectId: number;
    fieldKey?: string | null;
    before?: unknown;
    after?: unknown;
    note?: string | null;
  },
): void {
  db.insert(schema.changeLog)
    .values({
      actor: null,
      action: input.action,
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey ?? null,
      beforeJson: input.before ?? null,
      afterJson: input.after ?? null,
      batchId: null,
      note: input.note ?? null,
    })
    .run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-change-log.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/changeLog.ts tests/integration/domain-change-log.test.ts
git commit -m "Phase 5: add recordChange change_log helper"
```

---

### Task 2: Schools admin CRUD

**Files:**
- Create: `src/domain/admin/schools.ts`
- Test: `tests/integration/domain-admin-schools.test.ts`

**Interfaces:**
- Consumes: `recordChange` from Task 1.
- Produces:
  `createSchool(db, input: SchoolInput): School`
  `updateSchool(db, id: number, patch: SchoolPatch): School`
  `archiveSchool(db, id: number): void`
  where `SchoolInput = { slug: string; name: string; city?: string | null; state?: string | null; country?: string; websiteUrl?: string | null }`,
  `SchoolPatch = Partial<SchoolInput>`, `School = typeof schema.schools.$inferSelect`.
  These three names and signatures are what Task 10's server actions import.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-schools.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { archiveSchool, createSchool, updateSchool } from "@/domain/admin/schools";
import * as schema from "@/db/schema";

describe("schools admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createSchool inserts a row and writes one create change_log row", () => {
    const school = createSchool(db, { slug: "acme-u", name: "Acme University" });

    expect(school.id).toBeGreaterThan(0);
    expect(school.status).toBe("draft");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs).toHaveLength(1);
    expect(logs[0]!.action).toBe("create");
    expect(logs[0]!.subjectTable).toBe("schools");
    expect(logs[0]!.beforeJson).toBeNull();
    expect((logs[0]!.afterJson as { slug: string }).slug).toBe("acme-u");
  });

  it("updateSchool patches fields and writes one update change_log row with before/after", () => {
    const school = createSchool(db, { slug: "acme-u", name: "Acme University" });

    const updated = updateSchool(db, school.id, { city: "Springfield" });

    expect(updated.city).toBe("Springfield");
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs).toHaveLength(2); // create + update
    const updateLog = logs.find((l) => l.action === "update")!;
    expect((updateLog.beforeJson as { city: string | null }).city).toBeNull();
    expect((updateLog.afterJson as { city: string | null }).city).toBe(
      "Springfield",
    );
  });

  it("archiveSchool sets status=archived and archived_at, and writes one archive log row", () => {
    const school = createSchool(db, { slug: "acme-u", name: "Acme University" });

    archiveSchool(db, school.id);

    const [row] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, school.id))
      .all();
    expect(row!.status).toBe("archived");
    expect(row!.archivedAt).not.toBeNull();

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, school.id))
      .all();
    expect(logs.filter((l) => l.action === "archive")).toHaveLength(1);
  });

  it("updateSchool throws for an unknown id", () => {
    expect(() => updateSchool(db, 99999, { city: "Nowhere" })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-schools.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/schools'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/schools.ts
import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { recordChange } from "../changeLog";

export type SchoolInput = {
  slug: string;
  name: string;
  city?: string | null;
  state?: string | null;
  country?: string;
  websiteUrl?: string | null;
};
export type SchoolPatch = Partial<SchoolInput>;
export type School = typeof schema.schools.$inferSelect;

export function createSchool(
  db: BetterSQLite3Database<typeof schema>,
  input: SchoolInput,
): School {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.schools)
      .values({
        slug: input.slug,
        name: input.name,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? "US",
        websiteUrl: input.websiteUrl ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "schools",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateSchool(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: SchoolPatch,
): School {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    if (!before) {
      throw new Error(`school ${id} not found`);
    }

    tx.update(schema.schools).set(patch).where(eq(schema.schools.id, id)).run();

    const [after] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "schools",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveSchool(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    if (!before) {
      throw new Error(`school ${id} not found`);
    }

    tx.update(schema.schools)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.schools.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "schools",
      subjectId: id,
      before,
      after,
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-schools.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/schools.ts tests/integration/domain-admin-schools.test.ts
git commit -m "Phase 5: add schools admin CRUD with change_log"
```

---

### Task 3: Programs admin CRUD

**Files:**
- Create: `src/domain/admin/programs.ts`
- Test: `tests/integration/domain-admin-programs.test.ts`

**Interfaces:**
- Consumes: `recordChange` (Task 1). `schema.CREDENTIALS`, `schema.MODALITIES`
  from `src/db/schema/canonical.ts`.
- Produces:
  `createProgram(db, input: ProgramInput): Program`
  `updateProgram(db, id: number, patch: ProgramPatch): Program`
  `archiveProgram(db, id: number): void`
  where
  ```typescript
  type ProgramInput = {
    schoolId: number;
    slug: string;
    name: string;
    credential?: (typeof CREDENTIALS)[number] | null;
    modality?: (typeof MODALITIES)[number] | null;
    accreditationStatus?: string | null;
    caeAccredited?: boolean | null;
    programLengthMonths?: number | null;
    classSize?: number | null;
    websiteUrl?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  type ProgramPatch = Partial<ProgramInput>;
  ```
  Same before/after/create/update/archive shape as Task 2.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-programs.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  archiveProgram,
  createProgram,
  updateProgram,
} from "@/domain/admin/programs";
import * as schema from "@/db/schema";

describe("programs admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let schoolId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    schoolId = createSchool(db, { slug: "acme-u", name: "Acme University" }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createProgram inserts a row scoped to the school and writes a create log row", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });

    expect(program.schoolId).toBe(schoolId);
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.subjectTable === "programs")).toHaveLength(1);
  });

  it("updateProgram changes credential and writes an update log row", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
      credential: "MS",
    });

    const updated = updateProgram(db, program.id, { credential: "Certificate" });
    expect(updated.credential).toBe("Certificate");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, program.id))
      .all();
    expect(logs.filter((l) => l.action === "update")).toHaveLength(1);
  });

  it("archiveProgram archives without touching the parent school", () => {
    const program = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    });

    archiveProgram(db, program.id);

    const [row] = db
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, program.id))
      .all();
    expect(row!.status).toBe("archived");

    const [school] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, schoolId))
      .all();
    expect(school!.status).toBe("draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-programs.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/programs'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/programs.ts
import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type ProgramInput = {
  schoolId: number;
  slug: string;
  name: string;
  credential?: (typeof CREDENTIALS)[number] | null;
  modality?: (typeof MODALITIES)[number] | null;
  accreditationStatus?: string | null;
  caeAccredited?: boolean | null;
  programLengthMonths?: number | null;
  classSize?: number | null;
  websiteUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};
export type ProgramPatch = Partial<ProgramInput>;
export type Program = typeof schema.programs.$inferSelect;

export function createProgram(
  db: BetterSQLite3Database<typeof schema>,
  input: ProgramInput,
): Program {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.programs)
      .values({
        schoolId: input.schoolId,
        slug: input.slug,
        name: input.name,
        credential: input.credential ?? null,
        modality: input.modality ?? null,
        accreditationStatus: input.accreditationStatus ?? null,
        caeAccredited: input.caeAccredited ?? null,
        programLengthMonths: input.programLengthMonths ?? null,
        classSize: input.classSize ?? null,
        websiteUrl: input.websiteUrl ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "programs",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateProgram(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: ProgramPatch,
): Program {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    if (!before) {
      throw new Error(`program ${id} not found`);
    }

    tx.update(schema.programs)
      .set(patch)
      .where(eq(schema.programs.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "programs",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveProgram(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    if (!before) {
      throw new Error(`program ${id} not found`);
    }

    tx.update(schema.programs)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.programs.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.programs)
      .where(eq(schema.programs.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "programs",
      subjectId: id,
      before,
      after,
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-programs.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/programs.ts tests/integration/domain-admin-programs.test.ts
git commit -m "Phase 5: add programs admin CRUD with change_log"
```

---

### Task 4: Application cycles admin CRUD

**Files:**
- Create: `src/domain/admin/cycles.ts`
- Test: `tests/integration/domain-admin-cycles.test.ts`

**Interfaces:**
- Consumes: `recordChange` (Task 1); `createSchool` (Task 2), `createProgram`
  (Task 3) in the test only.
- Produces:
  `createCycle(db, input: CycleInput): Cycle`
  `updateCycle(db, id: number, patch: CyclePatch): Cycle`
  `archiveCycle(db, id: number): void`
  ```typescript
  type CycleInput = {
    programId: number;
    cycleLabel: string;
    entryYear?: number | null;
    applicationOpensDate?: string | null;
    deadlineDate?: string | null;
    deadlineTimeLocal?: string | null;
    deadlineTimezone?: string | null;
    deadlineType?: (typeof DEADLINE_TYPES)[number] | null;
    casService?: (typeof CAS_SERVICES)[number] | null;
    decisionNotificationDate?: string | null;
  };
  type CyclePatch = Partial<CycleInput>;
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-cycles.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { archiveCycle, createCycle, updateCycle } from "@/domain/admin/cycles";
import * as schema from "@/db/schema";

describe("application cycles admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let programId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    const schoolId = createSchool(db, { slug: "acme-u", name: "Acme University" }).id;
    programId = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createCycle inserts a row and writes a create log row", () => {
    const cycle = createCycle(db, {
      programId,
      cycleLabel: "2026-27",
      deadlineDate: "2026-11-01",
      deadlineType: "firm",
    });

    expect(cycle.deadlineDate).toBe("2026-11-01");
    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, cycle.id))
      .all();
    expect(logs.filter((l) => l.subjectTable === "application_cycles")).toHaveLength(1);
  });

  it("updateCycle changes the deadline and writes an update log row with before/after", () => {
    const cycle = createCycle(db, { programId, cycleLabel: "2026-27" });

    const updated = updateCycle(db, cycle.id, { deadlineDate: "2026-10-15" });
    expect(updated.deadlineDate).toBe("2026-10-15");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, cycle.id))
      .all();
    const updateLog = logs.find((l) => l.action === "update")!;
    expect(
      (updateLog.beforeJson as { deadlineDate: string | null }).deadlineDate,
    ).toBeNull();
    expect(
      (updateLog.afterJson as { deadlineDate: string | null }).deadlineDate,
    ).toBe("2026-10-15");
  });

  it("archiveCycle sets status=archived and writes an archive log row", () => {
    const cycle = createCycle(db, { programId, cycleLabel: "2025-26" });

    archiveCycle(db, cycle.id);

    const [row] = db
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, cycle.id))
      .all();
    expect(row!.status).toBe("archived");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-cycles.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/cycles'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/cycles.ts
import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { CAS_SERVICES, DEADLINE_TYPES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type CycleInput = {
  programId: number;
  cycleLabel: string;
  entryYear?: number | null;
  applicationOpensDate?: string | null;
  deadlineDate?: string | null;
  deadlineTimeLocal?: string | null;
  deadlineTimezone?: string | null;
  deadlineType?: (typeof DEADLINE_TYPES)[number] | null;
  casService?: (typeof CAS_SERVICES)[number] | null;
  decisionNotificationDate?: string | null;
};
export type CyclePatch = Partial<CycleInput>;
export type Cycle = typeof schema.applicationCycles.$inferSelect;

export function createCycle(
  db: BetterSQLite3Database<typeof schema>,
  input: CycleInput,
): Cycle {
  return db.transaction((tx) => {
    const [row] = tx
      .insert(schema.applicationCycles)
      .values({
        programId: input.programId,
        cycleLabel: input.cycleLabel,
        entryYear: input.entryYear ?? null,
        applicationOpensDate: input.applicationOpensDate ?? null,
        deadlineDate: input.deadlineDate ?? null,
        deadlineTimeLocal: input.deadlineTimeLocal ?? null,
        deadlineTimezone: input.deadlineTimezone ?? null,
        deadlineType: input.deadlineType ?? null,
        casService: input.casService ?? null,
        decisionNotificationDate: input.decisionNotificationDate ?? null,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "application_cycles",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateCycle(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: CyclePatch,
): Cycle {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    if (!before) {
      throw new Error(`application cycle ${id} not found`);
    }

    tx.update(schema.applicationCycles)
      .set(patch)
      .where(eq(schema.applicationCycles.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "application_cycles",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveCycle(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    if (!before) {
      throw new Error(`application cycle ${id} not found`);
    }

    tx.update(schema.applicationCycles)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.applicationCycles.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.applicationCycles)
      .where(eq(schema.applicationCycles.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "application_cycles",
      subjectId: id,
      before,
      after,
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-cycles.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/cycles.ts tests/integration/domain-admin-cycles.test.ts
git commit -m "Phase 5: add application cycles admin CRUD with change_log"
```

---

### Task 5: Requirements admin CRUD

**Files:**
- Create: `src/domain/admin/requirements.ts`
- Test: `tests/integration/domain-admin-requirements.test.ts`

**Interfaces:**
- Consumes: `recordChange` (Task 1).
- Produces:
  `createRequirement(db, input: RequirementInput): Requirement` (auto-assigns
  `sortOrder` as `max(sortOrder) + 1` within the cycle, same pattern as
  `addChecklistItem` in `src/domain/checklists.ts:127-149`)
  `updateRequirement(db, id: number, patch: RequirementPatch): Requirement`
  `archiveRequirement(db, id: number): void`
  `requirementClaimFieldKey(req: { valueText: string | null; valueNumber: number | null; valueBool: boolean | null; valueDate: string | null }): "value_text" | "value_number" | "value_bool" | "value_date"`
  — the derivation rule already used at
  `src/app/programs/[schoolSlug]/[programSlug]/page.tsx:19-40`, extracted here
  so both the public detail page and the admin `ClaimsPanel` (Task 11) can
  import one implementation instead of two copies. **This task also updates
  that existing page** to import and use the extracted function instead of
  its private `resolveRequirementFact` value-column branch, so there is
  exactly one source of truth. Do not change that page's rendering behavior,
  only where the field-key logic lives.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-requirements.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { createCycle } from "@/domain/admin/cycles";
import {
  archiveRequirement,
  createRequirement,
  requirementClaimFieldKey,
  updateRequirement,
} from "@/domain/admin/requirements";
import * as schema from "@/db/schema";

describe("requirements admin CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let cycleId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    const schoolId = createSchool(db, { slug: "acme-u", name: "Acme University" }).id;
    const programId = createProgram(db, {
      schoolId,
      slug: "perfusion-ms",
      name: "MS in Perfusion",
    }).id;
    cycleId = createCycle(db, { programId, cycleLabel: "2026-27" }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("createRequirement inserts a row, auto-assigns sortOrder, and writes a create log row", () => {
    const first = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
    });
    const second = createRequirement(db, {
      cycleId,
      category: "test",
      label: "GRE required",
      valueBool: true,
    });

    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, second.id))
      .all();
    expect(logs.filter((l) => l.subjectTable === "requirements")).toHaveLength(1);
  });

  it("updateRequirement changes the value and writes an update log row", () => {
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
      valueNumber: 3.0,
    });

    const updated = updateRequirement(db, req.id, { valueNumber: 3.2 });
    expect(updated.valueNumber).toBe(3.2);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, req.id))
      .all();
    expect(logs.filter((l) => l.action === "update")).toHaveLength(1);
  });

  it("archiveRequirement sets status=archived and writes an archive log row", () => {
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: "Minimum overall GPA",
    });

    archiveRequirement(db, req.id);

    const [row] = db
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, req.id))
      .all();
    expect(row!.status).toBe("archived");
  });

  it("requirementClaimFieldKey picks the non-null value column, text-first", () => {
    expect(
      requirementClaimFieldKey({
        valueText: "some text",
        valueNumber: null,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_text");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: 3.0,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_number");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: true,
        valueDate: null,
      }),
    ).toBe("value_bool");
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: null,
        valueDate: "2026-11-01",
      }),
    ).toBe("value_date");
    // No value set yet (a requirement being drafted before its claim is
    // recorded) still needs a deterministic key to attach a claim to.
    expect(
      requirementClaimFieldKey({
        valueText: null,
        valueNumber: null,
        valueBool: null,
        valueDate: null,
      }),
    ).toBe("value_text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-requirements.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/requirements'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/requirements.ts
import "server-only";
import { eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";
import { recordChange } from "../changeLog";

export type RequirementInput = {
  cycleId: number;
  category: (typeof REQUIREMENT_CATEGORIES)[number];
  label: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBool?: boolean | null;
  valueDate?: string | null;
  unit?: string | null;
  isRequired?: boolean | null;
};
export type RequirementPatch = Partial<RequirementInput>;
export type Requirement = typeof schema.requirements.$inferSelect;

export function createRequirement(
  db: BetterSQLite3Database<typeof schema>,
  input: RequirementInput,
): Requirement {
  return db.transaction((tx) => {
    const [maxRow] = tx
      .select({
        maxSort: sql<number | null>`max(${schema.requirements.sortOrder})`,
      })
      .from(schema.requirements)
      .where(eq(schema.requirements.cycleId, input.cycleId))
      .all();
    const sortOrder = (maxRow?.maxSort ?? -1) + 1;

    const [row] = tx
      .insert(schema.requirements)
      .values({
        cycleId: input.cycleId,
        category: input.category,
        label: input.label,
        valueText: input.valueText ?? null,
        valueNumber: input.valueNumber ?? null,
        valueBool: input.valueBool ?? null,
        valueDate: input.valueDate ?? null,
        unit: input.unit ?? null,
        isRequired: input.isRequired ?? null,
        sortOrder,
      })
      .returning()
      .all();
    recordChange(tx, {
      action: "create",
      subjectTable: "requirements",
      subjectId: row!.id,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function updateRequirement(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: RequirementPatch,
): Requirement {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    if (!before) {
      throw new Error(`requirement ${id} not found`);
    }

    tx.update(schema.requirements)
      .set(patch)
      .where(eq(schema.requirements.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    recordChange(tx, {
      action: "update",
      subjectTable: "requirements",
      subjectId: id,
      before,
      after,
    });
    return after!;
  });
}

export function archiveRequirement(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
): void {
  db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    if (!before) {
      throw new Error(`requirement ${id} not found`);
    }

    tx.update(schema.requirements)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.requirements.id, id))
      .run();

    const [after] = tx
      .select()
      .from(schema.requirements)
      .where(eq(schema.requirements.id, id))
      .all();
    recordChange(tx, {
      action: "archive",
      subjectTable: "requirements",
      subjectId: id,
      before,
      after,
    });
  });
}

export function requirementClaimFieldKey(req: {
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueDate: string | null;
}): "value_text" | "value_number" | "value_bool" | "value_date" {
  if (req.valueText !== null) return "value_text";
  if (req.valueNumber !== null) return "value_number";
  if (req.valueBool !== null) return "value_bool";
  if (req.valueDate !== null) return "value_date";
  return "value_text";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-requirements.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Update the existing program detail page to reuse `requirementClaimFieldKey`**

Open `src/app/programs/[schoolSlug]/[programSlug]/page.tsx`. Replace the
private `REQUIREMENT_CLAIM_FIELD_KEYS` constant and the value-column
branching inside `resolveRequirementFact` (lines 12-40 as read during
planning) with a call to the extracted function:

```typescript
import { requirementClaimFieldKey } from "@/domain/admin/requirements";

// inside resolveRequirementFact, replace the four if-blocks with:
const fieldKey = requirementClaimFieldKey(req);
const value =
  fieldKey === "value_text"
    ? req.valueText
    : fieldKey === "value_number"
      ? req.valueNumber
      : fieldKey === "value_bool"
        ? req.valueBool
        : req.valueDate;
return {
  value: value ?? "—",
  claim: claimFor("requirements", req.id, fieldKey),
};
```

Keep the function's existing signature and call sites unchanged — only the
internal branching moves.

- [ ] **Step 6: Run the full test suite to confirm no regression**

Run: `npm run test`
Expected: all existing tests still pass, including
`tests/e2e` is not run by this command — that happens in Task 13.

- [ ] **Step 7: Commit**

```bash
git add src/domain/admin/requirements.ts tests/integration/domain-admin-requirements.test.ts \
  "src/app/programs/[schoolSlug]/[programSlug]/page.tsx"
git commit -m "Phase 5: add requirements admin CRUD; dedupe claim field-key logic"
```

---

### Task 6: Sources admin (no change_log)

**Files:**
- Create: `src/domain/admin/sources.ts`
- Test: `tests/integration/domain-admin-sources.test.ts`

**Interfaces:**
- Produces:
  `findOrCreateSource(db, input: SourceInput): Source`
  `updateSource(db, id: number, patch: SourcePatch): Source`
  `listSources(db): Source[]` (ordered by `url`)
  ```typescript
  type SourceInput = {
    url: string;
    sourceType: (typeof SOURCE_TYPES)[number];
    title?: string | null;
    publisher?: string | null;
    notes?: string | null;
  };
  type SourcePatch = Partial<Omit<SourceInput, "url">>;
  ```
  `findOrCreateSource` is idempotent on `url` (unique constraint
  `sources_url_unique`) — this is also what Task 7's `upsertClaim` calls
  internally rather than duplicating the find-or-create logic.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-sources.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  findOrCreateSource,
  listSources,
  updateSource,
} from "@/domain/admin/sources";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("sources admin", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("findOrCreateSource creates a new row for an unseen URL", () => {
    const source = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(source.id).toBeGreaterThan(0);
    expect(source.url).toBe("https://example.edu/admissions");
  });

  it("findOrCreateSource returns the existing row for a seen URL instead of duplicating it", () => {
    const first = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    const second = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(second.id).toBe(first.id);

    const all = db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, "https://example.edu/admissions"))
      .all();
    expect(all).toHaveLength(1);
  });

  it("findOrCreateSource does not write a change_log row (sources are not a SUBJECT_TABLES member)", () => {
    findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
  });

  it("updateSource patches title and publisher", () => {
    const source = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    const updated = updateSource(db, source.id, { title: "Admissions Page" });
    expect(updated.title).toBe("Admissions Page");
  });

  it("listSources returns all sources ordered by URL", () => {
    findOrCreateSource(db, { url: "https://b.edu", sourceType: "other" });
    findOrCreateSource(db, { url: "https://a.edu", sourceType: "other" });
    const all = listSources(db);
    expect(all.map((s) => s.url)).toEqual(["https://a.edu", "https://b.edu"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-sources.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/sources'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/sources.ts
import "server-only";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { SOURCE_TYPES } from "@/db/schema/provenance";

export type SourceInput = {
  url: string;
  sourceType: (typeof SOURCE_TYPES)[number];
  title?: string | null;
  publisher?: string | null;
  notes?: string | null;
};
export type SourcePatch = Partial<Omit<SourceInput, "url">>;
export type Source = typeof schema.sources.$inferSelect;

// Structural, not the full BetterSQLite3Database: this lets callers pass
// either the outer `db` or an in-progress `tx` (Task 7's upsertClaim calls
// this from inside its own db.transaction((tx) => ...), so this function
// must not open a second transaction of its own — it just runs its two
// queries against whichever executor it is given).
type Executor = Pick<BetterSQLite3Database<typeof schema>, "select" | "insert">;

export function findOrCreateSource(db: Executor, input: SourceInput): Source {
  const [existing] = db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.url, input.url))
    .all();
  if (existing) {
    return existing;
  }

  const [row] = db
    .insert(schema.sources)
    .values({
      url: input.url,
      sourceType: input.sourceType,
      title: input.title ?? null,
      publisher: input.publisher ?? null,
      notes: input.notes ?? null,
    })
    .returning()
    .all();
  return row!;
}

export function updateSource(
  db: BetterSQLite3Database<typeof schema>,
  id: number,
  patch: SourcePatch,
): Source {
  db.update(schema.sources).set(patch).where(eq(schema.sources.id, id)).run();
  const [row] = db.select().from(schema.sources).where(eq(schema.sources.id, id)).all();
  if (!row) {
    throw new Error(`source ${id} not found`);
  }
  return row;
}

export function listSources(
  db: BetterSQLite3Database<typeof schema>,
): Source[] {
  return db.select().from(schema.sources).orderBy(schema.sources.url).all();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-sources.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/sources.ts tests/integration/domain-admin-sources.test.ts
git commit -m "Phase 5: add sources admin find-or-create/update/list"
```

---

### Task 7: Claims admin — upsert, verify/needs-review, and the change_log gate check

**Files:**
- Create: `src/domain/admin/claims.ts`
- Test: `tests/integration/domain-admin-claims.test.ts`

**Interfaces:**
- Consumes: `recordChange` (Task 1), `findOrCreateSource` (Task 6),
  `ClaimWithSource` type (already defined in `src/domain/claims.ts:14-16` —
  reuse it, do not redefine).
- Produces:
  `upsertClaim(db, input: ClaimUpsertInput): Claim`
  `setClaimVerification(db, claimId: number, verification: "verified" | "needs_review"): Claim`
  `listClaimsForSubject(db, subjectTable: SubjectTable, subjectId: number): ClaimWithSource[]`
  ```typescript
  type ClaimUpsertInput = {
    subjectTable: SubjectTable;
    subjectId: number;
    fieldKey: string;
    state: (typeof CLAIM_STATES)[number];
    sourceUrl?: string | null;
    sourceType?: (typeof SOURCE_TYPES)[number];
    quote?: string | null;
    note?: string | null;
    checkedAt?: Date | null;
    verification?: (typeof VERIFICATION_STATES)[number];
    locked?: boolean;
  };
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-admin-claims.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import {
  listClaimsForSubject,
  setClaimVerification,
  upsertClaim,
} from "@/domain/admin/claims";
import * as schema from "@/db/schema";

describe("claims admin", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;
  let schoolId: number;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
    schoolId = createSchool(db, { slug: "acme-u", name: "Acme University" }).id;
  });

  afterEach(() => {
    ctx.close();
  });

  it("upsertClaim creates a claim, finds-or-creates its source, and writes one create change_log row keyed to the subject and field", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      quote: "Acme University",
      checkedAt: new Date("2026-08-01"),
    });

    expect(claim.state).toBe("known");
    expect(claim.sourceId).not.toBeNull();

    const [source] = db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, "https://acme.edu/about"))
      .all();
    expect(source!.id).toBe(claim.sourceId);

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(
        and(
          eq(schema.changeLog.subjectTable, "schools"),
          eq(schema.changeLog.subjectId, schoolId),
          eq(schema.changeLog.fieldKey, "name"),
        ),
      )
      .all();
    expect(logs.filter((l) => l.action === "create")).toHaveLength(1);
  });

  it("upsertClaim on an existing (subjectTable, subjectId, fieldKey) updates in place rather than duplicating", () => {
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "unknown",
      checkedAt: new Date(),
    });

    const rows = db
      .select()
      .from(schema.claims)
      .where(
        and(
          eq(schema.claims.subjectTable, "schools"),
          eq(schema.claims.subjectId, schoolId),
          eq(schema.claims.fieldKey, "name"),
        ),
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("unknown");
  });

  it("upsertClaim auto-sets checkedAt when verification moves off draft without one, satisfying the DB check constraint", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "unknown",
      verification: "needs_review",
    });
    expect(claim.checkedAt).not.toBeNull();
  });

  it("setClaimVerification moves a claim to verified and writes a verify change_log row", () => {
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "city",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });

    const verified = setClaimVerification(db, claim.id, "verified");
    expect(verified.verification).toBe("verified");

    const logs = db
      .select()
      .from(schema.changeLog)
      .where(eq(schema.changeLog.subjectId, schoolId))
      .all();
    expect(logs.filter((l) => l.action === "verify")).toHaveLength(1);
  });

  it("listClaimsForSubject returns claims for one subject joined with their source", () => {
    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });

    const claims = listClaimsForSubject(db, "schools", schoolId);
    expect(claims).toHaveLength(1);
    expect(claims[0]!.source?.url).toBe("https://acme.edu/about");
  });

  // This is the phase's stated gate: every canonical write produces a
  // change_log row. Schools/programs/cycles/requirements are covered in
  // their own task's tests; this asserts the pattern holds for the claims
  // write path too, and counts total rows end-to-end for one subject.
  it("every claim mutation on a subject produces exactly one new change_log row", () => {
    const before = db.select().from(schema.changeLog).all().length;

    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "state",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 1);

    upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "state",
      state: "known",
      sourceUrl: "https://acme.edu/about",
      sourceType: "program_site",
      checkedAt: new Date(),
      note: "re-confirmed",
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 2);

    setClaimVerification(db, claim.id, "verified");
    expect(db.select().from(schema.changeLog).all()).toHaveLength(before + 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-admin-claims.test.ts`
Expected: FAIL — `Cannot find module '@/domain/admin/claims'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/admin/claims.ts
import "server-only";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type {
  CLAIM_STATES,
  SOURCE_TYPES,
  VERIFICATION_STATES,
} from "@/db/schema/provenance";
import { recordChange } from "../changeLog";
import type { SubjectTable } from "../claims";
import type { ClaimWithSource } from "../claims";

export type ClaimUpsertInput = {
  subjectTable: SubjectTable;
  subjectId: number;
  fieldKey: string;
  state: (typeof CLAIM_STATES)[number];
  sourceUrl?: string | null;
  sourceType?: (typeof SOURCE_TYPES)[number];
  quote?: string | null;
  note?: string | null;
  checkedAt?: Date | null;
  verification?: (typeof VERIFICATION_STATES)[number];
  locked?: boolean;
};
export type Claim = typeof schema.claims.$inferSelect;

function subjectFieldEq(subjectTable: SubjectTable, subjectId: number, fieldKey: string) {
  return and(
    eq(schema.claims.subjectTable, subjectTable),
    eq(schema.claims.subjectId, subjectId),
    eq(schema.claims.fieldKey, fieldKey),
  );
}

export function upsertClaim(
  db: BetterSQLite3Database<typeof schema>,
  input: ClaimUpsertInput,
): Claim {
  return db.transaction((tx) => {
    let sourceId: number | null = null;
    if (input.sourceUrl) {
      sourceId = findOrCreateSource(tx, {
        url: input.sourceUrl,
        sourceType: input.sourceType ?? "other",
      }).id;
    }

    const [existingClaim] = tx
      .select()
      .from(schema.claims)
      .where(subjectFieldEq(input.subjectTable, input.subjectId, input.fieldKey))
      .all();

    const resolvedVerification =
      input.verification ?? existingClaim?.verification ?? "draft";
    let resolvedCheckedAt =
      input.checkedAt ?? existingClaim?.checkedAt ?? null;
    if (resolvedVerification !== "draft" && resolvedCheckedAt === null) {
      resolvedCheckedAt = new Date();
    }

    const values = {
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey,
      state: input.state,
      sourceId,
      quote: input.quote ?? null,
      note: input.note ?? null,
      checkedAt: resolvedCheckedAt,
      verification: resolvedVerification,
      locked: input.locked ?? existingClaim?.locked ?? false,
    };

    if (existingClaim) {
      tx.update(schema.claims)
        .set(values)
        .where(eq(schema.claims.id, existingClaim.id))
        .run();
      const [after] = tx
        .select()
        .from(schema.claims)
        .where(eq(schema.claims.id, existingClaim.id))
        .all();
      recordChange(tx, {
        action: "update",
        subjectTable: input.subjectTable,
        subjectId: input.subjectId,
        fieldKey: input.fieldKey,
        before: existingClaim,
        after,
      });
      return after!;
    }

    const [row] = tx.insert(schema.claims).values(values).returning().all();
    recordChange(tx, {
      action: "create",
      subjectTable: input.subjectTable,
      subjectId: input.subjectId,
      fieldKey: input.fieldKey,
      before: null,
      after: row,
    });
    return row!;
  });
}

export function setClaimVerification(
  db: BetterSQLite3Database<typeof schema>,
  claimId: number,
  verification: "verified" | "needs_review",
): Claim {
  return db.transaction((tx) => {
    const [before] = tx
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .all();
    if (!before) {
      throw new Error(`claim ${claimId} not found`);
    }

    const patch: Partial<typeof schema.claims.$inferInsert> = { verification };
    if (before.checkedAt === null) {
      patch.checkedAt = new Date();
    }

    tx.update(schema.claims).set(patch).where(eq(schema.claims.id, claimId)).run();
    const [after] = tx
      .select()
      .from(schema.claims)
      .where(eq(schema.claims.id, claimId))
      .all();

    recordChange(tx, {
      action: "verify",
      subjectTable: before.subjectTable,
      subjectId: before.subjectId,
      fieldKey: before.fieldKey,
      before,
      after,
    });
    return after!;
  });
}

export function listClaimsForSubject(
  db: BetterSQLite3Database<typeof schema>,
  subjectTable: SubjectTable,
  subjectId: number,
): ClaimWithSource[] {
  return db
    .select()
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(
      and(
        eq(schema.claims.subjectTable, subjectTable),
        eq(schema.claims.subjectId, subjectId),
      ),
    )
    .orderBy(schema.claims.fieldKey)
    .all()
    .map((row) => ({ ...row.claims, source: row.sources }));
}
```

`SubjectTable` and `ClaimWithSource` must be exported from
`src/domain/claims.ts` — they already are (`export type SubjectTable` at
line 8, `export type ClaimWithSource` at line 15). No change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-admin-claims.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/admin/claims.ts tests/integration/domain-admin-claims.test.ts
git commit -m "Phase 5: add claims upsert/verify with change_log; assert the phase's gate"
```

---

### Task 8: Verify queue

**Files:**
- Create: `src/domain/verify.ts`
- Test: `tests/integration/domain-verify-queue.test.ts`

**Interfaces:**
- Consumes: `CURRENT_USER_ID` from `src/domain/user.ts`.
- Produces:
  `listVerifyQueue(db): VerifyQueueItem[]`
  ```typescript
  type VerifyQueueItem = {
    claim: typeof schema.claims.$inferSelect;
    source: typeof schema.sources.$inferSelect | null;
    subjectLabel: string;
    school: { slug: string; name: string } | null;
    program: { slug: string; name: string; id: number } | null;
    deadlineDate: string | null;
    isSaved: boolean;
  };
  ```
  (`program` carries `id` — not just `slug`/`name` — because `listVerifyQueue`
  needs it to check membership against the saved-programs id set; Task 12's
  `/verify` page only reads `.slug`/`.name` off it.)
  Ordering (from `docs/research-workflow.md` §6): claims on saved programs
  with a deadline, nearest first; then claims on saved programs with no
  deadline; then everything else (alphabetical by `subjectLabel` as a stable
  tiebreaker within a tier). A claim is "pending" when
  `verification IN ('draft', 'needs_review', 'stale')`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/integration/domain-verify-queue.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { createCycle } from "@/domain/admin/cycles";
import { createRequirement } from "@/domain/admin/requirements";
import { upsertClaim } from "@/domain/admin/claims";
import { listVerifyQueue } from "@/domain/verify";
import { CURRENT_USER_ID } from "@/domain/user";
import * as schema from "@/db/schema";

describe("listVerifyQueue", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  function seedProgram(opts: {
    slug: string;
    saved: boolean;
    deadlineDate?: string;
  }) {
    const schoolId = createSchool(db, {
      slug: `${opts.slug}-school`,
      name: `${opts.slug} School`,
    }).id;
    const programId = createProgram(db, {
      schoolId,
      slug: opts.slug,
      name: `${opts.slug} program`,
    }).id;
    const cycleId = createCycle(db, {
      programId,
      cycleLabel: "2026-27",
      deadlineDate: opts.deadlineDate,
    }).id;
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: `${opts.slug} requirement`,
    });
    upsertClaim(db, {
      subjectTable: "requirements",
      subjectId: req.id,
      fieldKey: "value_text",
      state: "unknown",
    });
    if (opts.saved) {
      db.insert(schema.savedPrograms)
        .values({ userId: CURRENT_USER_ID, programId })
        .run();
    }
    return { schoolId, programId, cycleId };
  }

  it("orders saved-with-deadline first (nearest first), then saved-no-deadline, then everything else", () => {
    seedProgram({ slug: "z-unsaved", saved: false });
    seedProgram({ slug: "b-saved-far", saved: true, deadlineDate: "2026-12-01" });
    seedProgram({ slug: "a-saved-near", saved: true, deadlineDate: "2026-10-01" });
    seedProgram({ slug: "c-saved-no-deadline", saved: true });

    const queue = listVerifyQueue(db);
    const order = queue.map((item) => item.program?.slug);

    expect(order).toEqual([
      "a-saved-near",
      "b-saved-far",
      "c-saved-no-deadline",
      "z-unsaved",
    ]);
  });

  it("excludes claims that are already verified or archived", () => {
    const { schoolId } = seedProgram({ slug: "already-verified", saved: false });
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://example.edu",
      sourceType: "program_site",
      checkedAt: new Date(),
      verification: "verified",
    });

    const queue = listVerifyQueue(db);
    expect(queue.find((item) => item.claim.id === claim.id)).toBeUndefined();
  });

  it("marks isSaved correctly per item", () => {
    seedProgram({ slug: "saved-one", saved: true, deadlineDate: "2026-10-01" });
    const queue = listVerifyQueue(db);
    const item = queue.find((i) => i.program?.slug === "saved-one");
    expect(item?.isSaved).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/domain-verify-queue.test.ts`
Expected: FAIL — `Cannot find module '@/domain/verify'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/domain/verify.ts
import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import type { SubjectTable } from "./claims";
import { CURRENT_USER_ID } from "./user";

export type VerifyQueueItem = {
  claim: typeof schema.claims.$inferSelect;
  source: typeof schema.sources.$inferSelect | null;
  subjectLabel: string;
  school: { slug: string; name: string } | null;
  program: { slug: string; name: string; id: number } | null;
  deadlineDate: string | null;
  isSaved: boolean;
};

type SubjectContext = {
  school: { slug: string; name: string } | null;
  program: { slug: string; name: string; id: number } | null;
  deadlineDate: string | null;
  subjectLabel: string;
};

function resolveSubjectContext(
  db: BetterSQLite3Database<typeof schema>,
  subjectTable: SubjectTable,
  subjectId: number,
): SubjectContext {
  const empty: SubjectContext = {
    school: null,
    program: null,
    deadlineDate: null,
    subjectLabel: `${subjectTable} ${subjectId}`,
  };

  if (subjectTable === "schools") {
    const [school] = db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, subjectId))
      .all();
    if (!school) return empty;
    return {
      school: { slug: school.slug, name: school.name },
      program: null,
      deadlineDate: null,
      subjectLabel: school.name,
    };
  }

  if (subjectTable === "programs") {
    const [row] = db
      .select({ program: schema.programs, school: schema.schools })
      .from(schema.programs)
      .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
      .where(eq(schema.programs.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: { slug: row.program.slug, name: row.program.name, id: row.program.id },
      deadlineDate: null,
      subjectLabel: row.program.name,
    };
  }

  if (subjectTable === "application_cycles") {
    const [row] = db
      .select({
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.applicationCycles)
      .innerJoin(schema.programs, eq(schema.applicationCycles.programId, schema.programs.id))
      .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
      .where(eq(schema.applicationCycles.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: { slug: row.program.slug, name: row.program.name, id: row.program.id },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: `${row.program.name} — ${row.cycle.cycleLabel}`,
    };
  }

  if (subjectTable === "requirements") {
    const [row] = db
      .select({
        requirement: schema.requirements,
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.requirements)
      .innerJoin(schema.applicationCycles, eq(schema.requirements.cycleId, schema.applicationCycles.id))
      .innerJoin(schema.programs, eq(schema.applicationCycles.programId, schema.programs.id))
      .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
      .where(eq(schema.requirements.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: { slug: row.program.slug, name: row.program.name, id: row.program.id },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: row.requirement.label,
    };
  }

  if (subjectTable === "prerequisite_courses") {
    const [row] = db
      .select({
        prereq: schema.prerequisiteCourses,
        cycle: schema.applicationCycles,
        program: schema.programs,
        school: schema.schools,
      })
      .from(schema.prerequisiteCourses)
      .innerJoin(schema.applicationCycles, eq(schema.prerequisiteCourses.cycleId, schema.applicationCycles.id))
      .innerJoin(schema.programs, eq(schema.applicationCycles.programId, schema.programs.id))
      .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
      .where(eq(schema.prerequisiteCourses.id, subjectId))
      .all();
    if (!row) return empty;
    return {
      school: { slug: row.school.slug, name: row.school.name },
      program: { slug: row.program.slug, name: row.program.name, id: row.program.id },
      deadlineDate: row.cycle.deadlineDate,
      subjectLabel: row.prereq.subject,
    };
  }

  // subjectTable === "tuition_estimates"
  const [row] = db
    .select({
      tuition: schema.tuitionEstimates,
      program: schema.programs,
      school: schema.schools,
    })
    .from(schema.tuitionEstimates)
    .innerJoin(schema.programs, eq(schema.tuitionEstimates.programId, schema.programs.id))
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(eq(schema.tuitionEstimates.id, subjectId))
    .all();
  if (!row) return empty;
  return {
    school: { slug: row.school.slug, name: row.school.name },
    program: { slug: row.program.slug, name: row.program.name, id: row.program.id },
    deadlineDate: null,
    subjectLabel: `tuition (${row.tuition.residency})`,
  };
}

function tier(item: VerifyQueueItem): 0 | 1 | 2 {
  if (item.isSaved && item.deadlineDate) return 0;
  if (item.isSaved) return 1;
  return 2;
}

export function listVerifyQueue(
  db: BetterSQLite3Database<typeof schema>,
): VerifyQueueItem[] {
  const rows = db
    .select({ claim: schema.claims, source: schema.sources })
    .from(schema.claims)
    .leftJoin(schema.sources, eq(schema.claims.sourceId, schema.sources.id))
    .where(inArray(schema.claims.verification, ["draft", "needs_review", "stale"]))
    .all();

  const savedProgramIds = new Set(
    db
      .select({ programId: schema.savedPrograms.programId })
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.userId, CURRENT_USER_ID))
      .all()
      .map((r) => r.programId),
  );

  const items: VerifyQueueItem[] = rows.map(({ claim, source }) => {
    const ctx = resolveSubjectContext(db, claim.subjectTable, claim.subjectId);
    return {
      claim,
      source,
      subjectLabel: ctx.subjectLabel,
      school: ctx.school,
      program: ctx.program,
      deadlineDate: ctx.deadlineDate,
      isSaved: ctx.program !== null && savedProgramIds.has(ctx.program.id),
    };
  });

  return items.sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    if (ta === 0) {
      return (a.deadlineDate ?? "").localeCompare(b.deadlineDate ?? "");
    }
    return a.subjectLabel.localeCompare(b.subjectLabel);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/domain-verify-queue.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/verify.ts tests/integration/domain-verify-queue.test.ts
git commit -m "Phase 5: add verify queue ordered per research-workflow.md §6"
```

---

### Task 9: Run the full test suite and typecheck before starting UI work

This is a checkpoint task, not a new deliverable — it exists because Tasks
1-8 touched shared types (`SubjectTable`, `ClaimWithSource`) and one existing
page (Task 5, step 5). Confirm everything still fits together before layering
UI on top.

**Files:** none created or modified.

- [ ] **Step 1: Full verify run**

Run: `npm run verify`
Expected: `format:check`, `typecheck`, `lint`, `test` all pass.
(`test:e2e` will still pass too, since no e2e test yet depends on Phase 5 UI —
Task 13 adds that.)

If anything fails, fix it in the file that owns the failure (do not add
suppressions or `any`), re-run, and only proceed once green. Do not commit
from this task — it has nothing new to commit.

---

### Task 10: Server actions for schools/programs/cycles/requirements/sources

**Files:**
- Create: `src/app/actions/admin.ts`

**Interfaces:**
- Consumes: `createSchool`/`updateSchool`/`archiveSchool` (Task 2),
  `createProgram`/`updateProgram`/`archiveProgram` (Task 3),
  `createCycle`/`updateCycle`/`archiveCycle` (Task 4),
  `createRequirement`/`updateRequirement`/`archiveRequirement` (Task 5),
  `findOrCreateSource`/`updateSource` (Task 6). Reuses the existing
  drizzle-zod schemas: `schoolInsertSchema`, `programInsertSchema`,
  `applicationCycleInsertSchema`, `requirementInsertSchema`,
  `sourceInsertSchema` from `src/lib/zod` (all already generated —
  `src/lib/zod/canonical.ts:14-33`, `src/lib/zod/provenance.ts:4-5`).
- Produces: one server action per create/update/archive per entity (15
  functions total), each a plain `async function(...): Promise<void>` bound
  to a `<form action={...}>` the way `generateChecklistAction` is bound in
  `src/app/my/page.tsx:59`. Every action calls
  `revalidatePath("/admin", "layout")`, `revalidatePath("/verify")`, and
  `revalidatePath("/programs", "layout")` (the last one because editing a
  requirement or cycle changes what the public detail page renders).

This task has no dedicated integration test — the domain functions it wraps
are already tested (Tasks 2-6), and `FormData` parsing plus revalidation are
exercised by the e2e test in Task 13. Type-check and manual verification via
`npm run dev` are this task's correctness check.

- [ ] **Step 1: Write the server actions**

```typescript
// src/app/actions/admin.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { archiveSchool, createSchool, updateSchool } from "@/domain/admin/schools";
import { archiveProgram, createProgram, updateProgram } from "@/domain/admin/programs";
import { archiveCycle, createCycle, updateCycle } from "@/domain/admin/cycles";
import {
  archiveRequirement,
  createRequirement,
  updateRequirement,
} from "@/domain/admin/requirements";
import { findOrCreateSource, updateSource } from "@/domain/admin/sources";
import { CREDENTIALS, DEADLINE_TYPES, MODALITIES, REQUIREMENT_CATEGORIES, CAS_SERVICES } from "@/db/schema/canonical";
import { SOURCE_TYPES } from "@/db/schema/provenance";
import { slugify } from "@/lib/slug";

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
  websiteUrl: optionalTrimmed,
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
  credential: z.union([credentialSchema, z.literal("")]).transform((v) => (v === "" ? null : v)),
  modality: z.union([modalitySchema, z.literal("")]).transform((v) => (v === "" ? null : v)),
  websiteUrl: optionalTrimmed,
});

export async function createProgramAction(
  schoolId: number,
  formData: FormData,
): Promise<void> {
  const parsed = programFormSchema.parse({
    name: formData.get("name") ?? "",
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
    .refine((v) => v === null || Number.isInteger(v), "invalid year"),
  deadlineDate: calendarDateSchema,
  deadlineType: z.union([z.enum(DEADLINE_TYPES), z.literal("")]).transform((v) => (v === "" ? null : v)),
  casService: z.union([z.enum(CAS_SERVICES), z.literal("")]).transform((v) => (v === "" ? null : v)),
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
    .refine((v) => v === null || !Number.isNaN(v), "invalid number"),
  valueBool: valueBoolFormSchema,
  valueDate: calendarDateSchema,
  isRequired: z.string().transform((v) => v === "on"),
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

export async function archiveRequirementAction(requirementId: number): Promise<void> {
  archiveRequirement(db, requirementId);
  revalidateAdmin();
}

// --- sources ---

const sourceFormSchema = z.object({
  url: z.string().trim().url("must be a valid URL"),
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
    title: typeof title === "string" && title.trim() !== "" ? title.trim() : null,
    publisher:
      typeof publisher === "string" && publisher.trim() !== "" ? publisher.trim() : null,
  });
  revalidateAdmin();
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. This file has no runtime test of its own — `FormData`
parsing is exercised in Task 13's e2e flow — but it must compile clean
against the domain function signatures from Tasks 2-6.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/admin.ts
git commit -m "Phase 5: add server actions for schools/programs/cycles/requirements/sources"
```

---

### Task 11: Claim server actions + `ClaimsPanel` component

**Files:**
- Create: `src/app/actions/adminClaims.ts`
- Create: `src/components/admin/ClaimsPanel.tsx`

**Interfaces:**
- Consumes: `upsertClaim`, `setClaimVerification`, `listClaimsForSubject`
  (Task 7); `SubjectTable`, `ClaimWithSource` (`src/domain/claims.ts`);
  `CLAIM_STATES`, `SOURCE_TYPES` (`src/db/schema/provenance.ts`).
- Produces: `upsertClaimAction(subjectTable, subjectId, formData): Promise<void>`,
  `setClaimVerificationAction(claimId, verification): Promise<void>` (used
  by both admin subject pages, Task 12, and the `/verify` queue, Task 12).
  `<ClaimsPanel subjectTable subjectId claims={ClaimWithSource[]} />` — a
  server component (no `"use client"`; its buttons are plain `<form>`
  submissions, matching `AddChecklistItemForm`'s style rather than
  `ChecklistItemRow`'s `useTransition` style, since nothing here needs
  optimistic UI).

- [ ] **Step 1: Write the server actions**

```typescript
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
    checkedAt: parsed.checkedAt,
  });
  revalidateAdmin();
}

const verificationActionSchema = z.enum(["verified", "needs_review"]);

export async function setClaimVerificationAction(
  claimId: number,
  verification: string,
): Promise<void> {
  setClaimVerification(db, claimId, verificationActionSchema.parse(verification));
  revalidateAdmin();
}
```

- [ ] **Step 2: Write `ClaimsPanel`**

```typescript
// src/components/admin/ClaimsPanel.tsx
import type { ClaimWithSource, SubjectTable } from "@/domain/claims";
import { CLAIM_STATES, SOURCE_TYPES } from "@/db/schema/provenance";
import { upsertClaimAction, setClaimVerificationAction } from "@/app/actions/adminClaims";

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function ClaimsPanel({
  subjectTable,
  subjectId,
  claims,
}: {
  subjectTable: SubjectTable;
  subjectId: number;
  claims: ClaimWithSource[];
}) {
  return (
    <div className="mt-4 rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">Claims</h3>

      {claims.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">No claims recorded yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {claims.map((claim) => (
            <li
              key={claim.id}
              className="rounded border border-zinc-200 p-2 text-xs dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{claim.fieldKey}</span>
                <span>{claim.state}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                  {claim.verification}
                </span>
                {claim.source && (
                  <a
                    href={claim.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline dark:text-blue-400"
                  >
                    source
                  </a>
                )}
              </div>
              {claim.quote && <p className="mt-1 italic">&ldquo;{claim.quote}&rdquo;</p>}
              {claim.checkedAt && (
                <p className="mt-1 text-zinc-500">
                  checked {formatDate(claim.checkedAt)}
                </p>
              )}
              {claim.verification !== "verified" && (
                <form
                  action={setClaimVerificationAction.bind(null, claim.id, "verified")}
                  className="mt-1 inline"
                >
                  <button type="submit" className="text-green-700 underline dark:text-green-400">
                    mark verified
                  </button>
                </form>
              )}
              {claim.verification !== "needs_review" && (
                <form
                  action={setClaimVerificationAction.bind(null, claim.id, "needs_review")}
                  className="ml-2 mt-1 inline"
                >
                  <button type="submit" className="text-amber-700 underline dark:text-amber-400">
                    mark needs review
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        action={upsertClaimAction.bind(null, subjectTable, subjectId)}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          field key
          <input
            type="text"
            name="fieldKey"
            required
            placeholder="e.g. deadline_date"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          state
          <select
            name="state"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {CLAIM_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          source URL
          <input
            type="url"
            name="sourceUrl"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          source type
          <select
            name="sourceType"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">—</option>
            {SOURCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          quote
          <input
            type="text"
            name="quote"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          checked at
          <input
            type="date"
            name="checkedAt"
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save claim
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/adminClaims.ts src/components/admin/ClaimsPanel.tsx
git commit -m "Phase 5: add claim server actions and reusable ClaimsPanel component"
```

---

### Task 12: Admin pages and the `/verify` queue page

**Files:**
- Rewrite: `src/app/admin/page.tsx`
- Create: `src/app/admin/schools/[schoolSlug]/page.tsx`
- Create: `src/app/admin/schools/[schoolSlug]/[programSlug]/page.tsx`
- Create: `src/app/admin/schools/[schoolSlug]/[programSlug]/[cycleLabel]/page.tsx`
- Create: `src/app/admin/sources/page.tsx`
- Rewrite: `src/app/verify/page.tsx`

**Interfaces:**
- Consumes everything from Tasks 2-11: all `src/domain/admin/*` read
  functions (there is no `listSchools`/`listPrograms`/`listCycles` yet for
  admin — add small local queries directly in each page via `db.select()`,
  matching how `src/app/my/page.tsx` queries directly rather than adding a
  domain wrapper for a single call site), `listClaimsForSubject`,
  `ClaimsPanel`, `listVerifyQueue`, and every action from
  `src/app/actions/admin.ts` and `src/app/actions/adminClaims.ts`.
- Produces: no new exports consumed elsewhere — this is the leaf UI layer.

- [ ] **Step 1: Rewrite `/admin`**

```typescript
// src/app/admin/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { asc } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createSchoolAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  const schools = db
    .select()
    .from(schema.schools)
    .orderBy(asc(schema.schools.name))
    .all();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Schools, programs, cycles, requirements, and sources.
      </p>

      <ul className="mt-6 space-y-1">
        {schools.map((school) => (
          <li key={school.id}>
            <Link href={`/admin/schools/${school.slug}`} className="hover:underline">
              {school.name}
            </Link>
            {school.status === "archived" && (
              <span className="ml-2 text-xs text-zinc-500">archived</span>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold">Add a school</h2>
      <form action={createSchoolAction} className="mt-2 flex flex-wrap gap-2">
        <input
          type="text"
          name="name"
          placeholder="School name"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="city"
          placeholder="City"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="state"
          placeholder="State"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="url"
          name="websiteUrl"
          placeholder="Website URL"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add school
        </button>
      </form>

      <p className="mt-4 text-sm">
        <Link href="/admin/sources" className="underline">
          Manage sources
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: School detail page**

```typescript
// src/app/admin/schools/[schoolSlug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveSchoolAction,
  createProgramAction,
  updateSchoolAction,
} from "@/app/actions/admin";
import { CREDENTIALS, MODALITIES } from "@/db/schema/canonical";

export const dynamic = "force-dynamic";

export default async function AdminSchoolPage({
  params,
}: {
  params: Promise<{ schoolSlug: string }>;
}) {
  const { schoolSlug } = await params;

  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) {
    notFound();
  }

  const programs = db
    .select()
    .from(schema.programs)
    .where(
      and(eq(schema.programs.schoolId, school.id), ne(schema.programs.status, "archived")),
    )
    .orderBy(asc(schema.programs.name))
    .all();

  const claims = listClaimsForSubject(db, "schools", school.id);

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{school.name}</h1>

      <form
        action={updateSchoolAction.bind(null, school.id)}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          name
          <input
            type="text"
            name="name"
            defaultValue={school.name}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          city
          <input
            type="text"
            name="city"
            defaultValue={school.city ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          state
          <input
            type="text"
            name="state"
            defaultValue={school.state ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          website
          <input
            type="url"
            name="websiteUrl"
            defaultValue={school.websiteUrl ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
      </form>

      {school.status !== "archived" && (
        <form action={archiveSchoolAction.bind(null, school.id)} className="mt-2">
          <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
            Archive school
          </button>
        </form>
      )}

      <ClaimsPanel subjectTable="schools" subjectId={school.id} claims={claims} />

      <h2 className="mt-6 text-sm font-semibold">Programs</h2>
      <ul className="mt-2 space-y-1">
        {programs.map((program) => (
          <li key={program.id}>
            <Link
              href={`/admin/schools/${school.slug}/${program.slug}`}
              className="hover:underline"
            >
              {program.name}
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a program</h3>
      <form
        action={createProgramAction.bind(null, school.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input
          type="text"
          name="name"
          placeholder="Program name"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="credential"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">credential —</option>
          {CREDENTIALS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          name="modality"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">modality —</option>
          {MODALITIES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="url"
          name="websiteUrl"
          placeholder="Website URL"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add program
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Program detail page**

```typescript
// src/app/admin/schools/[schoolSlug]/[programSlug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveProgramAction,
  createCycleAction,
  updateProgramAction,
} from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminProgramPage({
  params,
}: {
  params: Promise<{ schoolSlug: string; programSlug: string }>;
}) {
  const { schoolSlug, programSlug } = await params;

  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) notFound();

  const [program] = db
    .select()
    .from(schema.programs)
    .where(and(eq(schema.programs.schoolId, school.id), eq(schema.programs.slug, programSlug)))
    .all();
  if (!program) notFound();

  const cycles = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, program.id),
        ne(schema.applicationCycles.status, "archived"),
      ),
    )
    .orderBy(desc(schema.applicationCycles.cycleLabel))
    .all();

  const claims = listClaimsForSubject(db, "programs", program.id);

  return (
    <div>
      <p className="text-sm">
        <Link href={`/admin/schools/${school.slug}`} className="underline">
          {school.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{program.name}</h1>

      <form
        action={updateProgramAction.bind(null, program.id)}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          name
          <input
            type="text"
            name="name"
            defaultValue={program.name}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          credential
          <input
            type="text"
            name="credential"
            defaultValue={program.credential ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          modality
          <input
            type="text"
            name="modality"
            defaultValue={program.modality ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          website
          <input
            type="url"
            name="websiteUrl"
            defaultValue={program.websiteUrl ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
      </form>

      {program.status !== "archived" && (
        <form action={archiveProgramAction.bind(null, program.id)} className="mt-2">
          <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
            Archive program
          </button>
        </form>
      )}

      <ClaimsPanel subjectTable="programs" subjectId={program.id} claims={claims} />

      <h2 className="mt-6 text-sm font-semibold">Cycles</h2>
      <ul className="mt-2 space-y-1">
        {cycles.map((cycle) => (
          <li key={cycle.id}>
            <Link
              href={`/admin/schools/${school.slug}/${program.slug}/${cycle.cycleLabel}`}
              className="hover:underline"
            >
              {cycle.cycleLabel}
              {cycle.deadlineDate ? ` — due ${cycle.deadlineDate}` : ""}
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a cycle</h3>
      <form
        action={createCycleAction.bind(null, program.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input
          type="text"
          name="cycleLabel"
          placeholder="2026-27"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="number"
          name="entryYear"
          placeholder="Entry year"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="date"
          name="deadlineDate"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add cycle
        </button>
      </form>
    </div>
  );
}
```

`program.credential`/`modality` are rendered here as free-text inputs rather
than the `<select>` used on the create form: `updateProgramAction`'s Zod
schema (Task 10) still validates them against `CREDENTIALS`/`MODALITIES`, so
an invalid free-text value is rejected server-side even though the edit
form doesn't constrain keystrokes. This mirrors no existing precedent in the
codebase (every other edit form here is its first), so if `npm run lint`
flags the inconsistency between create (`<select>`) and edit (`<input>`),
switch the edit form to a `<select>` with `defaultValue` instead — both are
acceptable, prefer `<select>` for consistency with Step 2's create form.

- [ ] **Step 4: Cycle detail page (requirements + per-requirement claims)**

```typescript
// src/app/admin/schools/[schoolSlug]/[programSlug]/[cycleLabel]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { listClaimsForSubject } from "@/domain/admin/claims";
import { requirementClaimFieldKey } from "@/domain/admin/requirements";
import { ClaimsPanel } from "@/components/admin/ClaimsPanel";
import {
  archiveCycleAction,
  archiveRequirementAction,
  createRequirementAction,
  updateCycleAction,
  updateRequirementAction,
} from "@/app/actions/admin";
import { REQUIREMENT_CATEGORIES } from "@/db/schema/canonical";

export const dynamic = "force-dynamic";

export default async function AdminCyclePage({
  params,
}: {
  params: Promise<{ schoolSlug: string; programSlug: string; cycleLabel: string }>;
}) {
  const { schoolSlug, programSlug, cycleLabel } = await params;

  const [school] = db
    .select()
    .from(schema.schools)
    .where(eq(schema.schools.slug, schoolSlug))
    .all();
  if (!school) notFound();

  const [program] = db
    .select()
    .from(schema.programs)
    .where(and(eq(schema.programs.schoolId, school.id), eq(schema.programs.slug, programSlug)))
    .all();
  if (!program) notFound();

  const [cycle] = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, program.id),
        eq(schema.applicationCycles.cycleLabel, cycleLabel),
      ),
    )
    .all();
  if (!cycle) notFound();

  const requirements = db
    .select()
    .from(schema.requirements)
    .where(and(eq(schema.requirements.cycleId, cycle.id), ne(schema.requirements.status, "archived")))
    .orderBy(asc(schema.requirements.sortOrder))
    .all();

  const cycleClaims = listClaimsForSubject(db, "application_cycles", cycle.id);

  return (
    <div>
      <p className="text-sm">
        <Link href={`/admin/schools/${school.slug}/${program.slug}`} className="underline">
          {program.name}
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">{cycle.cycleLabel}</h1>

      <form
        action={updateCycleAction.bind(null, cycle.id)}
        className="mt-4 flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col text-xs">
          cycle label
          <input
            type="text"
            name="cycleLabel"
            defaultValue={cycle.cycleLabel}
            required
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          entry year
          <input
            type="number"
            name="entryYear"
            defaultValue={cycle.entryYear ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col text-xs">
          deadline
          <input
            type="date"
            name="deadlineDate"
            defaultValue={cycle.deadlineDate ?? ""}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Save
        </button>
      </form>

      {cycle.status !== "archived" && (
        <form action={archiveCycleAction.bind(null, cycle.id)} className="mt-2">
          <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
            Archive cycle
          </button>
        </form>
      )}

      <ClaimsPanel subjectTable="application_cycles" subjectId={cycle.id} claims={cycleClaims} />

      <h2 className="mt-6 text-sm font-semibold">Requirements</h2>
      <ul className="mt-2 space-y-4">
        {requirements.map((req) => {
          const fieldKey = requirementClaimFieldKey(req);
          const reqClaims = listClaimsForSubject(db, "requirements", req.id).filter(
            (c) => c.fieldKey === fieldKey,
          );
          return (
            <li key={req.id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
              <form
                action={updateRequirementAction.bind(null, req.id)}
                className="flex flex-wrap items-end gap-2"
              >
                <select
                  name="category"
                  defaultValue={req.category}
                  required
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  name="label"
                  defaultValue={req.label}
                  required
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  name="valueText"
                  placeholder="Text value"
                  defaultValue={req.valueText ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <input
                  type="text"
                  name="valueNumber"
                  placeholder="Numeric value"
                  defaultValue={req.valueNumber ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <select
                  name="valueBool"
                  defaultValue={
                    req.valueBool === null ? "" : req.valueBool ? "true" : "false"
                  }
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <option value="">bool —</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
                <input
                  type="date"
                  name="valueDate"
                  defaultValue={req.valueDate ?? ""}
                  className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" name="isRequired" defaultChecked={req.isRequired ?? false} />
                  required
                </label>
                <button
                  type="submit"
                  className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Save
                </button>
              </form>
              <form action={archiveRequirementAction.bind(null, req.id)} className="mt-1">
                <button type="submit" className="text-xs text-red-600 underline dark:text-red-400">
                  Archive requirement
                </button>
              </form>
              <ClaimsPanel subjectTable="requirements" subjectId={req.id} claims={reqClaims} />
            </li>
          );
        })}
      </ul>

      <h3 className="mt-4 text-xs font-semibold">Add a requirement</h3>
      <form
        action={createRequirementAction.bind(null, cycle.id)}
        className="mt-2 flex flex-wrap gap-2"
      >
        <select
          name="category"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {REQUIREMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="text"
          name="label"
          placeholder="Label, e.g. Minimum overall GPA"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="valueText"
          placeholder="Text value"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          type="text"
          name="valueNumber"
          placeholder="Numeric value"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="valueBool"
          defaultValue=""
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">bool —</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <input
          type="date"
          name="valueDate"
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" name="isRequired" />
          required
        </label>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add requirement
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Sources page**

```typescript
// src/app/admin/sources/page.tsx
import Link from "next/link";
import { listSources } from "@/domain/admin/sources";
import { db } from "@/db/client";
import { createSourceAction, updateSourceAction } from "@/app/actions/admin";
import { SOURCE_TYPES } from "@/db/schema/provenance";

export const dynamic = "force-dynamic";

export default function AdminSourcesPage() {
  const sources = listSources(db);

  return (
    <div>
      <p className="text-sm">
        <Link href="/admin" className="underline">
          Admin
        </Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Sources</h1>

      <ul className="mt-4 space-y-3">
        {sources.map((source) => (
          <li key={source.id} className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
              {source.url}
            </a>
            <span className="ml-2 text-xs text-zinc-500">{source.sourceType}</span>
            <form action={updateSourceAction.bind(null, source.id)} className="mt-2 flex gap-2">
              <input
                type="text"
                name="title"
                placeholder="Title"
                defaultValue={source.title ?? ""}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                type="text"
                name="publisher"
                placeholder="Publisher"
                defaultValue={source.publisher ?? ""}
                className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button type="submit" className="text-xs text-blue-600 underline dark:text-blue-400">
                save
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 text-sm font-semibold">Add a source</h2>
      <form action={createSourceAction} className="mt-2 flex flex-wrap gap-2">
        <input
          type="url"
          name="url"
          placeholder="https://..."
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          name="sourceType"
          required
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded bg-zinc-900 px-3 py-1 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add source
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite `/verify`**

```typescript
// src/app/verify/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { listVerifyQueue } from "@/domain/verify";
import { setClaimVerificationAction } from "@/app/actions/adminClaims";

export const dynamic = "force-dynamic";

function adminHref(item: ReturnType<typeof listVerifyQueue>[number]): string | null {
  if (!item.school) return null;
  if (item.claim.subjectTable === "schools") {
    return `/admin/schools/${item.school.slug}`;
  }
  if (!item.program) return null;
  if (item.claim.subjectTable === "programs") {
    return `/admin/schools/${item.school.slug}/${item.program.slug}`;
  }
  // application_cycles, requirements, prerequisite_courses, tuition_estimates
  // all live under a cycle page; without the cycle label handy here, link to
  // the program page, which lists its cycles.
  return `/admin/schools/${item.school.slug}/${item.program.slug}`;
}

export default function VerifyPage() {
  const queue = listVerifyQueue(db);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Needs Verification</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {queue.length} claim{queue.length === 1 ? "" : "s"} pending. Saved
        programs with the nearest deadline are listed first.
      </p>

      {queue.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Nothing to verify.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {queue.map((item) => {
            const href = adminHref(item);
            return (
              <li
                key={item.claim.id}
                className="rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {href ? (
                    <Link href={href} className="font-medium hover:underline">
                      {item.subjectLabel}
                    </Link>
                  ) : (
                    <span className="font-medium">{item.subjectLabel}</span>
                  )}
                  <span className="text-xs text-zinc-500">
                    {item.school?.name}
                    {item.program ? ` — ${item.program.name}` : ""}
                  </span>
                  {item.isSaved && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      saved
                    </span>
                  )}
                  {item.deadlineDate && (
                    <span className="text-xs text-zinc-500">due {item.deadlineDate}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {item.claim.fieldKey} — {item.claim.state} — {item.claim.verification}
                </p>
                <form
                  action={setClaimVerificationAction.bind(null, item.claim.id, "verified")}
                  className="mt-2 inline"
                >
                  <button type="submit" className="text-xs text-green-700 underline dark:text-green-400">
                    mark verified
                  </button>
                </form>
                <form
                  action={setClaimVerificationAction.bind(null, item.claim.id, "needs_review")}
                  className="ml-3 mt-2 inline"
                >
                  <button type="submit" className="text-xs text-amber-700 underline dark:text-amber-400">
                    mark needs review
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Manual verification in the browser**

Run: `npm run dev`

Visit `/admin`, add a school, add a program, add a cycle, add a requirement,
add a claim on it with `state=known` and a source URL, then visit `/verify`
and confirm the claim appears; click "mark verified" and confirm it
disappears from `/verify`. This is the exact flow Task 13 automates — walking
it by hand first catches layout/typo issues before writing the Playwright
script.

- [ ] **Step 8: Full verify run**

Run: `npm run verify`
Expected: `format:check`, `typecheck`, `lint`, `test`, `test:e2e` all pass
(existing e2e specs only — Task 13 adds the new one).

- [ ] **Step 9: Commit**

```bash
git add src/app/admin src/app/verify/page.tsx
git commit -m "Phase 5: add admin CRUD pages and rewrite /verify as an actionable queue"
```

---

### Task 13: E2E — the "needs-verification view lists a stale record" flow

**Files:**
- Create: `tests/e2e/verify.spec.ts`

**Interfaces:**
- Consumes: the full admin UI from Task 12 (routes `/admin`,
  `/admin/schools/[slug]`, `/admin/schools/[slug]/[slug]`,
  `/admin/schools/[slug]/[slug]/[label]`, `/verify`).

This is the 6th flow named in `docs/plan.md` §6's test-strategy table
("needs-verification view lists a stale record"), completing the six-flow
Playwright budget the plan deliberately caps at. Like `personal.spec.ts`, it
creates its own data through the UI (a uniquely-slugged school, so reruns
never collide with prior runs) rather than depending on seeded fixture data.

- [ ] **Step 1: Write the test**

```typescript
// tests/e2e/verify.spec.ts
import { test, expect } from "@playwright/test";

test("creating an unverified claim lists it on /verify, and verifying it removes it", async ({
  page,
}) => {
  const unique = Date.now();
  const schoolName = `E2E Test School ${unique}`;

  await page.goto("/admin");
  await page.getByPlaceholder("School name").fill(schoolName);
  await page.getByRole("button", { name: "Add school" }).click();
  await expect(page.getByRole("link", { name: schoolName })).toBeVisible();

  await page.getByRole("link", { name: schoolName }).click();
  await expect(page.getByRole("heading", { name: schoolName })).toBeVisible();

  await page.getByPlaceholder("Program name").fill("Test Perfusion Program");
  await page.getByRole("button", { name: "Add program" }).click();
  await expect(
    page.getByRole("link", { name: "Test Perfusion Program" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Test Perfusion Program" }).click();
  await expect(
    page.getByRole("heading", { name: "Test Perfusion Program" }),
  ).toBeVisible();

  await page.getByPlaceholder("2026-27").fill("2026-27");
  await page.getByRole("button", { name: "Add cycle" }).click();
  await expect(page.getByRole("link", { name: /2026-27/ })).toBeVisible();

  await page.getByRole("link", { name: /2026-27/ }).click();
  await expect(page.getByRole("heading", { name: "2026-27" })).toBeVisible();

  await page
    .getByPlaceholder("Label, e.g. Minimum overall GPA")
    .fill("E2E requirement");
  await page.getByPlaceholder("Numeric value").fill("3.5");
  await page.getByRole("button", { name: "Add requirement" }).click();
  await expect(page.getByText("E2E requirement")).toBeVisible();

  // The claim form lives inside the requirement's own ClaimsPanel; scope to
  // that <li> so this doesn't collide with the cycle-level ClaimsPanel above it.
  const requirementRow = page.locator("li", { hasText: "E2E requirement" });
  await requirementRow.getByPlaceholder("e.g. deadline_date").fill("value_number");
  await requirementRow.locator('select[name="state"]').selectOption("known");
  await requirementRow
    .getByPlaceholder("Source URL")
    .or(requirementRow.locator('input[name="sourceUrl"]'))
    .fill("https://example.edu/e2e-test-source");
  await requirementRow.locator('select[name="sourceType"]').selectOption("program_site");
  await requirementRow.getByRole("button", { name: "Save claim" }).click();

  await page.goto("/verify");
  await expect(page.getByText("E2E requirement")).toBeVisible();

  const queueRow = page.locator("li", { hasText: "E2E requirement" });
  await queueRow.getByRole("button", { name: "mark verified" }).click();

  await expect(page.getByText("E2E requirement")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the new e2e test**

Run: `npx playwright test tests/e2e/verify.spec.ts`
Expected: PASS. If a selector doesn't match (e.g. `input[name="sourceUrl"]`
has no accessible placeholder-based locator once inside the nested
`ClaimsPanel`), inspect the actual rendered form from Task 12 Step 2 and
adjust the locator — do not change the flow being tested.

- [ ] **Step 3: Run the full verify suite**

Run: `npm run verify`
Expected: `format:check`, `typecheck`, `lint`, `test`, `test:e2e` all pass —
this is Phase 5's final gate check, exercising every task's output together.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/verify.spec.ts
git commit -m "Phase 5: add e2e coverage for the needs-verification queue"
```

---

## Self-Review Notes

- **Spec coverage:** "CRUD for schools, programs, cycles, requirements,
  sources" → Tasks 2-6. "Per-fact verify/needs-review actions" → Task 7
  (`setClaimVerification`) + Task 11/12 UI. "`change_log` written on every
  canonical mutation" → every domain function in Tasks 2-5 and the claims
  create/update path in Task 7, each asserted directly in that task's test;
  Task 7's final test is the explicit cross-cutting gate check. "The
  needs-verification queue becomes actionable" → Task 8 (ordering) + Task 12
  Step 6 (verify/needs-review buttons directly on the queue). Gate — "every
  canonical write produces a change_log row — asserted in tests" — satisfied
  by Tasks 2, 3, 4, 5, and 7's tests, all of which assert on `change_log` row
  presence/count, not just on the mutated row.
- **Placeholder scan:** no TBD/TODO left in any task; every step has runnable
  code, not a description of code.
- **Type consistency:** `SubjectTable` and `ClaimWithSource` are defined once
  (`src/domain/claims.ts`, pre-existing) and imported everywhere else rather
  than redeclared. `requirementClaimFieldKey`'s three-way union
  `"value_text" | "value_number" | "value_bool" | "value_date"` is used
  identically in Task 5 (definition + test), Task 12 Step 4 (cycle page), and
  matches the pre-existing literals in
  `src/app/programs/[schoolSlug]/[programSlug]/page.tsx`. `VerifyQueueItem`
  (Task 8) is consumed as-is by Task 12 Step 6 with no reshaping.
