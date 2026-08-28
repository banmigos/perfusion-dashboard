import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { CURRENT_USER_ID } from "@/domain/user";
import * as schema from "@/db/schema";

describe("CURRENT_USER_ID", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  it("resolves to a users row seeded by the init migration", () => {
    const [owner] = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, CURRENT_USER_ID))
      .all();

    expect(owner).toBeDefined();
    expect(owner!.name).toBe("Owner");
  });
});
