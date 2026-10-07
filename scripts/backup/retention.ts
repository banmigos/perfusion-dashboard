export const BACKUP_FILE_RE =
  /^app-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.db\.gz$/;

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  daily: 14,
  weekly: 8,
  monthly: 12,
};

export interface RetentionResult {
  keep: string[];
  prune: string[];
}

interface ParsedBackup {
  name: string;
  /** Sortable minute-resolution stamp, `YYYYMMDDHHMM`. */
  stamp: string;
  day: string;
  week: string;
  month: string;
}

/** Local-time stamp used in backup file names: `YYYYMMDD-HHMM`. */
export function formatBackupStamp(date: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(date.getFullYear(), 4)}${p(date.getMonth() + 1)}${p(date.getDate())}` +
    `-${p(date.getHours())}${p(date.getMinutes())}`
  );
}

/** Monday-based week key (`YYYY-MM-DD` of that Monday), calendar-only math. */
function weekKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

function parse(name: string): ParsedBackup | null {
  const m = BACKUP_FILE_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m as unknown as [string, ...string[]];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (Number(h) > 23 || Number(mi) > 59) return null;
  return {
    name,
    stamp: `${y}${mo}${d}${h}${mi}`,
    day: `${y}${mo}${d}`,
    week: weekKey(year, month, day),
    month: `${y}${mo}`,
  };
}

/**
 * Decides which backups survive. For each tier, the newest backup in each of
 * the N most recent buckets (days / ISO weeks / months *that have backups*)
 * is kept; a backup kept by any tier is kept. Pure: names in, names out.
 * Names that are not `app-YYYYMMDD-HHMM.db.gz` are ignored entirely — they
 * are never listed as keep or prune, so the caller can never delete them.
 */
export function selectRetention(
  names: readonly string[],
  policy: RetentionPolicy = DEFAULT_RETENTION,
): RetentionResult {
  const backups = names
    .map(parse)
    .filter((b): b is ParsedBackup => b !== null)
    .sort(
      (a, b) => b.stamp.localeCompare(a.stamp) || b.name.localeCompare(a.name),
    );

  const keep = new Set<string>();
  const tiers: [keyof ParsedBackup, number][] = [
    ["day", policy.daily],
    ["week", policy.weekly],
    ["month", policy.monthly],
  ];
  for (const [key, limit] of tiers) {
    const seen = new Set<string>();
    for (const b of backups) {
      const bucket = b[key];
      if (seen.has(bucket)) continue;
      if (seen.size >= limit) break;
      seen.add(bucket);
      keep.add(b.name);
    }
  }

  return {
    keep: backups.filter((b) => keep.has(b.name)).map((b) => b.name),
    prune: backups.filter((b) => !keep.has(b.name)).map((b) => b.name),
  };
}
