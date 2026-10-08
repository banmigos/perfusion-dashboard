export function formatMonths(months: number): string {
  return `${months} mo`;
}

export function formatGpa(gpa: number): string {
  return gpa.toFixed(2);
}

/** Whole dollars when exact, otherwise cents. Money is stored as integer cents. */
export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
