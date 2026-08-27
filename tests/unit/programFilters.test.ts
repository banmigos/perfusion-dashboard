import { describe, expect, it } from "vitest";
import { parseProgramListFilters } from "@/domain/programs";

describe("parseProgramListFilters", () => {
  it("returns no filters for an empty searchParams object", () => {
    expect(parseProgramListFilters({})).toEqual({
      q: undefined,
      credential: undefined,
    });
  });

  it("trims and keeps a non-empty q", () => {
    expect(parseProgramListFilters({ q: "  Duke  " })).toEqual({
      q: "Duke",
      credential: undefined,
    });
  });

  it("drops a blank q", () => {
    expect(parseProgramListFilters({ q: "   " }).q).toBeUndefined();
  });

  it("keeps a valid credential", () => {
    expect(parseProgramListFilters({ credential: "MS" }).credential).toBe("MS");
  });

  it("drops an invalid credential rather than throwing", () => {
    expect(
      parseProgramListFilters({ credential: "PhD" }).credential,
    ).toBeUndefined();
  });

  it("ignores a repeated query param (array value)", () => {
    expect(parseProgramListFilters({ q: ["a", "b"] }).q).toBeUndefined();
  });
});
