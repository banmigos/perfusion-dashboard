import { describe, expect, it } from "vitest";
import { factState, type ClaimLike } from "@/lib/factState";

const NOW = new Date("2026-08-27T00:00:00Z");

function claim(overrides: Partial<ClaimLike>): ClaimLike {
  return {
    state: "known",
    verification: "verified",
    checkedAt: new Date("2026-08-01T00:00:00Z"),
    quote: "quote",
    source: { url: "https://example.edu/admissions", title: "Admissions" },
    ...overrides,
  };
}

describe("factState", () => {
  it("returns not_researched when there is no claim row", () => {
    expect(factState(undefined, NOW, 180)).toEqual({ kind: "not_researched" });
  });

  it("returns unknown for state=unknown", () => {
    const c = claim({ state: "unknown", checkedAt: new Date("2026-08-20T00:00:00Z") });
    expect(factState(c, NOW, 180)).toEqual({
      kind: "unknown",
      checkedAt: c.checkedAt,
    });
  });

  it("returns not_published for state=not_published", () => {
    const c = claim({ state: "not_published" });
    expect(factState(c, NOW, 180).kind).toBe("not_published");
  });

  it("returns not_applicable for state=not_applicable", () => {
    const c = claim({ state: "not_applicable" });
    expect(factState(c, NOW, 180).kind).toBe("not_applicable");
  });

  it("returns known with isStale=false when checked recently", () => {
    const c = claim({ checkedAt: new Date("2026-08-01T00:00:00Z") });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({
      kind: "known",
      verification: "verified",
      isStale: false,
      quote: "quote",
      source: { url: "https://example.edu/admissions", title: "Admissions" },
    });
  });

  it("returns known with isStale=true when checkedAt exceeds staleAfterDays", () => {
    const c = claim({ checkedAt: new Date("2026-01-01T00:00:00Z") });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", isStale: true });
  });

  it("returns known with isStale=true when checkedAt is null", () => {
    const c = claim({ checkedAt: null });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", isStale: true });
  });

  it("preserves a draft verification distinct from verified", () => {
    const c = claim({ verification: "draft" });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", verification: "draft" });
  });

  it("returns source: null when the claim has no source", () => {
    const c = claim({ source: null });
    const result = factState(c, NOW, 180);
    expect(result).toMatchObject({ kind: "known", source: null });
  });
});
