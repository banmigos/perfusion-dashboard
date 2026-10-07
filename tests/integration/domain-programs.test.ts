import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { getProgramDetail, listPrograms } from "@/domain/programs";
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

describe("getProgramDetail", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("returns null when the school slug does not resolve", () => {
    expect(getProgramDetail(db, "nonexistent", "perfusion-ms")).toBeNull();
  });

  it("returns null when the program slug does not resolve under a real school", async () => {
    await seedFixtureSchool(db);
    expect(getProgramDetail(db, "duke-university", "nonexistent")).toBeNull();
  });

  it("returns the full detail tree with claims attached", async () => {
    const fixture = await seedFixtureSchool(db);

    const detail = getProgramDetail(db, "duke-university", "perfusion-ms")!;

    expect(detail.school.slug).toBe("duke-university");
    expect(detail.program.slug).toBe("perfusion-ms");
    expect(detail.cycles).toHaveLength(1);
    expect(detail.cycles[0]!.cycle.cycleLabel).toBe("2026-27");
    expect(detail.cycles[0]!.requirements).toHaveLength(1);
    expect(detail.cycles[0]!.prerequisites).toHaveLength(1);
    expect(detail.tuitionEstimates).toHaveLength(1);

    const key = `requirements:${fixture.requirement.id}:value_number`;
    expect(detail.claims.get(key)?.state).toBe("known");
  });

  it("orders cycles newest cycle_label first", async () => {
    const fixture = await seedFixtureSchool(db);
    await db.insert(schema.applicationCycles).values({
      programId: fixture.program.id,
      cycleLabel: "2027-28",
      entryYear: 2028,
    });

    const detail = getProgramDetail(db, "duke-university", "perfusion-ms")!;

    expect(detail.cycles.map((c) => c.cycle.cycleLabel)).toEqual([
      "2027-28",
      "2026-27",
    ]);
  });

  it("omits archived cycles (with their prerequisites) and archived requirements", async () => {
    const fixture = await seedFixtureSchool(db);
    const [archivedCycle] = await db
      .insert(schema.applicationCycles)
      .values({
        programId: fixture.program.id,
        cycleLabel: "2027-28",
        status: "archived",
        archivedAt: new Date(),
      })
      .returning();
    await db.insert(schema.prerequisiteCourses).values({
      cycleId: archivedCycle!.id,
      subject: "Chemistry",
    });
    await db.insert(schema.requirements).values({
      cycleId: fixture.cycle.id,
      category: "other",
      label: "Archived requirement",
      status: "archived",
      archivedAt: new Date(),
    });

    const detail = getProgramDetail(db, "duke-university", "perfusion-ms")!;

    expect(detail.cycles.map((c) => c.cycle.cycleLabel)).toEqual(["2026-27"]);
    expect(detail.cycles[0]!.requirements.map((r) => r.id)).toEqual([
      fixture.requirement.id,
    ]);
    expect(detail.cycles[0]!.prerequisites).toHaveLength(1);
  });
});
