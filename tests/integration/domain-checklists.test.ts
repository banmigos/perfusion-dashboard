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
