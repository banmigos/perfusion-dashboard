import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import { claimKey, loadClaims } from "@/domain/claims";
import * as schema from "@/db/schema";

describe("loadClaims", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("returns an empty map for an empty subject list without querying", () => {
    const result = loadClaims(db, []);
    expect(result.size).toBe(0);
  });

  it("loads a claim with its joined source, keyed by claimKey", async () => {
    const fixture = await seedFixtureSchool(db);

    const result = loadClaims(db, [
      { subjectTable: "requirements", subjectId: fixture.requirement.id },
    ]);

    const key = claimKey(
      "requirements",
      fixture.requirement.id,
      "value_number",
    );
    expect(result.has(key)).toBe(true);
    const claim = result.get(key)!;
    expect(claim.state).toBe("known");
    expect(claim.source?.url).toBe(fixture.source.url);
  });

  it("batches multiple subject tables in one call", async () => {
    const fixture = await seedFixtureSchool(db);

    const result = loadClaims(db, [
      { subjectTable: "requirements", subjectId: fixture.requirement.id },
      { subjectTable: "schools", subjectId: fixture.school.id },
    ]);

    expect(
      result.has(
        claimKey("requirements", fixture.requirement.id, "value_number"),
      ),
    ).toBe(true);
    // No school-level claim was seeded, so only the requirement claim is present.
    expect(result.size).toBe(1);
  });

  it("returns claims with source: null when sourceId is unset", async () => {
    const fixture = await seedFixtureSchool(db);
    const [unsourced] = db
      .insert(schema.claims)
      .values({
        subjectTable: "programs",
        subjectId: fixture.program.id,
        fieldKey: "modality",
        state: "unknown",
      })
      .returning()
      .all();

    const result = loadClaims(db, [
      { subjectTable: "programs", subjectId: fixture.program.id },
    ]);

    const claim = result.get(
      claimKey("programs", fixture.program.id, "modality"),
    )!;
    expect(claim.id).toBe(unsourced!.id);
    expect(claim.source).toBeNull();
  });
});
