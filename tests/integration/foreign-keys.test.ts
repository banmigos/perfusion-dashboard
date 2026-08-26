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
