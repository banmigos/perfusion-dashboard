import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("claims CHECK constraints", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("rejects state='known' with no source_id", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "credential",
        state: "known",
        sourceId: null,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows state='unknown' with no source_id", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "credential",
        state: "unknown",
        sourceId: null,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects verification != 'draft' with no checked_at", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
        verification: "needs_review",
        checkedAt: null,
      }),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it("allows verification='draft' with no checked_at", async () => {
    const fixture = await seedFixtureSchool(db);

    await expect(
      db.insert(schema.claims).values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
        verification: "draft",
        checkedAt: null,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a subject_table outside the known canonical table allow-list at the database level", async () => {
    const fixture = await seedFixtureSchool(db);

    // Bypass the Drizzle/TS enum (which would reject this at compile time) by
    // going through the raw driver, to prove the DB-level CHECK is real and
    // not just a TypeScript-level restriction. created_at/updated_at have no
    // SQL-level default (Drizzle populates them at insert time), so they must
    // be supplied here to isolate the failure to the CHECK constraint.
    const now = Date.now();
    expect(() =>
      ctx.sqlite
        .prepare(
          `INSERT INTO claims (subject_table, subject_id, field_key, state, source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "not_a_real_table",
          fixture.program.id,
          "name",
          "known",
          fixture.source.id,
          now,
          now,
        ),
    ).toThrow(/CHECK constraint failed/);
  });
});
