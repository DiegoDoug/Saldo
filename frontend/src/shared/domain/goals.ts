/**
 * Pure, framework-free goal math — the TS mirror of
 * `backend/app/shared/domain/goals.py`. Both cores must agree on the same
 * numbers and dates (the mirrored tests assert identical values).
 *
 * Dates are ISO `YYYY-MM-DD` strings (never `Date` objects) to avoid timezone
 * drift — a completion date is a calendar day, not an instant.
 */

export function progress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, current / target));
}

export function remainingAmount(current: number, target: number): number {
  return Math.max(0, target - current);
}

/**
 * Whole months of contributions still required. 0 when already met, null when
 * unreachable (monthly <= 0 while still short).
 */
export function monthsRemaining(current: number, target: number, monthly: number): number | null {
  const remaining = remainingAmount(current, target);
  if (remaining <= 0) return 0;
  if (monthly <= 0) return null;
  return Math.ceil(remaining / monthly);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const day = Math.min(d, daysInMonth(year, month)); // clamp (Jan 31 → Feb 28)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Estimated ISO date the goal is reached, or null if unreachable. */
export function completionDate(
  today: string,
  current: number,
  target: number,
  monthly: number,
): string | null {
  const months = monthsRemaining(current, target, monthly);
  if (months === null) return null;
  return addMonths(today, months);
}
