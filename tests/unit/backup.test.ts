import { describe, expect, it } from "vitest";
import {
  formatBackupStamp,
  selectRetention,
} from "../../scripts/backup/retention";

const name = (y: number, m: number, d: number, h = 3, mi = 0) =>
  `app-${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}-${String(h).padStart(2, "0")}${String(mi).padStart(2, "0")}.db.gz`;

/** One backup per day for `count` days ending on 2026-10-07 (UTC calendar math). */
function dailyRun(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(2026, 9, 7 - i));
    out.push(name(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  }
  return out;
}

describe("formatBackupStamp", () => {
  it("formats local time as YYYYMMDD-HHMM", () => {
    expect(formatBackupStamp(new Date(2026, 0, 5, 7, 9))).toBe("20260105-0709");
  });
});

describe("selectRetention", () => {
  it("keeps everything when under every limit", () => {
    const files = dailyRun(5);
    const { keep, prune } = selectRetention(files);
    expect(keep).toHaveLength(5);
    expect(prune).toEqual([]);
  });

  it("keeps the newest 14 days and prunes the rest of a 60-day run down to the weekly/monthly picks", () => {
    const files = dailyRun(60);
    const { keep } = selectRetention(files);
    for (const f of dailyRun(14)) expect(keep).toContain(f);
    // Oldest file (2026-08-09) is neither in the 14 days, the 8 newest weeks, nor 12 months' newest.
    expect(keep).not.toContain(files[59]);
    expect(keep.length).toBeLessThan(60);
  });

  it("keeps only the newest backup of a day beyond the daily tier's reach", () => {
    const files = [
      name(2026, 10, 7, 3),
      name(2026, 10, 7, 15),
      name(2026, 10, 6, 3),
    ];
    const { keep } = selectRetention(files, {
      daily: 1,
      weekly: 0,
      monthly: 0,
    });
    expect(keep).toEqual([name(2026, 10, 7, 15)]);
  });

  it("applies the weekly tier using Monday-based weeks", () => {
    // 2026-10-04 is a Sunday, 2026-10-05 a Monday: different weeks.
    const files = [name(2026, 10, 5), name(2026, 10, 4), name(2026, 10, 3)];
    const { keep, prune } = selectRetention(files, {
      daily: 0,
      weekly: 2,
      monthly: 0,
    });
    // Newest of week of 10-05 and newest of week of 09-28 (10-04).
    expect(keep).toEqual([name(2026, 10, 5), name(2026, 10, 4)]);
    expect(prune).toEqual([name(2026, 10, 3)]);
  });

  it("keeps one backup per month for 12 months and no more", () => {
    const files: string[] = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date(Date.UTC(2026, 9 - i, 1));
      files.push(name(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    const { keep } = selectRetention(files, {
      daily: 0,
      weekly: 0,
      monthly: 12,
    });
    expect(keep).toHaveLength(12);
    expect(keep).not.toContain(files[12]);
  });

  it("unions tiers: a backup kept by any tier survives", () => {
    const { keep } = selectRetention(dailyRun(40));
    // 14 daily + older weekly picks + monthly picks, but never more than input.
    expect(keep.length).toBeGreaterThan(14);
    expect(new Set(keep).size).toBe(keep.length);
  });

  it("ignores names that are not backups, so they can never be pruned", () => {
    const stray = [
      "notes.txt",
      "app-20261007-0300.db", // uncompressed leftover from a failed run
      "app-20261007-0300.db.gz.partial",
      "app-20261399-0300.db.gz", // impossible date
    ];
    const { keep, prune } = selectRetention([...stray, name(2026, 10, 7)]);
    expect(keep).toEqual([name(2026, 10, 7)]);
    expect(prune).toEqual([]);
  });

  it("is order-independent", () => {
    const files = dailyRun(50);
    const a = selectRetention(files);
    const b = selectRetention([...files].reverse());
    expect(b).toEqual(a);
  });
});
