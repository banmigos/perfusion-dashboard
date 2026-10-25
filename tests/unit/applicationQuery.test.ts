import { describe, expect, it } from "vitest";
import {
  matchesQuery,
  parseApplicationQuery,
  programsHref,
  sortRows,
  type QueryableRow,
} from "@/lib/applicationQuery";

const today = "2026-10-25";

function row(
  schoolName: string,
  deadline: string | null,
  status: QueryableRow["saved"] = null,
  extra: Partial<QueryableRow> = {},
): QueryableRow {
  return {
    schoolName,
    deadline: { value: deadline },
    saved: status,
    progress: { done: 0, total: 0 },
    numbers: { lengthMonths: null, classSize: null },
    ...extra,
  };
}

describe("parseApplicationQuery", () => {
  it("falls back to defaults on junk input", () => {
    expect(
      parseApplicationQuery({
        view: "grid",
        status: "x",
        sort: "y",
        dir: "up",
      }),
    ).toEqual({
      view: "table",
      status: "all",
      due: "all",
      sort: "deadline",
      dir: "asc",
    });
  });

  it("accepts valid values", () => {
    expect(
      parseApplicationQuery({ view: "board", status: "submitted", due: "30" }),
    ).toMatchObject({ view: "board", status: "submitted", due: "30" });
  });
});

describe("matchesQuery", () => {
  const tracked = row("A", "2026-11-01", { status: "in_progress" });
  const untracked = row("B", "2026-10-01");
  const undated = row("C", null);

  it("filters by tracking and by exact status", () => {
    const q = { due: "all" } as const;
    expect(matchesQuery(tracked, { ...q, status: "tracking" }, today)).toBe(
      true,
    );
    expect(matchesQuery(untracked, { ...q, status: "tracking" }, today)).toBe(
      false,
    );
    expect(matchesQuery(untracked, { ...q, status: "untracked" }, today)).toBe(
      true,
    );
    expect(matchesQuery(tracked, { ...q, status: "in_progress" }, today)).toBe(
      true,
    );
    expect(matchesQuery(tracked, { ...q, status: "submitted" }, today)).toBe(
      false,
    );
  });

  it("filters by deadline window", () => {
    const q = { status: "all" } as const;
    expect(matchesQuery(tracked, { ...q, due: "30" }, today)).toBe(true);
    expect(matchesQuery(untracked, { ...q, due: "30" }, today)).toBe(false);
    expect(matchesQuery(untracked, { ...q, due: "passed" }, today)).toBe(true);
    expect(matchesQuery(undated, { ...q, due: "none" }, today)).toBe(true);
    expect(matchesQuery(undated, { ...q, due: "90" }, today)).toBe(false);
  });
});

describe("sortRows", () => {
  const rows = [
    row("Passed", "2026-10-01"),
    row("Undated", null),
    row("Later", "2027-01-15"),
    row("Soon", "2026-11-01"),
  ];

  it("puts upcoming deadlines first, then passed, then undated", () => {
    expect(
      sortRows(rows, "deadline", "asc", today).map((r) => r.schoolName),
    ).toEqual(["Soon", "Later", "Passed", "Undated"]);
  });

  it("keeps missing values last when descending", () => {
    expect(
      sortRows(rows, "deadline", "desc", today).map((r) => r.schoolName),
    ).toEqual(["Passed", "Later", "Soon", "Undated"]);
  });

  it("sorts by pipeline stage with untracked last", () => {
    const staged = [
      row("U", null),
      row("S", null, { status: "submitted" }),
      row("N", null, { status: "not_started" }),
    ];
    expect(
      sortRows(staged, "status", "asc", today).map((r) => r.schoolName),
    ).toEqual(["N", "S", "U"]);
  });
});

describe("programsHref", () => {
  it("omits defaults and keeps overrides", () => {
    expect(programsHref({ view: "table", sort: "deadline" })).toBe("/programs");
    expect(
      programsHref(
        { q: "utah", status: "all" },
        { sort: "school", dir: "desc" },
      ),
    ).toBe("/programs?q=utah&sort=school&dir=desc");
  });
});
