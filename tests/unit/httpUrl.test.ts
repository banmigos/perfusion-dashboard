import { describe, expect, it } from "vitest";
import { httpUrl, optionalHttpUrl } from "@/lib/zod/httpUrl";

describe("httpUrl", () => {
  it("accepts absolute http and https URLs, trimmed", () => {
    expect(httpUrl.parse("https://x.edu/a")).toBe("https://x.edu/a");
    expect(httpUrl.parse("http://x.edu")).toBe("http://x.edu");
    expect(httpUrl.parse("  https://x.edu/a  ")).toBe("https://x.edu/a");
  });

  it("rejects non-http schemes and non-URLs", () => {
    expect(httpUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrl.safeParse("ftp://x").success).toBe(false);
    expect(httpUrl.safeParse("abc").success).toBe(false);
    expect(httpUrl.safeParse("").success).toBe(false);
  });
});

describe("optionalHttpUrl", () => {
  it("maps blank to null and validates otherwise", () => {
    expect(optionalHttpUrl.parse("  ")).toBeNull();
    expect(optionalHttpUrl.parse("https://x.edu/a")).toBe("https://x.edu/a");
    expect(optionalHttpUrl.safeParse("javascript:alert(1)").success).toBe(
      false,
    );
  });
});
