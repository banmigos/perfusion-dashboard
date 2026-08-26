import { eq, ne } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";

describe("PRAGMAs and soft-delete lifecycle", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("has foreign_keys ON for this connection", () => {
    // better-sqlite3's `.pragma(source, { simple: true })` runs
    // `PRAGMA <source>` and plucks the first column of the first row
    // (see node_modules/better-sqlite3/lib/methods/pragma.js). helpers/db.ts
    // sets this via the shared src/db/pragmas.ts#applyPragmas, the same
    // function src/db/client.ts uses for the production connection, so this
    // asserts the real PRAGMA-setting code, not a parallel test-only
    // reimplementation of it.
    const result = ctx.sqlite.pragma("foreign_keys", { simple: true });
    expect(result).toBe(1);
  });

  it("has journal_mode WAL for this connection", () => {
    // SQLite reports journal_mode back lowercase ("wal"), confirmed by
    // reading it back on a real connection rather than assumed.
    const result = ctx.sqlite.pragma("journal_mode", { simple: true });
    expect(result).toBe("wal");
  });

  it("has busy_timeout 5000ms for this connection", () => {
    const result = ctx.sqlite.pragma("busy_timeout", { simple: true });
    expect(result).toBe(5000);
  });

  it("has synchronous NORMAL (1) for this connection", () => {
    // `PRAGMA synchronous` reads back the numeric mode; NORMAL is 1 per
    // SQLite's own docs, confirmed here by reading it back rather than
    // hardcoded blind.
    const result = ctx.sqlite.pragma("synchronous", { simple: true });
    expect(result).toBe(1);
  });

  it("archives a school in place instead of deleting it", async () => {
    const fixture = await seedFixtureSchool(db);
    const archivedAt = new Date();

    await db
      .update(schema.schools)
      .set({ status: "archived", archivedAt })
      .where(eq(schema.schools.id, fixture.school.id));

    const [row] = await db
      .select()
      .from(schema.schools)
      .where(eq(schema.schools.id, fixture.school.id));
    expect(row?.status).toBe("archived");
    expect(row?.archivedAt).toBeInstanceOf(Date);

    // The row still exists, and everything it owns is untouched (archiving
    // does not cascade to claims — docs/data-model.md §5).
    const claims = await db.select().from(schema.claims);
    expect(claims).toHaveLength(1);
  });

  it("a default query filtered on status != 'archived' excludes an archived school but keeps active ones", async () => {
    const fixture = await seedFixtureSchool(db);
    await db
      .insert(schema.schools)
      .values({ slug: "active-school", name: "Active School" });

    await db
      .update(schema.schools)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(schema.schools.id, fixture.school.id));

    const active = await db
      .select()
      .from(schema.schools)
      .where(ne(schema.schools.status, "archived"));

    expect(active.map((s) => s.slug)).toEqual(["active-school"]);
  });
});
