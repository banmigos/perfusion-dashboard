import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates simple names", () => {
    expect(slugify("Rush University")).toBe("rush-university");
  });

  it("strips parentheses, keeping their contents as words", () => {
    expect(slugify("Medical University of South Carolina (MUSC)")).toBe(
      "medical-university-of-south-carolina-musc",
    );
  });

  it("treats a slash as a word separator", () => {
    expect(slugify("Carlow University / UPMC Shadyside")).toBe(
      "carlow-university-upmc-shadyside",
    );
  });

  it("collapses runs of non-alphanumeric characters into one hyphen", () => {
    expect(
      slugify(
        "University of Southern California (USC) Keck School of Medicine",
      ),
    ).toBe("university-of-southern-california-usc-keck-school-of-medicine");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  -- Leading/Trailing --  ")).toBe("leading-trailing");
  });

  it("normalizes accented characters", () => {
    expect(slugify("Café Université")).toBe("cafe-universite");
  });
});
