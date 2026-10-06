import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./helpers/db";
import { createSchool } from "@/domain/admin/schools";
import { createProgram } from "@/domain/admin/programs";
import { createCycle } from "@/domain/admin/cycles";
import { createRequirement } from "@/domain/admin/requirements";
import { upsertClaim } from "@/domain/admin/claims";
import { listVerifyQueue } from "@/domain/verify";
import { CURRENT_USER_ID } from "@/domain/user";
import * as schema from "@/db/schema";

describe("listVerifyQueue", () => {
  let ctx: ReturnType<typeof createTestDb>;
  let db: TestDb;

  beforeEach(() => {
    ctx = createTestDb();
    db = ctx.db;
  });

  afterEach(() => {
    ctx.close();
  });

  function seedProgram(opts: {
    slug: string;
    saved: boolean;
    deadlineDate?: string;
  }) {
    const schoolId = createSchool(db, {
      slug: `${opts.slug}-school`,
      name: `${opts.slug} School`,
    }).id;
    const programId = createProgram(db, {
      schoolId,
      slug: opts.slug,
      name: `${opts.slug} program`,
    }).id;
    const cycleId = createCycle(db, {
      programId,
      cycleLabel: "2026-27",
      deadlineDate: opts.deadlineDate,
    }).id;
    const req = createRequirement(db, {
      cycleId,
      category: "gpa",
      label: `${opts.slug} requirement`,
    });
    upsertClaim(db, {
      subjectTable: "requirements",
      subjectId: req.id,
      fieldKey: "value_text",
      state: "unknown",
    });
    if (opts.saved) {
      db.insert(schema.savedPrograms)
        .values({ userId: CURRENT_USER_ID, programId })
        .run();
    }
    return { schoolId, programId, cycleId };
  }

  it("orders saved-with-deadline first (nearest first), then saved-no-deadline, then everything else", () => {
    seedProgram({ slug: "z-unsaved", saved: false });
    seedProgram({
      slug: "b-saved-far",
      saved: true,
      deadlineDate: "2026-12-01",
    });
    seedProgram({
      slug: "a-saved-near",
      saved: true,
      deadlineDate: "2026-10-01",
    });
    seedProgram({ slug: "c-saved-no-deadline", saved: true });

    const queue = listVerifyQueue(db);
    const order = queue.map((item) => item.program?.slug);

    expect(order).toEqual([
      "a-saved-near",
      "b-saved-far",
      "c-saved-no-deadline",
      "z-unsaved",
    ]);
  });

  it("excludes claims that are already verified or archived", () => {
    const { schoolId } = seedProgram({
      slug: "already-verified",
      saved: false,
    });
    const claim = upsertClaim(db, {
      subjectTable: "schools",
      subjectId: schoolId,
      fieldKey: "name",
      state: "known",
      sourceUrl: "https://example.edu",
      sourceType: "program_site",
      checkedAt: new Date(),
      verification: "verified",
    });

    const queue = listVerifyQueue(db);
    expect(queue.find((item) => item.claim.id === claim.id)).toBeUndefined();
  });

  it("marks isSaved correctly per item", () => {
    seedProgram({ slug: "saved-one", saved: true, deadlineDate: "2026-10-01" });
    const queue = listVerifyQueue(db);
    const item = queue.find((i) => i.program?.slug === "saved-one");
    expect(item?.isSaved).toBe(true);
  });
});
