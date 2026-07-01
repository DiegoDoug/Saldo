/**
 * Display formatters. Kept out of the domain core (which deals in raw numbers)
 * so locale/currency presentation is a UI concern, matching the prototype's
 * `eur()` helper.
 */

/** Format an amount as a currency string (default EUR, es-ES locale). */
export function formatMoney(amount: number, currency = "EUR", locale = "es-ES"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    Number.isFinite(amount) ? amount : 0,
  );
}

/**
 * Parse a user-typed amount into a non-negative number, tolerating the
 * European "1.234,56" grouping/decimal style (ported from the prototype's
 * `parseAmount`).
 */
export function parseAmount(raw: string | number | null | undefined): number {
  if (raw === "" || raw == null) return 0;
  const cleaned = String(raw)
    .replace(/\s|€/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
