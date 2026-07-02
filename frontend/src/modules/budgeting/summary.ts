/**
 * UI-layer derivations from a computed year: presentation rounding and the
 * "nothing recorded yet" check. Deliberately separate from
 * shared/domain/budgeting.ts — that file mirrors the Python core number for
 * number, whereas these are display concerns (rounded percent, empty state).
 */

import type { LocalCategory, LocalEntry } from "../../db/db";
import type { YearResult } from "../../shared/domain/budgeting";

/** Savings as a whole-number percent of income (0 when there is no income). */
export function savingsRatePct(calc: YearResult): number {
  return calc.incomeTotal > 0 ? Math.round((calc.savingsTotal / calc.incomeTotal) * 100) : 0;
}

/** True when the year has no income, expenses, or savings goal recorded yet. */
export function isYearEmpty(calc: YearResult): boolean {
  return calc.incomeTotal === 0 && calc.expensesTotal === 0 && calc.goalTotal === 0;
}

export interface RankedCategory {
  id: string;
  name: string;
  kind: "fixed" | "variable";
  total: number;
}

/** Sum each fixed/variable category's live entries for the year, drop the ones
 * with no spending, and rank the rest from highest total to lowest. */
export function rankCategories(
  categories: LocalCategory[],
  entries: LocalEntry[],
): RankedCategory[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.deleted === 0 && e.categoryId && (e.kind === "fixed" || e.kind === "variable")) {
      totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + e.amount);
    }
  }
  return categories
    .filter((c): c is LocalCategory & { kind: "fixed" | "variable" } =>
      c.kind === "fixed" || c.kind === "variable",
    )
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind, total: totals.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}
