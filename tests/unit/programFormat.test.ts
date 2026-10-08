import { describe, expect, it } from "vitest";
import { formatGpa, formatMonths, formatUsdCents } from "@/lib/programFormat";

describe("programFormat", () => {
  it("formats months", () => {
    expect(formatMonths(24)).toBe("24 mo");
  });

  it("formats GPA to two decimals", () => {
    expect(formatGpa(3)).toBe("3.00");
    expect(formatGpa(3.25)).toBe("3.25");
  });

  it("formats whole-dollar cents without decimals", () => {
    expect(formatUsdCents(5_400_000)).toBe("$54,000");
  });

  it("keeps cents when the amount is not whole dollars", () => {
    expect(formatUsdCents(123_456)).toBe("$1,234.56");
  });
});
