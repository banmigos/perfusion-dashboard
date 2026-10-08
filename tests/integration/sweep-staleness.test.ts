import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { seedFixtureSchool } from "../fixtures/school";
import * as schema from "@/db/schema";
import { hashContent, runSweep, type Fetcher } from "../../scripts/sweep/sweep";

const bytes = (s: string) => new TextEncoder().encode(s);
const live = { dryRun: false, baseline: false };

let ctx: ReturnType<typeof createTestDb>;
let db: TestDb;
beforeEach(() => {
  ctx = createTestDb();
  db = ctx.db;
});
afterEach(() => ctx.close());

async function seed(storedBody: string | null) {
  const fixture = await seedFixtureSchool(db);
  db.update(schema.sources)
    .set({
      contentHash: storedBody === null ? null : hashContent(bytes(storedBody)),
    })
    .where(eq(schema.sources.id, fixture.source.id))
    .run();
  return fixture;
}

const claimOf = (id: number) =>
  db.select().from(schema.claims).where(eq(schema.claims.id, id)).all()[0]!;

describe("staleness sweep", () => {
  it("demotes verified claims on a changed page, logs it, and stores the new hash", async () => {
    const f = await seed("old page");
    const reqBefore = db.select().from(schema.requirements).all();

    const { results } = await runSweep(db, async () => bytes("new page"), live);

    expect(results).toMatchObject([{ outcome: "changed", demoted: 1 }]);
    expect(claimOf(f.claim.id).verification).toBe("needs_review");
    expect(db.select().from(schema.requirements).all()).toEqual(reqBefore);

    const [source] = db.select().from(schema.sources).all();
    expect(source!.contentHash).toBe(hashContent(bytes("new page")));
    const [log] = db.select().from(schema.changeLog).all();
    expect(log).toMatchObject({
      action: "update",
      subjectTable: "requirements",
      fieldKey: "value_number",
    });
  });

  it("is a no-op when the page is unchanged, and idempotent after a change", async () => {
    const f = await seed("same");
    const first = await runSweep(db, async () => bytes("same"), live);
    expect(first.results[0]!.outcome).toBe("unchanged");
    expect(claimOf(f.claim.id).verification).toBe("verified");

    await runSweep(db, async () => bytes("changed"), live);
    const again = await runSweep(db, async () => bytes("changed"), live);
    expect(again.results[0]!.outcome).toBe("unchanged");
    expect(db.select().from(schema.changeLog).all()).toHaveLength(1);
  });

  it("leaves non-verified claims alone", async () => {
    const f = await seed("old");
    db.update(schema.claims)
      .set({ verification: "draft", checkedAt: null })
      .where(eq(schema.claims.id, f.claim.id))
      .run();
    const { results } = await runSweep(db, async () => bytes("new"), live);
    expect(results[0]).toMatchObject({ outcome: "changed", demoted: 0 });
    expect(claimOf(f.claim.id).verification).toBe("draft");
  });

  it("changes nothing when the fetch fails", async () => {
    const f = await seed("old");
    const fail: Fetcher = async () => {
      throw new Error("HTTP 503");
    };
    const { results } = await runSweep(db, fail, live);
    expect(results[0]).toMatchObject({ outcome: "error", error: "HTTP 503" });
    expect(claimOf(f.claim.id).verification).toBe("verified");
    expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
  });

  it("ignores sources with no stored hash unless --baseline, which flags nothing", async () => {
    const f = await seed(null);
    const fetcher: Fetcher = async () => bytes("body");

    expect((await runSweep(db, fetcher, live)).results).toEqual([]);

    const { results } = await runSweep(db, fetcher, {
      ...live,
      baseline: true,
    });
    expect(results[0]!.outcome).toBe("baselined");
    expect(claimOf(f.claim.id).verification).toBe("verified");
    const [source] = db.select().from(schema.sources).all();
    expect(source!.contentHash).toBe(hashContent(bytes("body")));
  });

  it("dry run reports the demotion count but writes nothing", async () => {
    const f = await seed("old");
    const { results } = await runSweep(db, async () => bytes("new"), {
      dryRun: true,
      baseline: false,
    });
    expect(results[0]).toMatchObject({ outcome: "changed", demoted: 1 });
    expect(claimOf(f.claim.id).verification).toBe("verified");
    expect(db.select().from(schema.sources).all()[0]!.contentHash).toBe(
      hashContent(bytes("old")),
    );
    expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
  });
});
