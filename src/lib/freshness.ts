const DEFAULT_STALE_AFTER_DAYS = 180;

/** Parse an env override; anything but a positive finite number → 180. */
export function parseStaleAfterDays(raw: string | undefined): number {
  const value = Number(raw);
  return raw !== undefined &&
    raw.trim() !== "" &&
    Number.isFinite(value) &&
    value > 0
    ? value
    : DEFAULT_STALE_AFTER_DAYS;
}

export const STALE_AFTER_DAYS = parseStaleAfterDays(
  process.env.STALE_AFTER_DAYS,
);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isStale(
  checkedAt: Date | null,
  now: Date,
  staleAfterDays: number,
): boolean {
  if (checkedAt === null) {
    return true;
  }

  const ageMs = now.getTime() - checkedAt.getTime();
  return ageMs > staleAfterDays * MS_PER_DAY;
}
