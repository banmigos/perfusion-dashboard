import { describe, expect, it } from "vitest";
import {
  buildProgramImportPlan,
  normalizeCredential,
  parseCityState,
} from "../../../scripts/legacy-import/transform";
import type { LegacyRecord } from "../../../scripts/legacy-import/schema";

function fixtureRecord(
  overrides: Partial<LegacyRecord["raw"]> = {},
): LegacyRecord {
  return {
    raw: {
      name: "Example University",
      city: "Example City, EX",
      degree: "MS",
      deadline: "Mar 1",
      gpa: 3.0,
      gre: "Yes",
      tuition: 80000,
      classSize: 10,
      lat: 1.5,
      lng: -2.5,
      url: "https://example.edu/perfusion",
      prereqs: ["Bio", "Chem"],
      ...overrides,
    },
    triage: [],
  };
}

describe("normalizeCredential", () => {
  it("passes MS, MHS, MPS through unchanged", () => {
    expect(normalizeCredential("MS")).toBe("MS");
    expect(normalizeCredential("MHS")).toBe("MHS");
    expect(normalizeCredential("MPS")).toBe("MPS");
  });

  it("normalizes all three Certificate spellings", () => {
    expect(normalizeCredential("Cert")).toBe("Certificate");
    expect(normalizeCredential("Certificate")).toBe("Certificate");
    expect(normalizeCredential("Certificate (via THI)")).toBe("Certificate");
  });

  it("throws on an unrecognized spelling rather than guessing", () => {
    expect(() => normalizeCredential("PhD")).toThrow(/Unrecognized/);
  });
});

describe("parseCityState", () => {
  it("splits 'City, ST' on the last comma", () => {
    expect(parseCityState("Glendale, AZ")).toEqual({
      city: "Glendale",
      state: "AZ",
    });
  });

  it("handles a city name that itself contains no comma ambiguity", () => {
    expect(parseCityState("Salt Lake City, UT")).toEqual({
      city: "Salt Lake City",
      state: "UT",
    });
  });

  it("throws when there is no comma", () => {
    expect(() => parseCityState("Nowhere")).toThrow(/City, ST/);
  });

  it("throws when the trailing token is not a 2-letter code", () => {
    expect(() => parseCityState("Somewhere, Texas")).toThrow(/2-letter/);
  });
});

describe("buildProgramImportPlan", () => {
  it("maps the generic case: known claims, unknown claims, one gpa/test/tuition requirement each", () => {
    const plan = buildProgramImportPlan(fixtureRecord());

    expect(plan.legacyKey).toBe("Example University");
    expect(plan.school).toEqual({
      slug: "example-university",
      name: "Example University",
      city: "Example City",
      state: "EX",
    });
    expect(plan.program.credential).toBe("MS");
    expect(plan.program.slug).toBe("perfusion-ms");
    expect(plan.program.websiteUrl).toBe("https://example.edu/perfusion");
    expect(plan.cycle).toEqual({
      cycleLabel: "2026-27",
      entryYear: 2027,
      deadlineType: "unknown",
    });

    expect(plan.knownClaims).toEqual([
      { subject: "school", fieldKey: "name" },
      { subject: "school", fieldKey: "city" },
      { subject: "school", fieldKey: "state" },
      { subject: "program", fieldKey: "credential" },
      { subject: "program", fieldKey: "website_url" },
    ]);

    const categories = plan.requirements.map((r) => r.category);
    expect(categories).toEqual(["gpa", "test", "other"]);
    expect(plan.requirements[0]?.claimNote).toMatch(
      /legacy 2025-26 dashboard said 3/,
    );
    expect(plan.requirements[1]?.claimNote).toMatch(/GRE required = Yes/);
    expect(plan.requirements[2]?.claimNote).toMatch(/tuition = 80000/);

    expect(plan.prerequisites).toEqual(["Bio", "Chem"]);

    const fieldKeys = plan.unknownClaims.map((c) => c.fieldKey);
    expect(fieldKeys).toContain("class_size");
    expect(fieldKeys).toContain("deadline_date");
    const deadlineClaim = plan.unknownClaims.find(
      (c) => c.fieldKey === "deadline_date",
    );
    expect(deadlineClaim?.note).toMatch(/"Mar 1"/);
  });

  it("does not add a shadowing requirement when there is no notes field", () => {
    const plan = buildProgramImportPlan(fixtureRecord());
    expect(plan.requirements.some((r) => r.category === "shadowing")).toBe(
      false,
    );
  });

  it("special-cases University of Utah to deadline_type='rolling'", () => {
    const plan = buildProgramImportPlan(
      fixtureRecord({ name: "University of Utah", deadline: "Rolling" }),
    );
    expect(plan.cycle.deadlineType).toBe("rolling");
  });

  it("special-cases Vanderbilt with a shadowing requirement and a closure claim", () => {
    const plan = buildProgramImportPlan(
      fixtureRecord({
        name: "Vanderbilt University Medical Center",
        deadline: "CLOSED",
        notes: "REQUIRED: Minimum 2 cases. CLOSED (not accepting 2025-2027).",
      }),
    );
    expect(plan.cycle.deadlineType).toBe("unknown");
    expect(plan.requirements.some((r) => r.category === "shadowing")).toBe(
      true,
    );
    const closureClaim = plan.unknownClaims.find(
      (c) => c.fieldKey === "closure_status",
    );
    expect(closureClaim).toBeDefined();
    expect(closureClaim?.subject).toBe("cycle");
    expect(closureClaim?.note).toMatch(/CLOSED/);
  });

  it("special-cases UTHealth with a shadowing requirement from its notes", () => {
    const plan = buildProgramImportPlan(
      fixtureRecord({
        name: "UTHealth Houston (McGovern Medical School)",
        notes: "HIGHLY RECOMMENDED: 2 cases under CCP; CURRENTLY WAIVED.",
      }),
    );
    const shadowing = plan.requirements.find((r) => r.category === "shadowing");
    expect(shadowing).toBeDefined();
    expect(shadowing?.claimNote).toMatch(/CURRENTLY WAIVED/);
  });

  it("special-cases Baylor with a duplicate_check claim referencing Texas Heart Institute", () => {
    const plan = buildProgramImportPlan(
      fixtureRecord({
        name: "Baylor College of Medicine",
        degree: "Certificate (via THI)",
      }),
    );
    const dup = plan.unknownClaims.find(
      (c) => c.fieldKey === "duplicate_check",
    );
    expect(dup).toBeDefined();
    expect(dup?.subject).toBe("program");
    expect(dup?.note).toMatch(/Texas Heart Institute/);
  });
});
