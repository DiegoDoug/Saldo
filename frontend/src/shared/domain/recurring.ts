/**
 * Pure, framework-free recurrence math — the TS mirror of
 * `backend/app/shared/domain/recurring.py`. Both cores must agree on the same
 * dates and the same deterministic occurrence ids (the mirrored tests assert
 * identical literals).
 *
 * Dates are handled as ISO `YYYY-MM-DD` strings (never `Date` objects) to avoid
 * timezone drift — recurrence is a calendar concept, not an instant.
 */

export type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

const MONTHS_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

function parse(iso: string): Ymd {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function format({ y, m, d }: Ymd): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return format({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const day = Math.min(d, daysInMonth(year, month)); // clamp (Jan 31 → Feb 28)
  return format({ y: year, m: month, d: day });
}

export function advance(iso: string, frequency: Frequency, interval = 1): string {
  const step = interval < 1 ? 1 : interval;
  switch (frequency) {
    case "daily":
      return addDays(iso, step);
    case "weekly":
      return addDays(iso, 7 * step);
    case "biweekly":
      return addDays(iso, 14 * step);
    default: {
      const months = MONTHS_STEP[frequency];
      if (months === undefined) throw new Error(`Unknown frequency: ${frequency}`);
      return addMonths(iso, months * step);
    }
  }
}

export function occurrencesBetween(
  start: string,
  frequency: Frequency,
  interval: number,
  rangeStart: string,
  rangeEnd: string,
  endDate?: string | null,
): string[] {
  const out: string[] = [];
  let current = start;
  let guard = 0;
  while (current <= rangeEnd && guard < 10_000) {
    if (endDate && current > endDate) break;
    if (current >= rangeStart) out.push(current);
    current = advance(current, frequency, interval);
    guard += 1;
  }
  return out;
}

// --- Deterministic occurrence id (FNV-1a, mirrors the Python core) ------
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

function fnv1a64(data: string): bigint {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(data);
  for (const byte of bytes) {
    h = ((h ^ BigInt(byte)) * FNV_PRIME) & MASK64;
  }
  return h;
}

/** Deterministic UUID-format id for a rule's occurrence on `isoDate`. */
export function occurrenceId(ruleId: string, isoDate: string): string {
  const base = `${ruleId}:${isoDate}`;
  const hi = fnv1a64(base);
  const lo = fnv1a64(`${base}#saldo`);
  const hex = (hi.toString(16).padStart(16, "0") + lo.toString(16).padStart(16, "0")).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
