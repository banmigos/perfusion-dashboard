import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import {
  findOrCreateSource,
  listSources,
  updateSource,
} from "@/domain/admin/sources";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

describe("sources admin", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("findOrCreateSource creates a new row for an unseen URL", () => {
    const source = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(source.id).toBeGreaterThan(0);
    expect(source.url).toBe("https://example.edu/admissions");
  });

  it("findOrCreateSource returns the existing row for a seen URL instead of duplicating it", () => {
    const first = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    const second = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(second.id).toBe(first.id);

    const all = db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.url, "https://example.edu/admissions"))
      .all();
    expect(all).toHaveLength(1);
  });

  it("findOrCreateSource does not write a change_log row (sources are not a SUBJECT_TABLES member)", () => {
    findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
  });

  it("updateSource patches title and publisher", () => {
    const source = findOrCreateSource(db, {
      url: "https://example.edu/admissions",
      sourceType: "program_site",
    });
    const updated = updateSource(db, source.id, { title: "Admissions Page" });
    expect(updated.title).toBe("Admissions Page");
  });

  it("listSources returns all sources ordered by URL", () => {
    findOrCreateSource(db, { url: "https://b.edu", sourceType: "other" });
    findOrCreateSource(db, { url: "https://a.edu", sourceType: "other" });
    const all = listSources(db);
    expect(all.map((s) => s.url)).toEqual(["https://a.edu", "https://b.edu"]);
  });
});
