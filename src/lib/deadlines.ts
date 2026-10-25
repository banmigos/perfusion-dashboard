/**
 * Calendar-date arithmetic for deadlines. Deadlines are stored as TEXT
 * `YYYY-MM-DD` (CLAUDE.md), so "today" is also resolved to a calendar date in
 * the app's time zone before comparing; nothing here touches epoch instants.
 */

export const APPLICATION_STATUS_LABEL = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  interview: "Interview",
  decision: "Decision",
} as const;

export type ApplicationStatus = keyof typeof APPLICATION_STATUS_LABEL;

/** A deadline this close, on an application not yet submitted, is at risk. */
export const AT_RISK_DAYS = 14;
/** The overview's countdown strip spans this many days from today. */
export const HORIZON_DAYS = 120;

/**
 * Today's calendar date in `timeZone` (default: `APP_TIME_ZONE`, else the
 * process zone). A container usually runs in UTC, which would roll the date
 * over at 7–8 pm Eastern; `APP_TIME_ZONE` pins it to where the user lives.
 */
export function todayIso(now: Date, timeZone?: string): string {
  const zone = timeZone ?? (process.env.APP_TIME_ZONE || undefined);
  // en-CA formats as YYYY-MM-DD.
  const format = (z: string | undefined) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: z,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  try {
    return format(zone);
  } catch {
    // An invalid zone (e.g. an unreplaced placeholder) must not take every
    // page down; fall back to the process zone.
    return format(undefined);
  }
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

/** Whole calendar days from `fromIso` to `toIso` (negative when past). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(isoToUtcMs(iso) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Epoch-ms checklist due dates are stored at UTC midnight of their calendar day. */
export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isSubmitted(status: ApplicationStatus | null): boolean {
  return (
    status === "submitted" || status === "interview" || status === "decision"
  );
}

export type Urgency =
  /** Tracked, not submitted, deadline has passed. */
  | "missed"
  /** Tracked, not submitted, deadline within AT_RISK_DAYS. */
  | "at_risk"
  /** Deadline ahead with time to spare, or the program is not tracked. */
  | "open"
  /** Application is in; the deadline no longer threatens it. */
  | "clear"
  /** Not tracked and the deadline has passed. */
  | "closed"
  /** No deadline on record. */
  | "undated";

/**
 * `status` is null for a program that is not being tracked. Untracked
 * programs never become "at risk": risk is about applications in flight.
 */
export function urgencyOf(
  deadline: string | null,
  status: ApplicationStatus | null,
  today: string,
): Urgency {
  if (deadline === null) return "undated";
  if (isSubmitted(status)) return "clear";
  const days = daysBetween(today, deadline);
  if (status === null) return days < 0 ? "closed" : "open";
  if (days < 0) return "missed";
  if (days <= AT_RISK_DAYS) return "at_risk";
  return "open";
}

/** "today", "tomorrow", "in 7 days", "3 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Nov 1" — or "Nov 1, 2027" when the year differs from `today`'s. */
export function shortDate(iso: string, today?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = `${MONTHS[m! - 1]} ${d}`;
  return today && today.slice(0, 4) !== String(y) ? `${base}, ${y}` : base;
}

export function monthLabel(iso: string): string {
  const [, m] = iso.split("-").map(Number);
  return MONTHS[m! - 1]!;
}
