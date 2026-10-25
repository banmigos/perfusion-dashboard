import { z } from "zod";
import { APPLICATION_STATUSES } from "@/db/schema/personal";
import { daysBetween, type ApplicationStatus } from "./deadlines";

/**
 * URL-driven filter and sort state for the programs views. Everything lives
 * in search params so a filtered view is linkable and the back button works.
 */

export const VIEWS = ["table", "board", "map"] as const;
export const STATUS_FILTERS = [
  "all",
  "tracking",
  "untracked",
  ...APPLICATION_STATUSES,
] as const;
export const DUE_FILTERS = ["all", "30", "90", "passed", "none"] as const;
export const SORT_KEYS = [
  "deadline",
  "school",
  "status",
  "checklist",
  "length",
  "class",
] as const;

export type View = (typeof VIEWS)[number];
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type DueFilter = (typeof DUE_FILTERS)[number];
export type SortKey = (typeof SORT_KEYS)[number];

export type ApplicationQuery = {
  view: View;
  status: StatusFilter;
  due: DueFilter;
  sort: SortKey;
  dir: "asc" | "desc";
};

type Params = Record<string, string | string[] | undefined>;

function pick<T extends readonly string[]>(
  values: T,
  raw: string | string[] | undefined,
  fallback: T[number],
): T[number] {
  const parsed = z.enum(values).safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export function parseApplicationQuery(params: Params): ApplicationQuery {
  return {
    view: pick(VIEWS, params.view, "table"),
    status: pick(STATUS_FILTERS, params.status, "all"),
    due: pick(DUE_FILTERS, params.due, "all"),
    sort: pick(SORT_KEYS, params.sort, "deadline"),
    dir: params.dir === "desc" ? "desc" : "asc",
  };
}

/** The fields filtering and sorting read; ApplicationRow satisfies it. */
export type QueryableRow = {
  schoolName: string;
  deadline: { value: string | null };
  saved: { status: ApplicationStatus } | null;
  progress: { done: number; total: number };
  /** Raw numbers for sorting; display goes through the claim-aware fields. */
  numbers: { lengthMonths: number | null; classSize: number | null };
};

export function matchesQuery(
  row: QueryableRow,
  query: Pick<ApplicationQuery, "status" | "due">,
  today: string,
): boolean {
  const status = row.saved?.status ?? null;
  if (query.status === "tracking" && status === null) return false;
  if (query.status === "untracked" && status !== null) return false;
  if (
    query.status !== "all" &&
    query.status !== "tracking" &&
    query.status !== "untracked" &&
    status !== query.status
  ) {
    return false;
  }

  const deadline = row.deadline.value;
  if (query.due === "none") return deadline === null;
  if (query.due === "all") return true;
  if (deadline === null) return false;
  const days = daysBetween(today, deadline);
  if (query.due === "passed") return days < 0;
  return days >= 0 && days <= Number(query.due);
}

const STAGE = Object.fromEntries(APPLICATION_STATUSES.map((s, i) => [s, i]));

/**
 * Missing values always sort last in either direction. For deadlines the
 * natural order is "soonest first": upcoming dates ascending, then dates
 * already passed, so a closed program never crowds out an open one.
 */
export function sortRows<T extends QueryableRow>(
  rows: T[],
  sort: SortKey,
  dir: "asc" | "desc",
  today: string,
): T[] {
  const sign = dir === "asc" ? 1 : -1;

  const key = (r: T): number | string | null => {
    switch (sort) {
      case "school":
        return r.schoolName.toLowerCase();
      case "status":
        return r.saved ? STAGE[r.saved.status]! : null;
      case "checklist":
        return r.progress.total === 0
          ? null
          : r.progress.done / r.progress.total;
      case "length":
        return r.numbers.lengthMonths;
      case "class":
        return r.numbers.classSize;
      case "deadline": {
        if (r.deadline.value === null) return null;
        const days = daysBetween(today, r.deadline.value);
        // Passed deadlines rank after every upcoming one.
        return days >= 0 ? days : 100_000 - days;
      }
    }
  };

  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb === null)
      return a.schoolName.localeCompare(b.schoolName);
    if (ka === null) return 1;
    if (kb === null) return -1;
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return a.schoolName.localeCompare(b.schoolName);
  });
}

/** Builds a /programs href from the current state plus overrides. */
export function programsHref(
  base: Partial<ApplicationQuery> & { q?: string; credential?: string },
  overrides: Partial<ApplicationQuery> = {},
): string {
  const merged = { ...base, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.credential) params.set("credential", merged.credential);
  if (merged.status && merged.status !== "all")
    params.set("status", merged.status);
  if (merged.due && merged.due !== "all") params.set("due", merged.due);
  if (merged.sort && merged.sort !== "deadline")
    params.set("sort", merged.sort);
  if (merged.dir === "desc") params.set("dir", "desc");
  if (merged.view && merged.view !== "table") params.set("view", merged.view);
  const qs = params.toString();
  return qs ? `/programs?${qs}` : "/programs";
}
