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
