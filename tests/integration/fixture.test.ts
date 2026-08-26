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
