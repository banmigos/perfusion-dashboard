import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBundle } from "@/domain/import/bundle";

const NOW = new Date("2026-10-07T00:00:00Z");
const fixture = () =>
  JSON.parse(
    fs.readFileSync("tests/fixtures/bundles/example-university.json", "utf-8"),
  );

const issues = (input: unknown) => {
  const result = parseBundle(input, NOW);
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

const cite = {
  source_url: "https://example.edu/x",
  checked_at: "2026-09-01",
};
const withSchool = (school: Record<string, unknown>) => ({
  format: "school-bundle/v1",
  school: { slug: "s", name: "S", ...school },
});
const withCycle = (cycle: Record<string, unknown>) =>
  withSchool({
    programs: [
      {
        slug: "p",
        name: "P",
        cycles: [{ cycle_label: "2026-27", ...cycle }],
      },
    ],
  });

describe("bundle schema", () => {
  it("accepts the canonical fixture", () => {
    expect(issues(fixture())).toEqual([]);
  });

  it("rejects unknown keys at every level", () => {
    expect(issues({ ...fixture(), extra: 1 }).join()).toMatch(
      /extra|Unrecognized/i,
    );
    expect(issues(withSchool({ colour: "red" })).join()).toMatch(
      /Unrecognized/i,
    );
    expect(
      issues(
        withSchool({
          facts: { city: { state: "unknown", value: null, bogus: 1 } },
        }),
      ).join(),
    ).toMatch(/Unrecognized/i);
    expect(
      issues(withSchool({ facts: { cty: { state: "unknown" } } })).join(),
    ).toMatch(/Unrecognized/i);
  });

  it("rejects a wrong format marker", () => {
    expect(issues({ ...fixture(), format: "school-bundle/v0" })).not.toEqual(
      [],
    );
  });

  it("hard-errors on a value with no citation", () => {
    const out = issues(
      withSchool({ facts: { city: { state: "known", value: "Durham" } } }),
    );
    expect(out.join()).toMatch(/requires a citation/);
  });

  it("requires checked_at on a known fact's citation", () => {
    const out = issues(
      withSchool({
        facts: {
          city: {
            state: "known",
            value: "Durham",
            citation: { source_url: "https://example.edu/x" },
          },
        },
      }),
    );
    expect(out.join()).toMatch(/checked_at/);
  });

  it("requires a value when state is known", () => {
    const out = issues(
      withSchool({
        facts: { city: { state: "known", value: null, citation: cite } },
      }),
    );
    expect(out.join()).toMatch(/requires a value/);
  });

  it.each(["unknown", "not_published", "not_applicable"])(
    "requires a null value when state is %s",
    (state) => {
      expect(
        issues(
          withSchool({ facts: { city: { state, value: "Durham" } } }),
        ).join(),
      ).toMatch(/must have a null value/);
      expect(
        issues(withSchool({ facts: { city: { state, value: null } } })),
      ).toEqual([]);
      // value omitted entirely is the same as null
      expect(issues(withSchool({ facts: { city: { state } } }))).toEqual([]);
    },
  );

  it("accepts only the four exact state literals", () => {
    for (const state of ["Known", "KNOWN", "missing", "n/a", "", null, 1]) {
      expect(
        issues(withSchool({ facts: { city: { state, value: null } } })),
      ).not.toEqual([]);
    }
  });

  it("rejects a checked_at in the future and a malformed one", () => {
    const fact = (checked_at: string) =>
      withSchool({
        facts: {
          city: {
            state: "known",
            value: "Durham",
            citation: { source_url: "https://example.edu/x", checked_at },
          },
        },
      });
    expect(issues(fact("2026-10-08")).join()).toMatch(/future/);
    expect(issues(fact("2026-10-07T00:00:01Z")).join()).toMatch(/future/);
    expect(issues(fact("yesterday"))).not.toEqual([]);
    expect(issues(fact("2026-10-07T00:00:00Z"))).toEqual([]);
    expect(issues(fact("2026-10-07"))).toEqual([]);
  });

  it("rejects non-http source URLs", () => {
    expect(
      issues(
        withSchool({
          facts: {
            city: {
              state: "known",
              value: "Durham",
              citation: {
                source_url: "javascript:alert(1)",
                checked_at: "2026-09-01",
              },
            },
          },
        }),
      ),
    ).not.toEqual([]);
  });

  it("requires an explicit, well-formed cycle_label", () => {
    expect(issues(withCycle({ cycle_label: undefined }))).not.toEqual([]);
    expect(issues(withCycle({ cycle_label: "2026" }))).not.toEqual([]);
    expect(issues(withCycle({ cycle_label: "2026-27" }))).toEqual([]);
  });

  it("requires slugs to be kebab-case", () => {
    expect(issues(withSchool({ slug: "Not A Slug" }))).not.toEqual([]);
  });

  it("requires deadline_date to be a real calendar date", () => {
    const deadline = (value: string) =>
      withCycle({
        facts: { deadline_date: { state: "known", value, citation: cite } },
      });
    expect(issues(deadline("2026-11-01"))).toEqual([]);
    expect(issues(deadline("2026-02-30"))).not.toEqual([]);
    expect(issues(deadline("Nov 1"))).not.toEqual([]);
  });

  it("requires deadline time and timezone together, with a date", () => {
    const known = (value: string) => ({
      state: "known",
      value,
      citation: cite,
    });
    const date = known("2026-11-01");
    expect(
      issues(
        withCycle({
          facts: { deadline_date: date, deadline_time_local: known("17:00") },
        }),
      ).join(),
    ).toMatch(/given together/);
    expect(
      issues(
        withCycle({
          facts: {
            deadline_date: date,
            deadline_timezone: known("America/New_York"),
          },
        }),
      ).join(),
    ).toMatch(/given together/);
    expect(
      issues(
        withCycle({
          facts: {
            deadline_time_local: known("17:00"),
            deadline_timezone: known("America/New_York"),
          },
        }),
      ).join(),
    ).toMatch(/requires a known deadline_date/);
    expect(
      issues(
        withCycle({
          facts: {
            deadline_date: date,
            deadline_time_local: known("17:00"),
            deadline_timezone: known("America/New_York"),
          },
        }),
      ),
    ).toEqual([]);
    expect(
      issues(
        withCycle({
          facts: {
            deadline_date: date,
            deadline_time_local: known("5pm"),
            deadline_timezone: known("Not/AZone"),
          },
        }),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("requires money as integer cents with explicit currency and as_of_year", () => {
    const tuition = (t: Record<string, unknown>) =>
      withSchool({
        programs: [
          {
            slug: "p",
            name: "P",
            tuition: [
              {
                residency: "flat",
                covers: "total_program",
                amount_cents: 100,
                currency: "USD",
                as_of_year: 2026,
                citation: cite,
                ...t,
              },
            ],
          },
        ],
      });
    expect(issues(tuition({}))).toEqual([]);
    expect(issues(tuition({ amount_cents: 1000.5 }))).not.toEqual([]);
    expect(issues(tuition({ amount_cents: undefined }))).not.toEqual([]);
    expect(issues(tuition({ currency: undefined }))).not.toEqual([]);
    expect(issues(tuition({ currency: "usd" }))).not.toEqual([]);
    expect(issues(tuition({ as_of_year: undefined }))).not.toEqual([]);
    expect(issues(tuition({ citation: undefined }))).not.toEqual([]);
  });

  it("checks a requirement value against its kind", () => {
    const req = (value: Record<string, unknown>) =>
      withCycle({
        requirements: [{ category: "gpa", label: "GPA", value }],
      });
    const ok = { kind: "number", state: "known", value: 3, citation: cite };
    expect(issues(req(ok))).toEqual([]);
    expect(issues(req({ ...ok, value: "3.0" })).join()).toMatch(
      /does not match kind/,
    );
    expect(issues(req({ ...ok, kind: "bool" })).join()).toMatch(
      /does not match kind/,
    );
    expect(issues(req({ ...ok, citation: undefined })).join()).toMatch(
      /requires a citation/,
    );
  });

  it("rejects duplicate identity keys inside a bundle", () => {
    const dupe = fixture();
    dupe.school.programs.push(dupe.school.programs[0]);
    expect(issues(dupe).join()).toMatch(/duplicate program slug/);

    const dupeCycle = fixture();
    const cycles = dupeCycle.school.programs[0].cycles;
    cycles.push(cycles[0]);
    expect(issues(dupeCycle).join()).toMatch(/duplicate cycle_label/);
  });

  it("rejects tuition that references a cycle not in the program", () => {
    const bad = fixture();
    bad.school.programs[0].tuition[0].cycle_label = "2030-31";
    expect(issues(bad).join()).toMatch(/not in this program's cycles/);
  });
});
