import { describe, expect, it } from "vitest";
import { isStale } from "@/lib/freshness";

describe("isStale", () => {
  const now = new Date("2026-08-25T00:00:00.000Z");
  const staleAfterDays = 180;

  it("returns true when checkedAt is null", () => {
    expect(isStale(null, now, staleAfterDays)).toBe(true);
  });

  it("returns false when checkedAt is exactly at the threshold", () => {
    const checkedAt = new Date(
      now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000,
    );
    expect(isStale(checkedAt, now, staleAfterDays)).toBe(false);
  });

  it("returns false when checkedAt is one day inside the threshold", () => {
    const checkedAt = new Date(
      now.getTime() - (staleAfterDays - 1) * 24 * 60 * 60 * 1000,
    );
    expect(isStale(checkedAt, now, staleAfterDays)).toBe(false);
  });

  it("returns true when checkedAt is one day past the threshold", () => {
    const checkedAt = new Date(
      now.getTime() - (staleAfterDays + 1) * 24 * 60 * 60 * 1000,
    );
    expect(isStale(checkedAt, now, staleAfterDays)).toBe(true);
  });

  it("returns false when checkedAt is in the future", () => {
    const checkedAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    expect(isStale(checkedAt, now, staleAfterDays)).toBe(false);
  });
});
