/**
 * Money-safe rounding, shared across the domain core.
 *
 * This is the reference implementation the Python core mirrors
 * (backend/app/shared/domain/rounding.py) so both languages agree to the cent.
 * It is `round2` from the original prototype, unchanged.
 */

/** Round to 2 decimals, half rounding up (JS `Math.round` semantics). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
