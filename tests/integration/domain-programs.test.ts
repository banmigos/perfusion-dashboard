import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { listPrograms } from "@/domain/programs";
import * as schema from "@/db/schema";

describe("listPrograms", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("lists a seeded program with no filters", async () => {
    await seedFixtureSchool(db);

    const items = listPrograms(db, {});

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      school: { slug: "duke-university", name: "Duke University" },
      program: { slug: "perfusion-ms", credential: "MS" },
    });
  });

  it("filters by credential", async () => {
    await seedFixtureSchool(db);

    expect(listPrograms(db, { credential: "MS" })).toHaveLength(1);
    expect(listPrograms(db, { credential: "Certificate" })).toHaveLength(0);
  });

  it("filters by q matching school name or city, case-insensitively", async () => {
    await seedFixtureSchool(db);

    expect(listPrograms(db, { q: "duke" })).toHaveLength(1);
    expect(listPrograms(db, { q: "durham" })).toHaveLength(1);
    expect(listPrograms(db, { q: "nonexistent-city" })).toHaveLength(0);
  });

  it("excludes archived schools and programs", async () => {
    const fixture = await seedFixtureSchool(db);
    await db
      .update(schema.programs)
      .set({ status: "archived" })
      .where(eq(schema.programs.id, fixture.program.id));

    expect(listPrograms(db, {})).toHaveLength(0);
  });
});
