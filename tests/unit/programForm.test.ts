import { describe, expect, it } from "vitest";
import { programFormInput, programFormSchema } from "@/lib/zod/programForm";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("programFormSchema", () => {
  it("parses length, class size and accreditation status", () => {
    const parsed = programFormSchema.parse(
      programFormInput(
        form({
          name: "MS in Perfusion",
          programLengthMonths: "24",
          classSize: " 12 ",
          accreditationStatus: " CAAHEP accredited ",
        }),
      ),
    );
    expect(parsed.programLengthMonths).toBe(24);
    expect(parsed.classSize).toBe(12);
    expect(parsed.accreditationStatus).toBe("CAAHEP accredited");
  });

  it("maps blank numeric and text fields to null, never NaN or 0", () => {
    const parsed = programFormSchema.parse(
      programFormInput(form({ name: "MS in Perfusion" })),
    );
    expect(parsed.programLengthMonths).toBeNull();
    expect(parsed.classSize).toBeNull();
    expect(parsed.accreditationStatus).toBeNull();
  });

  it("rejects non-numeric and fractional integers", () => {
    for (const bad of ["abc", "12.5", "Infinity"]) {
      expect(
        programFormSchema.safeParse(
          programFormInput(form({ name: "X", classSize: bad })),
        ).success,
      ).toBe(false);
    }
  });
});
