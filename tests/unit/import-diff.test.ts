import { describe, expect, it } from "vitest";
import { parseBundle, type SchoolBundle } from "@/domain/import/bundle";
import {
  diffBundle,
  protectReason,
  writeOps,
  type ClaimSnapshot,
  type CurrentCycle,
  type CurrentEntity,
  type CurrentProgram,
  type CurrentSchool,
  type CurrentState,
  type ImportPlan,
  type PlannedOp,
} from "@/domain/import/diff";
import { formatPlan, isNoop, summarizePlan } from "@/domain/import/format";

const NOW = new Date("2026-10-07T00:00:00Z");
const URL_A = "https://example.edu/apply";
const CHECKED = "2026-09-01T00:00:00.000Z";
const CHECKED_MS = Date.parse(CHECKED);

function bundle(extra: {
  schoolName?: string;
  cycle?: Record<string, unknown>;
  program?: Record<string, unknown>;
}): SchoolBundle {
  const result = parseBundle(
    {
      format: "school-bundle/v1",
      school: {
        slug: "duke",
        name: extra.schoolName ?? "Duke",
        programs: [
          {
            slug: "perfusion-ms",
            name: "MS in Perfusion",
            ...extra.program,
            cycles: [{ cycle_label: "2026-27", ...extra.cycle }],
          },
        ],
      },
    },
    NOW,
  );
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

const deadline = (value: string, url = URL_A) => ({
  deadline_date: {
    state: "known",
    value,
    citation: { source_url: url, checked_at: CHECKED, quote: "Due " + value },
  },
});

const claim = (over: Partial<ClaimSnapshot> = {}): ClaimSnapshot => ({
  state: "known",
  sourceUrl: URL_A,
  quote: "Due 2026-11-01",
  note: null,
  checkedAt: CHECKED_MS,
  confidence: null,
  verification: "draft",
  locked: false,
  ...over,
});

function entity(over: Partial<CurrentEntity> & { id: number }): CurrentEntity {
  return { status: "draft", fields: {}, claims: {}, ...over };
}

function state(opts: {
  cycleFields?: Record<string, string | number | null>;
  cycleClaims?: Record<string, ClaimSnapshot>;
  cycle?: Partial<CurrentCycle>;
  program?: Partial<CurrentProgram>;
  school?: Partial<CurrentSchool>;
  noCycle?: boolean;
  sources?: string[];
}): CurrentState {
  const cycle: CurrentCycle = {
    ...entity({
      id: 30,
      fields: {
        cycle_label: "2026-27",
        entry_year: null,
        deadline_date: "2026-11-01",
        ...opts.cycleFields,
      },
      claims: { deadline_date: claim(), ...opts.cycleClaims },
    }),
    requirements: [],
    prerequisites: [],
    ...opts.cycle,
  };
  const program: CurrentProgram = {
    ...entity({
      id: 20,
      fields: { slug: "perfusion-ms", name: "MS in Perfusion" },
    }),
    cycles: opts.noCycle ? [] : [cycle],
    tuition: [],
    ...opts.program,
  };
  const school: CurrentSchool = {
    ...entity({
      id: 10,
      fields: { slug: "duke", name: "Duke", country: "US" },
    }),
    programs: [program],
    ...opts.school,
  };
  return { school, sourceUrls: new Set(opts.sources ?? [URL_A]) };
}

const of = <T extends PlannedOp["type"]>(plan: ImportPlan, type: T) =>
  plan.ops.filter(
    (op): op is Extract<PlannedOp, { type: T }> => op.type === type,
  );

describe("diffBundle — dry-run planning from an empty database", () => {
  const plan = diffBundle(
    { school: null, sourceUrls: new Set() },
    bundle({
      cycle: {
        entry_year: 2027,
        facts: { ...deadline("2026-11-01"), cas_service: { state: "unknown" } },
        requirements: [
          {
            category: "gpa",
            label: "Minimum GPA",
            value: {
              kind: "number",
              state: "known",
              value: 3,
              citation: { source_url: URL_A, checked_at: CHECKED },
            },
          },
        ],
      },
    }),
  );

  it("creates parents before children, in a stable order", () => {
    const created = of(plan, "create_entity").map(
      (op) => `${op.kind}:${op.path}`,
    );
    expect(created).toEqual([
      "school:duke",
      "program:duke/perfusion-ms",
      "cycle:duke/perfusion-ms@2026-27",
      "requirement:duke/perfusion-ms@2026-27/req:gpa|Minimum GPA",
    ]);
  });

  it("carries every identity key into the create values", () => {
    const values = Object.fromEntries(
      of(plan, "create_entity").map((o) => [o.kind, o.values]),
    );
    expect(values.school).toMatchObject({ slug: "duke", name: "Duke" });
    expect(values.program).toMatchObject({ slug: "perfusion-ms" });
    expect(values.requirement).toMatchObject({ label: "Minimum GPA" });
  });

  it("puts known values in columns and leaves non-known columns unset", () => {
    const cycle = of(plan, "create_entity").find((o) => o.kind === "cycle")!;
    expect(cycle.values).toMatchObject({
      cycle_label: "2026-27",
      entry_year: 2027,
      deadline_date: "2026-11-01",
    });
    expect(cycle.values).not.toHaveProperty("cas_service");
    const req = of(plan, "create_entity").find(
      (o) => o.kind === "requirement",
    )!;
    expect(req.values).toMatchObject({ value_number: 3, category: "gpa" });
  });

  it("creates each cited source exactly once, before its claims", () => {
    const sources = of(plan, "create_source");
    expect(sources.map((s) => s.url)).toEqual([URL_A]);
    const sourceIndex = plan.ops.findIndex((o) => o.type === "create_source");
    const firstClaim = plan.ops.findIndex((o) => o.type === "create_claim");
    expect(sourceIndex).toBeLessThan(firstClaim);
  });

  it("creates one claim per fact, with the right fact state", () => {
    const claims = of(plan, "create_claim").map((c) => [
      c.fieldKey,
      c.claim.state,
    ]);
    expect(claims).toEqual(
      expect.arrayContaining([
        ["deadline_date", "known"],
        ["cas_service", "unknown"],
        ["value_number", "known"],
      ]),
    );
    const known = of(plan, "create_claim").find(
      (c) => c.fieldKey === "deadline_date",
    )!;
    expect(known.claim).toMatchObject({
      sourceUrl: URL_A,
      checkedAt: CHECKED_MS,
      quote: "Due 2026-11-01",
    });
  });

  it("never plans a verified or locked claim", () => {
    for (const op of of(plan, "create_claim")) {
      expect(op.claim).not.toHaveProperty("verification");
      expect(op.claim).not.toHaveProperty("locked");
    }
  });

  it("has no updates or conflicts and renders a printable plan", () => {
    expect(of(plan, "update_entity")).toHaveLength(0);
    expect(of(plan, "skip_protected")).toHaveLength(0);
    expect(summarizePlan(plan)).toMatchObject({ created: 4, conflicts: 0 });
    expect(formatPlan(plan)).toMatch(
      /^CREATE\s+source\s+https:\/\/example\.edu\/apply/m,
    );
    expect(formatPlan(plan)).toMatch(/CONFLICTS 0\s+ERRORS 0/);
  });
});

describe("diffBundle — idempotency", () => {
  it("plans nothing when the database already matches", () => {
    const plan = diffBundle(
      state({}),
      bundle({ cycle: { facts: deadline("2026-11-01") } }),
    );
    expect(plan.ops).toEqual([]);
    expect(isNoop(plan)).toBe(true);
    expect(plan.unchanged).toBeGreaterThan(0);
  });

  it("treats omitted optional claim fields as 'leave alone'", () => {
    const plan = diffBundle(
      state({
        cycleClaims: {
          deadline_date: claim({ note: "keep me", confidence: "high" }),
        },
      }),
      bundle({ cycle: { facts: deadline("2026-11-01") } }),
    );
    expect(plan.ops).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const current = state({});
    const incoming = bundle({ cycle: { facts: deadline("2026-12-01") } });
    const before = JSON.stringify([
      current.school,
      [...current.sourceUrls],
      incoming,
    ]);
    diffBundle(current, incoming);
    expect(
      JSON.stringify([current.school, [...current.sourceUrls], incoming]),
    ).toBe(before);
  });
});

describe("diffBundle — standard updates", () => {
  const plan = diffBundle(
    state({}),
    bundle({ cycle: { facts: deadline("2026-10-15") } }),
  );

  it("updates the value column and the claim of an unprotected fact", () => {
    expect(of(plan, "update_entity")).toEqual([
      expect.objectContaining({
        kind: "cycle",
        id: 30,
        before: { deadline_date: "2026-11-01" },
        after: { deadline_date: "2026-10-15" },
      }),
    ]);
    const [update] = of(plan, "update_claim");
    expect(update!.fieldKey).toBe("deadline_date");
    expect(update!.changes).toEqual({ quote: "Due 2026-10-15" });
    expect(update!.before.verification).toBe("draft");
  });

  it("reports the change in plan-§5 style", () => {
    expect(formatPlan(plan)).toMatch(
      /UPDATE\s+cycle\s+duke\/perfusion-ms@2026-27\s+deadline_date\s+2026-11-01 -> 2026-10-15/,
    );
  });

  it("leaves verification untouched on an unprotected update", () => {
    const stale = diffBundle(
      state({
        cycleClaims: { deadline_date: claim({ verification: "stale" }) },
      }),
      bundle({ cycle: { facts: deadline("2026-10-15") } }),
    );
    expect(of(stale, "skip_protected")).toHaveLength(0);
    expect(of(stale, "update_entity")).toHaveLength(1);
    for (const op of of(stale, "update_claim")) {
      expect(op.changes).not.toHaveProperty("verification");
    }
  });

  it.each(["draft", "needs_review", "stale", "archived"] as const)(
    "does not protect a %s claim",
    (verification) => {
      expect(protectReason(claim({ verification }))).toBeNull();
      const p = diffBundle(
        state({ cycleClaims: { deadline_date: claim({ verification }) } }),
        bundle({ cycle: { facts: deadline("2026-10-15") } }),
      );
      expect(of(p, "update_entity")).toHaveLength(1);
      expect(of(p, "skip_protected")).toHaveLength(0);
    },
  );

  it("moves a known fact to not_published by nulling the column", () => {
    const p = diffBundle(
      state({}),
      bundle({
        cycle: { facts: { deadline_date: { state: "not_published" } } },
      }),
    );
    expect(of(p, "update_entity")[0]).toMatchObject({
      before: { deadline_date: "2026-11-01" },
      after: { deadline_date: null },
    });
    expect(of(p, "update_claim")[0]!.changes.state).toBe("not_published");
  });

  it("creates a claim for a value that has none, without touching an equal value", () => {
    const p = diffBundle(
      state({ cycleClaims: {}, cycle: { claims: {} } }),
      bundle({ cycle: { facts: deadline("2026-11-01") } }),
    );
    expect(of(p, "update_entity")).toHaveLength(0);
    expect(of(p, "create_claim").map((c) => c.fieldKey)).toEqual([
      "deadline_date",
    ]);
  });

  it("creates only the missing source when the claim moves to a new URL", () => {
    const p = diffBundle(
      state({}),
      bundle({
        cycle: { facts: deadline("2026-11-01", "https://example.edu/new") },
      }),
    );
    expect(of(p, "create_source").map((s) => s.url)).toEqual([
      "https://example.edu/new",
    ]);
    expect(of(p, "update_claim")[0]!.changes.sourceUrl).toBe(
      "https://example.edu/new",
    );
  });

  it("creates new children under an existing parent, carrying the parent id", () => {
    const p = diffBundle(
      state({ noCycle: true }),
      bundle({ cycle: { facts: deadline("2026-11-01") } }),
    );
    const [create] = of(p, "create_entity").filter((o) => o.kind === "cycle");
    expect(create).toMatchObject({
      parentId: 20,
      parentPath: "duke/perfusion-ms",
    });
  });

  it("never deletes: absent facts, requirements and cycles are left alone", () => {
    const current = state({
      cycle: {
        requirements: [
          entity({
            id: 40,
            fields: { category: "gpa", label: "Old", value_number: 2 },
          }),
        ],
      },
    });
    const p = diffBundle(current, bundle({ cycle: {} }));
    expect(p.ops).toEqual([]);
  });

  it("updates a plain field", () => {
    const p = diffBundle(
      state({}),
      bundle({ schoolName: "Duke University", cycle: {} }),
    );
    expect(of(p, "update_entity")[0]).toMatchObject({
      kind: "school",
      before: { name: "Duke" },
      after: { name: "Duke University" },
    });
  });
});

describe("diffBundle — conflict protection", () => {
  const incoming = bundle({ cycle: { facts: deadline("2026-10-15") } });

  it.each<[string, Partial<ClaimSnapshot>]>([
    ["verified", { verification: "verified" }],
    ["locked", { locked: true }],
    ["verified_and_locked", { verification: "verified", locked: true }],
  ])(
    "skips a %s claim and records a conflict instead of a write",
    (reason, over) => {
      const plan = diffBundle(
        state({ cycleClaims: { deadline_date: claim(over) } }),
        incoming,
      );
      expect(of(plan, "update_entity")).toHaveLength(0);
      expect(of(plan, "update_claim")).toHaveLength(0);
      expect(of(plan, "create_claim")).toHaveLength(0);
      const [skip] = of(plan, "skip_protected");
      expect(skip).toMatchObject({
        reason,
        fieldKey: "deadline_date",
        subject: { kind: "cycle", id: 30 },
      });
      expect(skip!.current).toMatchObject({
        value: "2026-11-01",
        verification: over.verification ?? "draft",
        locked: over.locked ?? false,
      });
      expect(skip!.proposed).toMatchObject({
        value: "2026-10-15",
        state: "known",
        source_url: URL_A,
        checked_at: CHECKED,
      });
      expect(formatPlan(plan)).toMatch(
        new RegExp(
          `SKIP\\s+claim\\s+application_cycles:.*reason=${reason}\\s+\\(proposed 2026-10-15, current 2026-11-01\\)`,
        ),
      );
      expect(summarizePlan(plan).conflicts).toBe(1);
    },
  );

  it("is not a conflict when the proposal equals the protected state", () => {
    const plan = diffBundle(
      state({
        cycleClaims: { deadline_date: claim({ verification: "verified" }) },
      }),
      bundle({ cycle: { facts: deadline("2026-11-01") } }),
    );
    expect(plan.ops).toEqual([]);
  });

  it("is a conflict when only the claim's evidence differs", () => {
    const plan = diffBundle(
      state({ cycleClaims: { deadline_date: claim({ locked: true }) } }),
      bundle({
        cycle: {
          facts: {
            deadline_date: {
              state: "known",
              value: "2026-11-01",
              citation: {
                source_url: URL_A,
                checked_at: "2026-09-15",
                quote: "Due 2026-11-01",
              },
            },
          },
        },
      }),
    );
    expect(of(plan, "skip_protected")).toHaveLength(1);
    expect(of(plan, "update_claim")).toHaveLength(0);
  });

  it("protects the other facts' neighbours independently", () => {
    const plan = diffBundle(
      state({
        cycleClaims: {
          deadline_date: claim({ verification: "verified" }),
          cas_service: claim({ state: "unknown" }),
        },
        cycleFields: { cas_service: null },
      }),
      bundle({
        cycle: {
          facts: {
            ...deadline("2026-10-15"),
            cas_service: {
              state: "known",
              value: "CASPA",
              citation: { source_url: URL_A, checked_at: CHECKED },
            },
          },
        },
      }),
    );
    expect(of(plan, "skip_protected").map((o) => o.fieldKey)).toEqual([
      "deadline_date",
    ]);
    expect(of(plan, "update_entity")[0]!.after).toEqual({
      cas_service: "CASPA",
    });
  });

  it("does not create a source for a skipped claim", () => {
    const plan = diffBundle(
      state({ cycleClaims: { deadline_date: claim({ locked: true }) } }),
      bundle({
        cycle: { facts: deadline("2026-10-15", "https://example.edu/other") },
      }),
    );
    expect(of(plan, "create_source")).toHaveLength(0);
  });

  it("protects a plain column when a protected claim shares its field key", () => {
    const current = state({
      school: {
        claims: { name: claim({ verification: "verified", state: "known" }) },
      },
    });
    const plan = diffBundle(
      current,
      bundle({ schoolName: "Duke University", cycle: {} }),
    );
    expect(of(plan, "update_entity")).toHaveLength(0);
    expect(of(plan, "skip_protected")[0]).toMatchObject({
      fieldKey: "name",
      subject: { kind: "school" },
      proposed: { value: "Duke University" },
    });
  });

  it("does not duplicate a conflict that is already pending", () => {
    const first = diffBundle(
      state({ cycleClaims: { deadline_date: claim({ locked: true }) } }),
      incoming,
    );
    const proposed = of(first, "skip_protected")[0]!.proposed;
    const second = diffBundle(
      {
        ...state({ cycleClaims: { deadline_date: claim({ locked: true }) } }),
      },
      incoming,
    );
    expect(of(second, "skip_protected")).toHaveLength(1);

    const withPending = state({
      cycleClaims: { deadline_date: claim({ locked: true }) },
      cycle: { pendingConflicts: { deadline_date: [proposed] } },
    });
    const third = diffBundle(withPending, incoming);
    expect(third.ops).toEqual([]);

    const different = diffBundle(
      state({
        cycleClaims: { deadline_date: claim({ locked: true }) },
        cycle: { pendingConflicts: { deadline_date: [proposed] } },
      }),
      bundle({ cycle: { facts: deadline("2026-12-31") } }),
    );
    expect(of(different, "skip_protected")).toHaveLength(1);
  });
});

describe("diffBundle — whole-record rows", () => {
  const prereq = (min_credits: number, checked = CHECKED) => ({
    prerequisites: [
      {
        subject: "Chemistry",
        min_credits,
        citation: { source_url: URL_A, checked_at: checked },
      },
    ],
  });
  const existingPrereq = (claims: Record<string, ClaimSnapshot>) =>
    entity({
      id: 50,
      fields: {
        subject: "Chemistry",
        min_credits: 8,
        lab_required: null,
        min_grade: null,
        recency_years: null,
        notes: null,
        sort_order: 0,
      },
      claims,
    });
  const recordClaim = (over: Partial<ClaimSnapshot> = {}) =>
    claim({ quote: null, ...over });

  it("updates the row and its record claim when unprotected", () => {
    const plan = diffBundle(
      state({
        cycle: { prerequisites: [existingPrereq({ record: recordClaim() })] },
      }),
      bundle({ cycle: prereq(4) }),
    );
    expect(of(plan, "update_entity")[0]).toMatchObject({
      kind: "prerequisite",
      before: { min_credits: 8 },
      after: { min_credits: 4 },
    });
  });

  it("skips the whole row when its record claim is verified", () => {
    const plan = diffBundle(
      state({
        cycle: {
          prerequisites: [
            existingPrereq({
              record: recordClaim({ verification: "verified" }),
            }),
          ],
        },
      }),
      bundle({ cycle: prereq(4) }),
    );
    expect(of(plan, "update_entity")).toHaveLength(0);
    expect(of(plan, "skip_protected")[0]).toMatchObject({
      fieldKey: "record",
      reason: "verified",
      proposed: { fields: { min_credits: 4 } },
      current: { fields: { min_credits: 8 } },
    });
  });

  it("reports a matching record as unchanged", () => {
    const plan = diffBundle(
      state({
        cycle: {
          prerequisites: [
            existingPrereq({
              record: recordClaim({ verification: "verified" }),
            }),
          ],
        },
      }),
      bundle({ cycle: prereq(8) }),
    );
    expect(plan.ops).toEqual([]);
  });
});

describe("diffBundle — archived rows", () => {
  it("never writes to an archived program or its children", () => {
    const plan = diffBundle(
      state({ program: { status: "archived" } }),
      bundle({ cycle: { facts: deadline("2026-10-15") } }),
    );
    expect(plan.ops).toEqual([
      { type: "skip_archived", kind: "program", path: "duke/perfusion-ms" },
    ]);
    expect(isNoop(plan)).toBe(true);
    expect(writeOps(plan)).toEqual([]);
  });
});
