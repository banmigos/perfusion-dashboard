# Phase 4 Personal Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the personal layer from `docs/plan.md` Phase 4 — save a
program, generate a checklist from its current cycle's requirements, manage
private tasks (status, due date, link, manual add/delete), edit
priority/notes on a saved program, and a dashboard that surfaces open tasks
across all saved programs.

**Architecture:** Two new `src/domain/**` modules (`saved.ts`,
`checklists.ts`) provide the first write path in the codebase, following the
same synchronous, `db`-first-parameter convention as Phase 3's
`src/domain/programs.ts`. Mutations are exposed as Next.js Server Actions in
`src/app/actions/**`, called from small Client Components
(`SaveProgramControl`, `ChecklistItemRow`, `AddChecklistItemForm`) via
`startTransition` or the documented `.bind(null, id)` form-action pattern.
Three pages get real content: the program detail page (save + priority/note
+ generate checklist), `/my` (saved programs and their checklists), and `/`
(dashboard: open tasks sorted by due date).

**Tech Stack:** Next.js 16 App Router (Server Actions, `"use server"`,
`revalidatePath`), Drizzle ORM + better-sqlite3 (synchronous driver), Zod,
Tailwind CSS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-phase4-personal-layer-design.md`
— read it before starting. Two corrections discovered during planning, both
called out where they matter below:

1. **No seed step is needed.** `drizzle/0000_init.sql` already ends with
   `INSERT INTO users (name, created_at) VALUES ('Owner', unixepoch() * 1000);`
   — a single `users` row already exists at id `1` after migration. Task 1
   only needs to define the `CURRENT_USER_ID` constant and add a regression
   test confirming that row exists; there is no seed script to write.
2. **All domain-function tests are integration tests, not unit tests**,
   same as Phase 3's `domain-programs.test.ts`/`domain-claims.test.ts`.
   Every function in `saved.ts`/`checklists.ts` takes a live `db` handle —
   there is no pure logic to isolate the way `factState`/`freshness`
   allowed in Phase 3. The spec's "Unit (Vitest)" bullets for
   `generateChecklist`'s mapping and `listDueItems`'s ordering are
   implemented as integration tests instead.

## Global Constraints

- `src/domain/**` files start with `import "server-only";` (`plan.md` §2).
  `src/domain/user.ts` follows this too even though it has no DB access, for
  consistency with every other file in that directory.
- Domain functions are synchronous and take `db: BetterSQLite3Database<typeof schema>`
  as an explicit first parameter — matches `getProgramDetail(db, ...)` and
  `runLegacyImport(db, ...)`.
- `CURRENT_USER_ID = 1` is a constant, not a query — see correction 1 above.
  No auth, no session (`CLAUDE.md`: "No app-level authentication").
- "Current cycle" for a program = the non-archived `applicationCycles` row
  with the highest `cycleLabel` for that program (matches the ordering
  Phase 3's `getProgramDetail` already uses).
- `checklist_items.due_at` and `personal_checklists`/`saved_programs`
  timestamp columns are `integer({mode:"timestamp_ms"})` in the existing,
  already-migrated schema (`src/db/schema/personal.ts`) — this plan writes
  `Date` objects to them, not `YYYY-MM-DD` strings. This is a pre-existing
  schema decision from Phase 2, not something this plan revisits.
- `generateChecklist` is idempotent per `(savedProgramId, cycleId)` — a
  second call returns the existing checklist unchanged, never a duplicate.
- Server Actions validate all form input with Zod even though it's
  same-origin (`CLAUDE.md`: "Zod validates all external input").
- `npm run verify` = `format:check && typecheck && lint && test && test:e2e`
  must pass at the end.

---

## File Structure

```
src/domain/user.ts                                     CREATE — CURRENT_USER_ID
tests/integration/domain-user.test.ts                    CREATE
src/domain/saved.ts                                     CREATE
tests/integration/domain-saved.test.ts                   CREATE
src/domain/checklists.ts                                CREATE
tests/integration/domain-checklists.test.ts               CREATE
src/app/actions/saved.ts                                CREATE — Server Actions
src/app/actions/checklists.ts                            CREATE — Server Actions
src/components/SaveProgramControl.tsx                     CREATE
src/app/programs/[schoolSlug]/[programSlug]/page.tsx     MODIFY — wire SaveProgramControl
src/components/ChecklistItemRow.tsx                       CREATE
src/components/AddChecklistItemForm.tsx                   CREATE
src/app/my/page.tsx                                      MODIFY — replaces Phase 1 placeholder
src/app/page.tsx                                         MODIFY — replaces Phase 1 placeholder dashboard
tests/e2e/personal.spec.ts                                CREATE
```

---

### Task 1: `CURRENT_USER_ID` and the seeded owner row

**Files:**
- Create: `src/domain/user.ts`
- Test: `tests/integration/domain-user.test.ts`

**Interfaces:**
- Produces: `CURRENT_USER_ID: number`, exported from `@/domain/user`. Every
  function in Task 2 and Task 3 that touches `saved_programs` or
  `personal_checklists` imports this constant.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/domain-user.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { CURRENT_USER_ID } from "@/domain/user";
import * as schema from "@/db/schema";

describe("CURRENT_USER_ID", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("resolves to a users row seeded by the init migration", () => {
    const [owner] = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, CURRENT_USER_ID))
      .all();

    expect(owner).toBeDefined();
    expect(owner!.name).toBe("Owner");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- domain-user`
Expected: FAIL — `Cannot find module '@/domain/user'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/user.ts
import "server-only";

export const CURRENT_USER_ID = 1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- domain-user`
Expected: PASS — confirms `createTestDb()` (which runs real migrations, per
`tests/integration/helpers/db.ts`) already produces a `users` row at id `1`
because `runMigrations` applies `drizzle/0000_init.sql` in full, including
its trailing `INSERT`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/user.ts tests/integration/domain-user.test.ts
git commit -m "Phase 4: add CURRENT_USER_ID and confirm seeded owner row"
```

---

### Task 2: `src/domain/saved.ts` — save/unsave/list

**Files:**
- Create: `src/domain/saved.ts`
- Test: `tests/integration/domain-saved.test.ts`

**Interfaces:**
- Consumes: `CURRENT_USER_ID` from `@/domain/user` (Task 1);
  `seedFixtureSchool` from `tests/fixtures/school.ts`.
- Produces: `Priority` type; `saveProgram(db, programId): typeof schema.savedPrograms.$inferSelect`;
  `unsaveProgram(db, programId): void`;
  `updateSavedProgram(db, savedProgramId, patch: { priority?: Priority | null; personalNote?: string | null }): void`;
  `getSavedProgram(db, programId): typeof schema.savedPrograms.$inferSelect | null`;
  `SavedProgramListItem` type; `listSavedPrograms(db): SavedProgramListItem[]` —
  all exported from `@/domain/saved`. Task 3's `generateChecklist` consumes
  `saved_programs` rows (via `savedProgramId`, not through this module
  directly). Task 5's Server Actions call every function here. Task 9's
  `/my` page calls `listSavedPrograms`. Task 7's detail page calls
  `getSavedProgram`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/domain-saved.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import {
  getSavedProgram,
  listSavedPrograms,
  saveProgram,
  unsaveProgram,
  updateSavedProgram,
} from "@/domain/saved";
import * as schema from "@/db/schema";

describe("saved programs", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("saveProgram creates a saved_programs row", async () => {
    const fixture = await seedFixtureSchool(db);

    const saved = saveProgram(db, fixture.program.id);

    expect(saved.programId).toBe(fixture.program.id);
    expect(getSavedProgram(db, fixture.program.id)?.id).toBe(saved.id);
  });

  it("saveProgram is idempotent — saving twice yields one row", async () => {
    const fixture = await seedFixtureSchool(db);

    const first = saveProgram(db, fixture.program.id);
    const second = saveProgram(db, fixture.program.id);

    expect(second.id).toBe(first.id);
    expect(db.select().from(schema.savedPrograms).all()).toHaveLength(1);
  });

  it("unsaveProgram deletes the row", async () => {
    const fixture = await seedFixtureSchool(db);
    saveProgram(db, fixture.program.id);

    unsaveProgram(db, fixture.program.id);

    expect(getSavedProgram(db, fixture.program.id)).toBeNull();
  });

  it("updateSavedProgram sets priority and personalNote", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);

    updateSavedProgram(db, saved.id, {
      priority: "target",
      personalNote: "great fit",
    });

    const [row] = db
      .select()
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.id, saved.id))
      .all();
    expect(row?.priority).toBe("target");
    expect(row?.personalNote).toBe("great fit");
  });

  it("listSavedPrograms joins school and program", async () => {
    const fixture = await seedFixtureSchool(db);
    saveProgram(db, fixture.program.id);

    const items = listSavedPrograms(db);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      school: { slug: "duke-university" },
      program: { slug: "perfusion-ms" },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- domain-saved`
Expected: FAIL — `Cannot find module '@/domain/saved'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/saved.ts
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CURRENT_USER_ID } from "./user";

export type Priority = (typeof schema.PRIORITIES)[number];

export function saveProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): typeof schema.savedPrograms.$inferSelect {
  db.insert(schema.savedPrograms)
    .values({ userId: CURRENT_USER_ID, programId })
    .onConflictDoNothing()
    .run();

  const [row] = db
    .select()
    .from(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .all();
  return row!;
}

export function unsaveProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): void {
  db.delete(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .run();
}

export function updateSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
  patch: { priority?: Priority | null; personalNote?: string | null },
): void {
  db.update(schema.savedPrograms)
    .set(patch)
    .where(eq(schema.savedPrograms.id, savedProgramId))
    .run();
}

export function getSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  programId: number,
): typeof schema.savedPrograms.$inferSelect | null {
  const [row] = db
    .select()
    .from(schema.savedPrograms)
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        eq(schema.savedPrograms.programId, programId),
      ),
    )
    .all();
  return row ?? null;
}

export type SavedProgramListItem = {
  savedProgram: typeof schema.savedPrograms.$inferSelect;
  school: Pick<
    typeof schema.schools.$inferSelect,
    "slug" | "name" | "city" | "state"
  >;
  program: Pick<
    typeof schema.programs.$inferSelect,
    "id" | "slug" | "name" | "credential"
  >;
};

export function listSavedPrograms(
  db: BetterSQLite3Database<typeof schema>,
): SavedProgramListItem[] {
  return db
    .select({
      savedProgram: schema.savedPrograms,
      school: {
        slug: schema.schools.slug,
        name: schema.schools.name,
        city: schema.schools.city,
        state: schema.schools.state,
      },
      program: {
        id: schema.programs.id,
        slug: schema.programs.slug,
        name: schema.programs.name,
        credential: schema.programs.credential,
      },
    })
    .from(schema.savedPrograms)
    .innerJoin(
      schema.programs,
      eq(schema.savedPrograms.programId, schema.programs.id),
    )
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(eq(schema.savedPrograms.userId, CURRENT_USER_ID))
    .orderBy(desc(schema.savedPrograms.addedAt))
    .all();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- domain-saved`
Expected: PASS, all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/domain/saved.ts tests/integration/domain-saved.test.ts
git commit -m "Phase 4: add save/unsave/list domain functions"
```

---

### Task 3: `src/domain/checklists.ts` — `generateChecklist`

**Files:**
- Create: `src/domain/checklists.ts`
- Test: `tests/integration/domain-checklists.test.ts` (started here, extended in Task 4)

**Interfaces:**
- Consumes: `CURRENT_USER_ID` from `@/domain/user` (Task 1); `saveProgram`
  from `@/domain/saved` (Task 2, used only in tests).
- Produces: `generateChecklist(db, savedProgramId: number): typeof schema.personalChecklists.$inferSelect`,
  exported from `@/domain/checklists`. Task 5's `generateChecklistAction`
  and Task 9's `/my` page both call it.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/domain-checklists.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { saveProgram } from "@/domain/saved";
import { generateChecklist } from "@/domain/checklists";
import * as schema from "@/db/schema";

describe("generateChecklist", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("creates a checklist with one item per non-archived requirement in the current cycle", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);

    const checklist = generateChecklist(db, saved.id);

    expect(checklist.cycleId).toBe(fixture.cycle.id);
    const items = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.checklistId, checklist.id))
      .all();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: fixture.requirement.label,
      category: "gpa",
      derivedFromRequirementId: fixture.requirement.id,
    });
  });

  it("picks the cycle with the highest cycleLabel as current", async () => {
    const fixture = await seedFixtureSchool(db);
    const [newerCycle] = await db
      .insert(schema.applicationCycles)
      .values({
        programId: fixture.program.id,
        cycleLabel: "2027-28",
        entryYear: 2028,
      })
      .returning();
    const saved = saveProgram(db, fixture.program.id);

    const checklist = generateChecklist(db, saved.id);

    expect(checklist.cycleId).toBe(newerCycle!.id);
  });

  it("is idempotent per (savedProgramId, cycleId)", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);

    const first = generateChecklist(db, saved.id);
    const second = generateChecklist(db, saved.id);

    expect(second.id).toBe(first.id);
    expect(db.select().from(schema.personalChecklists).all()).toHaveLength(1);
  });

  it("excludes archived requirements", async () => {
    const fixture = await seedFixtureSchool(db);
    await db
      .update(schema.requirements)
      .set({ status: "archived" })
      .where(eq(schema.requirements.id, fixture.requirement.id));
    const saved = saveProgram(db, fixture.program.id);

    const checklist = generateChecklist(db, saved.id);

    const items = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.checklistId, checklist.id))
      .all();
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- domain-checklists`
Expected: FAIL — `Cannot find module '@/domain/checklists'`

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/checklists.ts
import "server-only";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";
import { CURRENT_USER_ID } from "./user";

export function generateChecklist(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
): typeof schema.personalChecklists.$inferSelect {
  const [savedProgram] = db
    .select()
    .from(schema.savedPrograms)
    .where(eq(schema.savedPrograms.id, savedProgramId))
    .all();
  if (!savedProgram) {
    throw new Error(`saved_programs row ${savedProgramId} not found`);
  }

  const [currentCycle] = db
    .select()
    .from(schema.applicationCycles)
    .where(
      and(
        eq(schema.applicationCycles.programId, savedProgram.programId),
        ne(schema.applicationCycles.status, "archived"),
      ),
    )
    .orderBy(desc(schema.applicationCycles.cycleLabel))
    .limit(1)
    .all();
  if (!currentCycle) {
    throw new Error(
      `program ${savedProgram.programId} has no non-archived application cycle`,
    );
  }

  const [existing] = db
    .select()
    .from(schema.personalChecklists)
    .where(
      and(
        eq(schema.personalChecklists.savedProgramId, savedProgramId),
        eq(schema.personalChecklists.cycleId, currentCycle.id),
      ),
    )
    .all();
  if (existing) {
    return existing;
  }

  const [program] = db
    .select()
    .from(schema.programs)
    .where(eq(schema.programs.id, savedProgram.programId))
    .all();

  const requirementRows = db
    .select()
    .from(schema.requirements)
    .where(
      and(
        eq(schema.requirements.cycleId, currentCycle.id),
        ne(schema.requirements.status, "archived"),
      ),
    )
    .orderBy(asc(schema.requirements.sortOrder))
    .all();

  return db.transaction((tx) => {
    const [checklist] = tx
      .insert(schema.personalChecklists)
      .values({
        userId: CURRENT_USER_ID,
        savedProgramId,
        cycleId: currentCycle.id,
        title: `${program!.name} — ${currentCycle.cycleLabel}`,
      })
      .returning()
      .all();

    if (requirementRows.length > 0) {
      tx.insert(schema.checklistItems)
        .values(
          requirementRows.map((req, index) => ({
            checklistId: checklist!.id,
            title: req.label,
            category: req.category,
            derivedFromRequirementId: req.id,
            sortOrder: index,
          })),
        )
        .run();
    }

    return checklist!;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- domain-checklists`
Expected: PASS, all 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/domain/checklists.ts tests/integration/domain-checklists.test.ts
git commit -m "Phase 4: add generateChecklist with current-cycle resolution"
```

---

### Task 4: `src/domain/checklists.ts` — item CRUD, `listChecklistsForSavedProgram`, `listDueItems`

**Files:**
- Modify: `src/domain/checklists.ts`
- Modify: `tests/integration/domain-checklists.test.ts`

**Interfaces:**
- Consumes: everything from Task 3 in the same file; `saveProgram` from
  `@/domain/saved` (Task 2, tests only).
- Produces (appended to `@/domain/checklists`):
  `ChecklistItemStatus` type;
  `addChecklistItem(db, checklistId, input: { title: string; detail?: string | null; dueAt?: Date | null; linkUrl?: string | null }): typeof schema.checklistItems.$inferSelect`;
  `updateChecklistItem(db, itemId, patch: { title?: string; detail?: string | null; dueAt?: Date | null; linkUrl?: string | null; status?: ChecklistItemStatus }): void`;
  `deleteChecklistItem(db, itemId): void`;
  `ChecklistWithItems` type; `listChecklistsForSavedProgram(db, savedProgramId): ChecklistWithItems[]`;
  `DueItem` type; `listDueItems(db): DueItem[]`.
  Task 6's Server Actions call all five mutation/query functions. Task 8's
  `ChecklistItemRow` renders a `DueItem["item"]` / `ChecklistWithItems["items"][number]`
  (same underlying `checklistItems.$inferSelect` shape). Task 9's `/my`
  page calls `listChecklistsForSavedProgram`. Task 10's dashboard calls
  `listDueItems`.

- [ ] **Step 1: Append the failing tests**

Add to `tests/integration/domain-checklists.test.ts`. Change the import
line to also pull in the new functions:
`import { addChecklistItem, deleteChecklistItem, generateChecklist, listChecklistsForSavedProgram, listDueItems, updateChecklistItem } from "@/domain/checklists";`
— then append below the existing `describe("generateChecklist", ...)` block:

```ts
describe("checklist item CRUD", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("addChecklistItem appends after existing items with derivedFromRequirementId null", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    generateChecklist(db, saved.id); // one item at sortOrder 0
    const [checklist] = db.select().from(schema.personalChecklists).all();

    const item = addChecklistItem(db, checklist!.id, {
      title: "Schedule shadowing",
      detail: null,
      dueAt: null,
      linkUrl: null,
    });

    expect(item.sortOrder).toBe(1);
    expect(item.derivedFromRequirementId).toBeNull();
  });

  it("updateChecklistItem stamps completedAt on done, clears it otherwise", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    const checklist = generateChecklist(db, saved.id);
    const [item] = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.checklistId, checklist.id))
      .all();

    updateChecklistItem(db, item!.id, { status: "done" });
    let [row] = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.id, item!.id))
      .all();
    expect(row?.status).toBe("done");
    expect(row?.completedAt).not.toBeNull();

    updateChecklistItem(db, item!.id, { status: "todo" });
    [row] = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.id, item!.id))
      .all();
    expect(row?.completedAt).toBeNull();
  });

  it("deleteChecklistItem removes the row", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    const checklist = generateChecklist(db, saved.id);
    const [item] = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.checklistId, checklist.id))
      .all();

    deleteChecklistItem(db, item!.id);

    expect(
      db
        .select()
        .from(schema.checklistItems)
        .where(eq(schema.checklistItems.id, item!.id))
        .all(),
    ).toHaveLength(0);
  });

  it("listChecklistsForSavedProgram returns checklist+items grouped", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    generateChecklist(db, saved.id);

    const result = listChecklistsForSavedProgram(db, saved.id);

    expect(result).toHaveLength(1);
    expect(result[0]!.items).toHaveLength(1);
  });
});

describe("listDueItems", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("sorts overdue/soon-due ascending, undated items last, and excludes done/skipped", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    const checklist = generateChecklist(db, saved.id);
    const [generatedItem] = db
      .select()
      .from(schema.checklistItems)
      .where(eq(schema.checklistItems.checklistId, checklist.id))
      .all();

    updateChecklistItem(db, generatedItem!.id, {
      dueAt: new Date("2026-09-15T00:00:00Z"),
    });
    addChecklistItem(db, checklist.id, {
      title: "overdue task",
      detail: null,
      dueAt: new Date("2026-01-01T00:00:00Z"),
      linkUrl: null,
    });
    const [doneTask] = db
      .insert(schema.checklistItems)
      .values({
        checklistId: checklist.id,
        title: "already done",
        status: "done",
        sortOrder: 99,
      })
      .returning()
      .all();
    addChecklistItem(db, checklist.id, {
      title: "undated task",
      detail: null,
      dueAt: null,
      linkUrl: null,
    });

    const due = listDueItems(db);

    expect(due.map((d) => d.item.title)).toEqual([
      "overdue task",
      fixture.requirement.label,
      "undated task",
    ]);
    expect(due.some((d) => d.item.id === doneTask!.id)).toBe(false);
  });

  it("includes program and school labels", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    generateChecklist(db, saved.id);

    const [due] = listDueItems(db);

    expect(due!.school.name).toBe("Duke University");
    expect(due!.program.name).toBe("MS in Cardiovascular Perfusion");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- domain-checklists`
Expected: FAIL — new function names not exported.

- [ ] **Step 3: Append the implementation**

Append to `src/domain/checklists.ts`. Change the top `drizzle-orm` import
line to `import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";`.

```ts
export type ChecklistItemStatus = (typeof schema.CHECKLIST_ITEM_STATUSES)[number];

export function addChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  checklistId: number,
  input: {
    title: string;
    detail?: string | null;
    dueAt?: Date | null;
    linkUrl?: string | null;
  },
): typeof schema.checklistItems.$inferSelect {
  const [maxRow] = db
    .select({
      maxSort: sql<number | null>`max(${schema.checklistItems.sortOrder})`,
    })
    .from(schema.checklistItems)
    .where(eq(schema.checklistItems.checklistId, checklistId))
    .all();
  const sortOrder = (maxRow?.maxSort ?? -1) + 1;

  const [row] = db
    .insert(schema.checklistItems)
    .values({
      checklistId,
      title: input.title,
      detail: input.detail ?? null,
      dueAt: input.dueAt ?? null,
      linkUrl: input.linkUrl ?? null,
      sortOrder,
    })
    .returning()
    .all();
  return row!;
}

export function updateChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  itemId: number,
  patch: {
    title?: string;
    detail?: string | null;
    dueAt?: Date | null;
    linkUrl?: string | null;
    status?: ChecklistItemStatus;
  },
): void {
  const values: Partial<typeof schema.checklistItems.$inferInsert> = {
    ...patch,
  };
  if (patch.status !== undefined) {
    values.completedAt = patch.status === "done" ? new Date() : null;
  }
  db.update(schema.checklistItems)
    .set(values)
    .where(eq(schema.checklistItems.id, itemId))
    .run();
}

export function deleteChecklistItem(
  db: BetterSQLite3Database<typeof schema>,
  itemId: number,
): void {
  db.delete(schema.checklistItems)
    .where(eq(schema.checklistItems.id, itemId))
    .run();
}

export type ChecklistWithItems = {
  checklist: typeof schema.personalChecklists.$inferSelect;
  items: (typeof schema.checklistItems.$inferSelect)[];
};

export function listChecklistsForSavedProgram(
  db: BetterSQLite3Database<typeof schema>,
  savedProgramId: number,
): ChecklistWithItems[] {
  const checklists = db
    .select()
    .from(schema.personalChecklists)
    .where(eq(schema.personalChecklists.savedProgramId, savedProgramId))
    .orderBy(desc(schema.personalChecklists.createdAt))
    .all();
  const checklistIds = checklists.map((c) => c.id);
  const items = checklistIds.length
    ? db
        .select()
        .from(schema.checklistItems)
        .where(inArray(schema.checklistItems.checklistId, checklistIds))
        .orderBy(asc(schema.checklistItems.sortOrder))
        .all()
    : [];

  return checklists.map((checklist) => ({
    checklist,
    items: items.filter((item) => item.checklistId === checklist.id),
  }));
}

export type DueItem = {
  item: typeof schema.checklistItems.$inferSelect;
  program: Pick<typeof schema.programs.$inferSelect, "slug" | "name">;
  school: Pick<typeof schema.schools.$inferSelect, "slug" | "name">;
};

export function listDueItems(
  db: BetterSQLite3Database<typeof schema>,
): DueItem[] {
  return db
    .select({
      item: schema.checklistItems,
      program: { slug: schema.programs.slug, name: schema.programs.name },
      school: { slug: schema.schools.slug, name: schema.schools.name },
    })
    .from(schema.checklistItems)
    .innerJoin(
      schema.personalChecklists,
      eq(schema.checklistItems.checklistId, schema.personalChecklists.id),
    )
    .innerJoin(
      schema.savedPrograms,
      eq(schema.personalChecklists.savedProgramId, schema.savedPrograms.id),
    )
    .innerJoin(
      schema.programs,
      eq(schema.savedPrograms.programId, schema.programs.id),
    )
    .innerJoin(schema.schools, eq(schema.programs.schoolId, schema.schools.id))
    .where(
      and(
        eq(schema.savedPrograms.userId, CURRENT_USER_ID),
        inArray(schema.checklistItems.status, ["todo", "in_progress", "blocked"]),
      ),
    )
    .orderBy(
      sql`${schema.checklistItems.dueAt} is null`,
      asc(schema.checklistItems.dueAt),
    )
    .all();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- domain-checklists`
Expected: PASS, all 8 cases (4 `generateChecklist` + 4 new).

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/checklists.ts tests/integration/domain-checklists.test.ts
git commit -m "Phase 4: add checklist item CRUD, listChecklistsForSavedProgram, listDueItems"
```

---

### Task 5: Server Actions — `src/app/actions/saved.ts`

**Files:**
- Create: `src/app/actions/saved.ts`

**Interfaces:**
- Consumes: `saveProgram`, `unsaveProgram`, `updateSavedProgram` from
  `@/domain/saved` (Task 2); `PRIORITIES` from `@/db/schema/personal`; `db`
  from `@/db/client`.
- Produces: `saveProgramAction(programId: number, schoolSlug: string, programSlug: string): Promise<void>`;
  `unsaveProgramAction(programId: number, schoolSlug: string, programSlug: string): Promise<void>`;
  `updateSavedProgramAction(savedProgramId: number, formData: FormData): Promise<void>` —
  all exported from `@/app/actions/saved`. Task 7's `SaveProgramControl`
  imports all three.

No unit test for this file — Server Actions here are thin wrappers with no
branching logic beyond Zod parsing; behavior is covered by Task 11's e2e
test, matching how Phase 3 validated its pages (typecheck + manual + e2e,
no page-level unit tests).

- [ ] **Step 1: Write the file**

```ts
// src/app/actions/saved.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  saveProgram,
  unsaveProgram,
  updateSavedProgram,
} from "@/domain/saved";
import { PRIORITIES } from "@/db/schema/personal";

export async function saveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  saveProgram(db, programId);
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/my");
  revalidatePath("/");
}

export async function unsaveProgramAction(
  programId: number,
  schoolSlug: string,
  programSlug: string,
): Promise<void> {
  unsaveProgram(db, programId);
  revalidatePath(`/programs/${schoolSlug}/${programSlug}`);
  revalidatePath("/my");
  revalidatePath("/");
}

const updateSavedProgramSchema = z.object({
  priority: z.enum([...PRIORITIES, ""]),
  personalNote: z.string(),
});

export async function updateSavedProgramAction(
  savedProgramId: number,
  formData: FormData,
): Promise<void> {
  const parsed = updateSavedProgramSchema.parse({
    priority: formData.get("priority") ?? "",
    personalNote: formData.get("personalNote") ?? "",
  });

  updateSavedProgram(db, savedProgramId, {
    priority: parsed.priority === "" ? null : parsed.priority,
    personalNote:
      parsed.personalNote.trim() === "" ? null : parsed.personalNote,
  });
  revalidatePath("/my");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/saved.ts
git commit -m "Phase 4: add save/unsave/update Server Actions"
```

---

### Task 6: Server Actions — `src/app/actions/checklists.ts`

**Files:**
- Create: `src/app/actions/checklists.ts`

**Interfaces:**
- Consumes: `generateChecklist`, `addChecklistItem`, `updateChecklistItem`,
  `deleteChecklistItem` from `@/domain/checklists` (Tasks 3-4);
  `CHECKLIST_ITEM_STATUSES` from `@/db/schema/personal`; `db` from `@/db/client`.
- Produces: `generateChecklistAction(savedProgramId: number): Promise<void>`;
  `addChecklistItemAction(checklistId: number, formData: FormData): Promise<void>`;
  `updateChecklistItemStatusAction(itemId: number, status: string): Promise<void>`;
  `updateChecklistItemDueDateAction(itemId: number, formData: FormData): Promise<void>`;
  `deleteChecklistItemAction(itemId: number): Promise<void>` — all exported
  from `@/app/actions/checklists`. Task 7's `SaveProgramControl` imports
  `generateChecklistAction`. Task 8's `ChecklistItemRow` imports
  `updateChecklistItemStatusAction`, `updateChecklistItemDueDateAction`,
  `deleteChecklistItemAction`. Task 8's `AddChecklistItemForm` and Task 9's
  `/my` page import `addChecklistItemAction`/`generateChecklistAction`.

- [ ] **Step 1: Write the file**

```ts
// src/app/actions/checklists.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import {
  addChecklistItem,
  deleteChecklistItem,
  generateChecklist,
  updateChecklistItem,
} from "@/domain/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";

export async function generateChecklistAction(
  savedProgramId: number,
): Promise<void> {
  generateChecklist(db, savedProgramId);
  revalidatePath("/my");
  revalidatePath("/");
}

const dueDateSchema = z
  .string()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "invalid date")
  .transform((v) => (v === "" ? null : new Date(`${v}T00:00:00.000Z`)));

const addItemSchema = z.object({
  title: z.string().trim().min(1, "title required"),
  dueAt: dueDateSchema,
  linkUrl: z.string(),
});

export async function addChecklistItemAction(
  checklistId: number,
  formData: FormData,
): Promise<void> {
  const parsed = addItemSchema.parse({
    title: formData.get("title") ?? "",
    dueAt: formData.get("dueAt") ?? "",
    linkUrl: formData.get("linkUrl") ?? "",
  });

  addChecklistItem(db, checklistId, {
    title: parsed.title,
    detail: null,
    dueAt: parsed.dueAt,
    linkUrl: parsed.linkUrl.trim() === "" ? null : parsed.linkUrl,
  });
  revalidatePath("/my");
  revalidatePath("/");
}

const statusSchema = z.enum(CHECKLIST_ITEM_STATUSES);

export async function updateChecklistItemStatusAction(
  itemId: number,
  status: string,
): Promise<void> {
  updateChecklistItem(db, itemId, { status: statusSchema.parse(status) });
  revalidatePath("/my");
  revalidatePath("/");
}

export async function updateChecklistItemDueDateAction(
  itemId: number,
  formData: FormData,
): Promise<void> {
  const dueAt = dueDateSchema.parse(formData.get("dueAt") ?? "");
  updateChecklistItem(db, itemId, { dueAt });
  revalidatePath("/my");
  revalidatePath("/");
}

export async function deleteChecklistItemAction(itemId: number): Promise<void> {
  deleteChecklistItem(db, itemId);
  revalidatePath("/my");
  revalidatePath("/");
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/checklists.ts
git commit -m "Phase 4: add checklist generation and item Server Actions"
```

---

### Task 7: `SaveProgramControl` and wiring into the detail page

**Files:**
- Create: `src/components/SaveProgramControl.tsx`
- Modify: `src/app/programs/[schoolSlug]/[programSlug]/page.tsx`

**Interfaces:**
- Consumes: `saveProgramAction`, `unsaveProgramAction`, `updateSavedProgramAction`
  from `@/app/actions/saved` (Task 5); `generateChecklistAction` from
  `@/app/actions/checklists` (Task 6); `PRIORITIES` from `@/db/schema/personal`;
  `getSavedProgram` from `@/domain/saved` (Task 2); `listChecklistsForSavedProgram`
  from `@/domain/checklists` (Task 4).
- Produces: `SaveProgramControl` component exported from
  `@/components/SaveProgramControl`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/SaveProgramControl.tsx
"use client";

import { useTransition } from "react";
import {
  saveProgramAction,
  unsaveProgramAction,
  updateSavedProgramAction,
} from "@/app/actions/saved";
import { generateChecklistAction } from "@/app/actions/checklists";
import { PRIORITIES } from "@/db/schema/personal";

type SavedProgramState = {
  id: number;
  priority: (typeof PRIORITIES)[number] | null;
  personalNote: string | null;
} | null;

export function SaveProgramControl({
  programId,
  schoolSlug,
  programSlug,
  savedProgram,
  hasChecklist,
}: {
  programId: number;
  schoolSlug: string;
  programSlug: string;
  savedProgram: SavedProgramState;
  hasChecklist: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!savedProgram) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void saveProgramAction(programId, schoolSlug, programSlug);
          })
        }
        className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Save program
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(() => {
              void unsaveProgramAction(programId, schoolSlug, programSlug);
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          Unsave
        </button>

        <button
          type="button"
          disabled={isPending || hasChecklist}
          onClick={() =>
            startTransition(() => {
              void generateChecklistAction(savedProgram.id);
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-700"
        >
          {hasChecklist ? "Checklist generated" : "Generate checklist"}
        </button>

        {hasChecklist && (
          <a
            href="/my"
            className="text-xs text-blue-600 underline dark:text-blue-400"
          >
            View on My Applications
          </a>
        )}
      </div>

      <form
        action={updateSavedProgramAction.bind(null, savedProgram.id)}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="flex items-center gap-1 text-xs">
          Priority
          <select
            name="priority"
            defaultValue={savedProgram.priority ?? ""}
            className="rounded border border-zinc-300 px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">unset</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <textarea
          name="personalNote"
          defaultValue={savedProgram.personalNote ?? ""}
          placeholder="Personal note"
          rows={2}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
        >
          Save note
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the detail page**

Modify `src/app/programs/[schoolSlug]/[programSlug]/page.tsx`. Add to the
imports:

```tsx
import { getSavedProgram } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { SaveProgramControl } from "@/components/SaveProgramControl";
```

After the `const [currentCycle, ...priorCycles] = detail.cycles;` line, add:

```tsx
  const savedProgram = getSavedProgram(db, detail.program.id);
  const hasChecklist =
    savedProgram !== null &&
    listChecklistsForSavedProgram(db, savedProgram.id).length > 0;
```

Immediately after the closing `</p>` of the city/state paragraph (before
the `<dl className="mt-4 ...">` requirements block), insert:

```tsx
      <SaveProgramControl
        programId={detail.program.id}
        schoolSlug={schoolSlug}
        programSlug={programSlug}
        savedProgram={savedProgram}
        hasChecklist={hasChecklist}
      />
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/SaveProgramControl.tsx "src/app/programs/[schoolSlug]/[programSlug]/page.tsx"
git commit -m "Phase 4: add SaveProgramControl to the program detail page"
```

---

### Task 8: `ChecklistItemRow` and `AddChecklistItemForm`

**Files:**
- Create: `src/components/ChecklistItemRow.tsx`
- Create: `src/components/AddChecklistItemForm.tsx`

**Interfaces:**
- Consumes: `updateChecklistItemStatusAction`, `updateChecklistItemDueDateAction`,
  `deleteChecklistItemAction`, `addChecklistItemAction` from
  `@/app/actions/checklists` (Task 6); `CHECKLIST_ITEM_STATUSES` from
  `@/db/schema/personal`.
- Produces: `ChecklistItemRow` component exported from
  `@/components/ChecklistItemRow`, `AddChecklistItemForm` component
  exported from `@/components/AddChecklistItemForm`. Task 9 (`/my`) and
  Task 10 (dashboard) both render `ChecklistItemRow`; Task 9 renders
  `AddChecklistItemForm` per checklist.

- [ ] **Step 1: `ChecklistItemRow.tsx`**

```tsx
// src/components/ChecklistItemRow.tsx
"use client";

import { useTransition } from "react";
import {
  deleteChecklistItemAction,
  updateChecklistItemDueDateAction,
  updateChecklistItemStatusAction,
} from "@/app/actions/checklists";
import { CHECKLIST_ITEM_STATUSES } from "@/db/schema/personal";

type Item = {
  id: number;
  title: string;
  dueAt: Date | null;
  status: (typeof CHECKLIST_ITEM_STATUSES)[number];
  linkUrl: string | null;
};

function formatDueDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isOverdue(d: Date | null, status: Item["status"]): boolean {
  return (
    d !== null &&
    d.getTime() < Date.now() &&
    status !== "done" &&
    status !== "skipped"
  );
}

export function ChecklistItemRow({
  item,
  programLabel,
}: {
  item: Item;
  programLabel?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
      <select
        value={item.status}
        disabled={isPending}
        onChange={(e) =>
          startTransition(() => {
            void updateChecklistItemStatusAction(item.id, e.target.value);
          })
        }
        className="rounded border border-zinc-300 px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      >
        {CHECKLIST_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <span className={item.status === "done" ? "text-zinc-400 line-through" : ""}>
        {item.title}
      </span>

      {programLabel && (
        <span className="text-xs text-zinc-500">{programLabel}</span>
      )}

      <form
        action={updateChecklistItemDueDateAction.bind(null, item.id)}
        className="flex items-center gap-1"
      >
        <input
          type="date"
          name="dueAt"
          defaultValue={item.dueAt ? formatDueDate(item.dueAt) : ""}
          className={`rounded border px-1 py-0.5 text-xs dark:bg-zinc-900 ${
            isOverdue(item.dueAt, item.status)
              ? "border-red-400 text-red-600 dark:text-red-400"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
        <button type="submit" className="text-xs text-zinc-500 underline">
          set
        </button>
      </form>

      {item.linkUrl && (
        <a
          href={item.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 underline dark:text-blue-400"
        >
          link
        </a>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(() => {
            void deleteChecklistItemAction(item.id);
          })
        }
        className="ml-auto text-xs text-red-600 dark:text-red-400"
      >
        delete
      </button>
    </li>
  );
}
```

- [ ] **Step 2: `AddChecklistItemForm.tsx`**

```tsx
// src/components/AddChecklistItemForm.tsx
"use client";

import { addChecklistItemAction } from "@/app/actions/checklists";

export function AddChecklistItemForm({ checklistId }: { checklistId: number }) {
  return (
    <form
      action={addChecklistItemAction.bind(null, checklistId)}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <input
        type="text"
        name="title"
        placeholder="New task"
        required
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="date"
        name="dueAt"
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="url"
        name="linkUrl"
        placeholder="Link (optional)"
        className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Add task
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (Neither component is imported anywhere yet — expected,
does not fail typecheck.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ChecklistItemRow.tsx src/components/AddChecklistItemForm.tsx
git commit -m "Phase 4: add ChecklistItemRow and AddChecklistItemForm components"
```

---

### Task 9: `/my` page

**Files:**
- Modify: `src/app/my/page.tsx` (replaces the Phase 1 placeholder)

**Interfaces:**
- Consumes: `db` from `@/db/client`; `listSavedPrograms` from
  `@/domain/saved` (Task 2); `listChecklistsForSavedProgram` from
  `@/domain/checklists` (Task 4); `generateChecklistAction` from
  `@/app/actions/checklists` (Task 6); `ChecklistItemRow` (Task 8);
  `AddChecklistItemForm` (Task 8).

- [ ] **Step 1: Write the page**

```tsx
// src/app/my/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { listSavedPrograms } from "@/domain/saved";
import { listChecklistsForSavedProgram } from "@/domain/checklists";
import { generateChecklistAction } from "@/app/actions/checklists";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";
import { AddChecklistItemForm } from "@/components/AddChecklistItemForm";

export default function MyApplicationsPage() {
  const savedPrograms = listSavedPrograms(db);

  return (
    <div>
      <h1 className="text-2xl font-semibold">My Applications</h1>

      {savedPrograms.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          No saved programs yet. Save one from its program page.
        </p>
      ) : (
        <ul className="mt-6 space-y-6">
          {savedPrograms.map(({ savedProgram, school, program }) => {
            const checklists = listChecklistsForSavedProgram(
              db,
              savedProgram.id,
            );
            return (
              <li
                key={savedProgram.id}
                className="rounded border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex items-center justify-between">
                  <Link
                    href={`/programs/${school.slug}/${program.slug}`}
                    className="font-medium hover:underline"
                  >
                    {school.name} — {program.name}
                  </Link>
                  {savedProgram.priority && (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">
                      {savedProgram.priority}
                    </span>
                  )}
                </div>
                {savedProgram.personalNote && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {savedProgram.personalNote}
                  </p>
                )}

                {checklists.length === 0 ? (
                  <form
                    action={generateChecklistAction.bind(null, savedProgram.id)}
                    className="mt-3"
                  >
                    <button
                      type="submit"
                      className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                    >
                      Generate checklist
                    </button>
                  </form>
                ) : (
                  checklists.map(({ checklist, items }) => (
                    <div key={checklist.id} className="mt-3">
                      <h2 className="text-sm font-semibold">
                        {checklist.title}
                      </h2>
                      <ul className="mt-1 divide-y divide-zinc-100 dark:divide-zinc-800">
                        {items.map((item) => (
                          <ChecklistItemRow key={item.id} item={item} />
                        ))}
                      </ul>
                      <AddChecklistItemForm checklistId={checklist.id} />
                    </div>
                  ))
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/my/page.tsx
git commit -m "Phase 4: build /my saved-programs and checklist page"
```

---

### Task 10: Dashboard — `/`

**Files:**
- Modify: `src/app/page.tsx` (replaces the Phase 1 placeholder)

**Interfaces:**
- Consumes: `db` from `@/db/client`; `listDueItems` from
  `@/domain/checklists` (Task 4); `listSavedPrograms` from `@/domain/saved`
  (Task 2); `ChecklistItemRow` (Task 8).

- [ ] **Step 1: Write the page**

```tsx
// src/app/page.tsx
import Link from "next/link";
import { db } from "@/db/client";
import { listDueItems } from "@/domain/checklists";
import { listSavedPrograms } from "@/domain/saved";
import { ChecklistItemRow } from "@/components/ChecklistItemRow";

export default function DashboardPage() {
  const dueItems = listDueItems(db);
  const savedPrograms = listSavedPrograms(db);

  const counts = { reach: 0, target: 0, likely: 0, dropped: 0 };
  for (const { savedProgram } of savedPrograms) {
    if (savedProgram.priority) {
      counts[savedProgram.priority] += 1;
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {savedPrograms.length} saved programs — {counts.reach} reach /{" "}
        {counts.target} target / {counts.likely} likely
      </p>

      {dueItems.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No open tasks.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-100 dark:divide-zinc-800">
          {dueItems.map(({ item, school, program }) => (
            <ChecklistItemRow
              key={item.id}
              item={item}
              programLabel={`${school.name} — ${program.name}`}
            />
          ))}
        </ul>
      )}

      <Link
        href="/my"
        className="mt-4 inline-block text-sm text-blue-600 underline dark:text-blue-400"
      >
        View all applications
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "Phase 4: build dashboard from open checklist items"
```

---

### Task 11: E2E test — the Phase 4 gate

**Files:**
- Create: `tests/e2e/personal.spec.ts`

**Interfaces:**
- Consumes: the running dev server (Playwright's `webServer` starts
  `npm run dev` against `data/app.db`, per `playwright.config.ts`), and the
  legacy-imported program data from Phase 3.

Uses real legacy-imported requirement labels, which are stable regardless
of which program record is used: `"Minimum overall GPA"` and
`"GRE required"` are literal strings in `scripts/legacy-import/transform.ts`,
generated for every program.

- [ ] **Step 1: Confirm the dev database is migrated and seeded**

This mirrors Phase 3's Task 9 — if `data/app.db` was deleted, or this task
runs in a fresh worktree, the tables/rows this test depends on won't exist.
Both commands are idempotent (Drizzle tracks applied migrations; the
legacy importer is idempotent on `programs.legacy_key`), so running them
again is always safe.

Run: `test -f .env.local || cp .env.example .env.local && npm run db:migrate && npm run import:legacy -- --apply`
Expected: `Migrations applied.` then either `Created 23 schools, ...` (first
run) or `Skipped 23 already-imported programs.` (subsequent runs) — either
outcome means the data this test needs is present.

- [ ] **Step 2: Write the test**

```ts
// tests/e2e/personal.spec.ts
import { test, expect } from "@playwright/test";

test("save a program, generate its checklist, complete a task, see it reflected on the dashboard", async ({
  page,
}) => {
  await page.goto("/programs");
  await page.getByPlaceholder("School or city").fill("Midwestern");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: /Midwestern University/ }).click();

  await page.getByRole("button", { name: "Save program" }).click();
  await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible();

  await page.getByRole("button", { name: "Generate checklist" }).click();
  await expect(
    page.getByRole("button", { name: "Checklist generated" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "View on My Applications" }).click();
  await expect(page).toHaveURL(/\/my$/);
  await expect(
    page.getByRole("heading", { name: /Midwestern University/ }),
  ).toBeVisible();
  await expect(page.getByText("Minimum overall GPA")).toBeVisible();
  await expect(page.getByText("GRE required")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Minimum overall GPA")).toBeVisible();
  await expect(page.getByText("GRE required")).toBeVisible();

  await page.goto("/my");
  const gpaRow = page.locator('li:has-text("Minimum overall GPA")').last();
  await gpaRow.getByRole("combobox").selectOption("done");
  await expect(gpaRow.getByRole("combobox")).toHaveValue("done");

  await page.goto("/");
  await expect(page.getByText("Minimum overall GPA")).toHaveCount(0);
  await expect(page.getByText("GRE required")).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS — this test plus every existing Phase 1/3 e2e test.

If it fails because Midwestern University's requirement labels have
drifted from `transform.ts`, inspect the actual page
(`npx playwright test tests/e2e/personal.spec.ts --headed`) and adjust the
assertions to match — do not weaken an assertion to force a pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/personal.spec.ts
git commit -m "Phase 4: add e2e coverage for save/generate/complete/dashboard"
```

---

### Task 12: Final verification

**Files:** none — this task only runs checks and fixes anything they surface.

- [ ] **Step 1: Run the full verify pipeline**

Run: `npm run verify`
Expected: `format:check`, `typecheck`, `lint`, `test`, and `test:e2e` all
pass. If `format:check` fails, run `npm run format` and re-verify. If
`lint` fails, run `npm run lint:fix` and re-verify — read every auto-fix
diff before committing; do not blindly accept a fix that changes logic.

- [ ] **Step 2: Manual browser check (per `CLAUDE.md`'s UI-change rule)**

Run: `npm run dev -- --hostname 127.0.0.1 --port 3000`, then in a browser:
- Open a program detail page, click "Save program", confirm it switches to
  the "Unsave" / "Generate checklist" state.
- Set a priority and a personal note, click "Save note", reload the page,
  confirm both persisted.
- Click "Generate checklist", confirm the button becomes "Checklist
  generated" and stays disabled on a second click.
- Follow "View on My Applications" to `/my`, confirm the saved program
  card, its checklist, and its generated items are visible.
- Change one item's status to `done` and confirm the strikethrough style
  applies; set a due date on another item and confirm it saves after
  reload.
- Add a manual task via the "Add task" form, confirm it appears; delete it,
  confirm it's gone.
- Visit `/`, confirm the summary line's counts match your saved programs,
  and every non-`done`/`skipped` item across all saved programs appears,
  sorted with any overdue/soonest-due items first and undated items last.

Stop the dev server after checking.

- [ ] **Step 3: Confirm the Phase 4 gate from `plan.md` §4**

> End-to-end "save program -> generate checklist -> complete task -> see it
> on dashboard" passes in Playwright.

State explicitly in your final report that `tests/e2e/personal.spec.ts`
covers this exact sequence and passed in Step 1.

- [ ] **Step 4: Final commit if Step 1's fixes produced changes**

```bash
git add -A
git commit -m "Phase 4: fix formatting/lint issues surfaced by npm run verify"
```

(Skip this step if Step 1 passed clean on the first run.)

---

## Self-Review Notes

- **Spec coverage:** Decision 1 (user identity) → Task 1 (plus header
  correction 1). Decision 2 (checklist scope, all categories) → Task 3.
  Decision 3 (idempotent regeneration) → Task 3. Decision 4 (manual item
  CRUD) → Task 4, Task 8's `AddChecklistItemForm`, Task 6's
  `addChecklistItemAction`/`deleteChecklistItemAction`. Decision 5
  (priority/note editing) → Task 7's `SaveProgramControl` note form.
  Decision 6 (dashboard content) → Task 10. Architecture section → Tasks
  2-6 (domain + actions). UI section → Tasks 7-10. Testing section → Tasks
  1-4 (integration, per header correction 2), Task 11 (e2e). Error
  handling section → Task 5/6's Zod schemas.
- **Type consistency checked:** `Priority` (Task 2) matches
  `SaveProgramControl`'s `SavedProgramState["priority"]` (Task 7) and
  `updateSavedProgramSchema`'s enum (Task 5) — all sourced from
  `schema.PRIORITIES`/`PRIORITIES`. `ChecklistItemStatus` (Task 4) matches
  `statusSchema` (Task 6) and `ChecklistItemRow`'s `Item["status"]` (Task
  8) — all sourced from `schema.CHECKLIST_ITEM_STATUSES`/`CHECKLIST_ITEM_STATUSES`.
  `DueItem`/`ChecklistWithItems["items"]` (Task 4) both resolve to
  `checklistItems.$inferSelect`, satisfying `ChecklistItemRow`'s `Item`
  type (Task 8) in both call sites (Task 9, Task 10).
- **No placeholders:** every task has runnable code, not prose describing
  what to write.
