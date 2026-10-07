import { describe, expect, it } from "vitest";
import { claimFormSchema } from "@/lib/zod/claimForm";

const base = {
  fieldKey: "city",
  sourceUrl: "",
  sourceType: "",
  quote: "",
  note: "",
  checkedAt: "",
};

describe("claimFormSchema", () => {
  it("maps a blank state to undefined (keep current state)", () => {
    const parsed = claimFormSchema.parse({ ...base, state: "" });
    expect(parsed.state).toBeUndefined();
  });

  it("does not require a source URL when state is kept", () => {
    expect(
      claimFormSchema.safeParse({ ...base, state: "", note: "n" }).success,
    ).toBe(true);
  });

  it("requires a source URL only when state is explicitly known", () => {
    expect(claimFormSchema.safeParse({ ...base, state: "known" }).success).toBe(
      false,
    );
    expect(
      claimFormSchema.safeParse({
        ...base,
        state: "known",
        sourceUrl: "https://acme.edu",
      }).success,
    ).toBe(true);
    expect(
      claimFormSchema.safeParse({ ...base, state: "unknown" }).success,
    ).toBe(true);
  });

  it("rejects a state outside the enum", () => {
    expect(claimFormSchema.safeParse({ ...base, state: "maybe" }).success).toBe(
      false,
    );
  });
});
