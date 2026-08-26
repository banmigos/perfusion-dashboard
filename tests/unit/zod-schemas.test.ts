import { describe, expect, it } from "vitest";
import { schoolInsertSchema, claimInsertSchema } from "@/lib/zod";

describe("zod schemas mirror the Drizzle schema", () => {
  it("accepts a valid school insert", () => {
    const result = schoolInsertSchema.safeParse({
      slug: "duke-university",
      name: "Duke University",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a school insert missing the required name", () => {
    const result = schoolInsertSchema.safeParse({ slug: "duke-university" });
    expect(result.success).toBe(false);
  });

  it("rejects a claim with a state outside the enum", () => {
    const result = claimInsertSchema.safeParse({
      subjectTable: "schools",
      subjectId: 1,
      fieldKey: "name",
      state: "definitely_not_a_real_state",
    });
    expect(result.success).toBe(false);
  });
});
