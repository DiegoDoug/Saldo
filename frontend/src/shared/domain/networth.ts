/**
 * Pure, framework-free net-worth math — the TS mirror of
 * `backend/app/shared/domain/networth.py`. Both cores must agree on the same
 * numbers (the mirrored tests assert identical values).
 */

export function netWorth(assetsTotal: number, liabilitiesTotal: number): number {
  return assetsTotal - liabilitiesTotal;
}

/** Fractional change from `previous` to `current`; null when previous is 0. */
export function growth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Each positive bucket's share of the total (fractions in [0, 1]). */
export function allocation(buckets: Record<string, number>): Record<string, number> {
  const total = Object.values(buckets).reduce((s, v) => (v > 0 ? s + v : s), 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(buckets)) {
    out[k] = total > 0 && v > 0 ? v / total : 0;
  }
  return out;
}
