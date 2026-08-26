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
