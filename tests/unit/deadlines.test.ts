import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  relativeDays,
  shortDate,
  todayIso,
  urgencyOf,
} from "@/lib/deadlines";

describe("todayIso", () => {
  it("resolves the calendar date in the given zone, not UTC", () => {
    // 01:30 UTC on Oct 26 is still the evening of Oct 25 in New York.
    const now = new Date("2026-10-26T01:30:00Z");
    expect(todayIso(now, "America/New_York")).toBe("2026-10-25");
    expect(todayIso(now, "UTC")).toBe("2026-10-26");
  });

  it("falls back to the process zone on an invalid zone instead of throwing", () => {
    const now = new Date("2026-10-26T01:30:00Z");
    expect(todayIso(now, "<IANA_TIME_ZONE>")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("daysBetween / addDays", () => {
  it("counts whole calendar days across a DST change", () => {
    expect(daysBetween("2026-10-25", "2026-11-01")).toBe(7);
    expect(daysBetween("2026-11-01", "2026-10-25")).toBe(-7);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("round-trips with addDays", () => {
    expect(addDays("2026-10-25", 120)).toBe("2027-02-22");
    expect(daysBetween("2026-10-25", addDays("2026-10-25", 120))).toBe(120);
  });
});

describe("urgencyOf", () => {
  const today = "2026-10-25";

  it("flags a tracked, unsubmitted application inside two weeks", () => {
    expect(urgencyOf("2026-11-01", "not_started", today)).toBe("at_risk");
    expect(urgencyOf("2026-11-08", "in_progress", today)).toBe("at_risk");
    expect(urgencyOf("2026-11-09", "in_progress", today)).toBe("open");
  });

  it("marks a passed deadline missed only when tracked and unsubmitted", () => {
    expect(urgencyOf("2026-10-01", "in_progress", today)).toBe("missed");
    expect(urgencyOf("2026-10-01", null, today)).toBe("closed");
    expect(urgencyOf("2026-10-01", "submitted", today)).toBe("clear");
  });

  it("never puts an untracked program at risk", () => {
    expect(urgencyOf("2026-10-26", null, today)).toBe("open");
  });

  it("keeps undated distinct", () => {
    expect(urgencyOf(null, "in_progress", today)).toBe("undated");
  });
});

describe("formatting", () => {
  it("phrases relative days", () => {
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(7)).toBe("in 7 days");
    expect(relativeDays(-3)).toBe("3 days ago");
  });

  it("adds the year only when it differs from today's", () => {
    expect(shortDate("2026-11-01", "2026-10-25")).toBe("Nov 1");
    expect(shortDate("2027-01-15", "2026-10-25")).toBe("Jan 15, 2027");
  });
});
