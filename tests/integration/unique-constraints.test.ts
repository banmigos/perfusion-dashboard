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
    await db
      .insert(schema.schools)
      .values({ slug: "duke-university", name: "Duke" });

    await expect(
      db
        .insert(schema.schools)
        .values({ slug: "duke-university", name: "Duke Again" }),
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
