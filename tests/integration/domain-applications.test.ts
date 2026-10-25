import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { listApplicationRows } from "@/domain/applications";
import {
  addChecklistItem,
  generateChecklist,
  updateChecklistItem,
} from "@/domain/checklists";
import { saveProgram, setApplicationStatus } from "@/domain/saved";
import * as schema from "@/db/schema";

describe("application status and rows", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("a newly saved program starts as not_started with no change stamp", async () => {
    const fixture = await seedFixtureSchool(db);

    const saved = saveProgram(db, fixture.program.id);

    expect(saved.applicationStatus).toBe("not_started");
    expect(saved.statusChangedAt).toBeNull();
  });

  it("setApplicationStatus moves the status and stamps the change", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);

    setApplicationStatus(db, saved.id, "submitted");

    const [row] = db
      .select()
      .from(schema.savedPrograms)
      .where(eq(schema.savedPrograms.id, saved.id))
      .all();
    expect(row?.applicationStatus).toBe("submitted");
    expect(row?.statusChangedAt).toBeInstanceOf(Date);
  });

  it("listApplicationRows leaves untracked programs with saved: null", async () => {
    await seedFixtureSchool(db);

    const [row] = listApplicationRows(db);

    expect(row?.saved).toBeNull();
    expect(row?.items).toEqual([]);
    expect(row?.deadline.value).toBe("2026-11-01");
  });

  it("listApplicationRows carries status, checklist items and progress", async () => {
    const fixture = await seedFixtureSchool(db);
    const saved = saveProgram(db, fixture.program.id);
    setApplicationStatus(db, saved.id, "in_progress");
    const checklist = generateChecklist(db, saved.id);
    const letter = addChecklistItem(db, checklist.id, {
      title: "Letter from charge nurse",
      category: "letters",
    });
    updateChecklistItem(db, letter.id, { status: "done" });

    const [row] = listApplicationRows(db);

    expect(row?.saved?.status).toBe("in_progress");
    expect(row?.items.map((i) => i.category)).toContain("letters");
    // One generated GPA item (open) plus the finished letter.
    expect(row?.progress).toEqual({ total: 2, done: 1, open: 1 });
  });
});
