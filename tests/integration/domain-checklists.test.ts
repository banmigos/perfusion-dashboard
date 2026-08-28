import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { saveProgram } from "@/domain/saved";
import { addChecklistItem, deleteChecklistItem, generateChecklist, listChecklistsForSavedProgram, listDueItems, updateChecklistItem } from "@/domain/checklists";
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
