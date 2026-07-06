/**
 * Budgeting domain core — the actual product, ported from the prototype.
 *
 * Framework-free: no React, no fetch, no storage. These are the
 * reverse-engineered spreadsheet rules from reference/Presupuesto.tsx, kept
 * faithful to the original arithmetic. The Python core mirrors this file
 * (backend/app/shared/domain/budgeting.py) and both are tested against the same
 * expected numbers.
 *
 * Per month:
 *   incomeTotal       = nomina + otros + Σ extras
 *   canSpend          = incomeTotal - savingsGoal
 *   expensesTotal     = Σ fixed + Σ variable
 *   endOfMonthSavings = incomeTotal - expensesTotal
 *   overspend         = expensesTotal > canSpend, but only when income > 0
 * Year = aggregation over its months.
 *
 * The core works on plain amounts within a single currency; multi-currency is
 * resolved to one currency (via Money) before it reaches these functions.
 */

import { round2 } from "./rounding";

/**
 * A month's raw figures, all in one currency. `extras`, `fixed`, and `variable`
 * are amounts of each dynamic line — category identity is a storage/UI concern,
 * not this core's.
 */
export interface MonthInput {
  nomina: number;
  otros: number;
  savingsGoal: number;
  extras: number[];
  fixed: number[];
  variable: number[];
}

export interface MonthResult {
  incomeTotal: number;
  extrasTotal: number;
  fixedTotal: number;
  variableTotal: number;
  expensesTotal: number;
  goal: number;
  canSpend: number;
  endOfMonthSavings: number;
  remainingToSpend: number;
  metGoal: boolean;
  overspend: boolean;
}

export interface YearResult {
  perMonth: MonthResult[];
  incomeTotal: number;
  goalTotal: number;
  canSpendTotal: number;
  expensesTotal: number;
  fixedTotal: number;
  variableTotal: number;
  savingsTotal: number;
  nominaTotal: number;
  otrosTotal: number;
}

const sum = (xs: number[]): number => xs.reduce((s, x) => s + (Number(x) || 0), 0);

/** Fill in defaults so callers can pass partial month data. */
export function makeMonthInput(partial: Partial<MonthInput> = {}): MonthInput {
  return {
    nomina: partial.nomina ?? 0,
    otros: partial.otros ?? 0,
    savingsGoal: partial.savingsGoal ?? 0,
    extras: partial.extras ?? [],
    fixed: partial.fixed ?? [],
    variable: partial.variable ?? [],
  };
}

export function computeMonth(m: MonthInput): MonthResult {
  // extrasTotal is left unrounded here, exactly as in the prototype; rounding
  // happens when it folds into incomeTotal.
  const extrasTotal = sum(m.extras);
  const incomeTotal = round2((Number(m.nomina) || 0) + (Number(m.otros) || 0) + extrasTotal);
  const fixedTotal = round2(sum(m.fixed));
  const variableTotal = round2(sum(m.variable));
  const expensesTotal = round2(fixedTotal + variableTotal);
  const goal = Number(m.savingsGoal) || 0;
  const canSpend = round2(incomeTotal - goal);
  const endOfMonthSavings = round2(incomeTotal - expensesTotal);
  const remainingToSpend = round2(canSpend - expensesTotal);
  return {
    incomeTotal,
    extrasTotal,
    fixedTotal,
    variableTotal,
    expensesTotal,
    goal,
    canSpend,
    endOfMonthSavings,
    remainingToSpend,
    metGoal: endOfMonthSavings >= goal,
    // The `income > 0` guard means a zero-income month is never "overspent".
    overspend: expensesTotal > canSpend && incomeTotal > 0,
  };
}

export interface CategoryVariance {
  budgeted: number;
  actual: number;
  remaining: number; // budgeted - actual (negative once actual overruns budget)
  over: boolean; // actual strictly exceeds budget
}

export interface BudgetVariance {
  byCategory: Record<string, CategoryVariance>;
  budgetedTotal: number;
  actualTotal: number;
  remainingTotal: number;
}

/**
 * Compare planned amounts (budgets) against realized amounts (actuals).
 *
 * Pure and identity-agnostic: both inputs are plain {category-key: amount} maps
 * within a single currency. Every category appearing in *either* map gets a row.
 * Keys are processed in sorted order so this mirrors the Python core exactly
 * (backend/app/shared/domain/budgeting.py) and both agree to the cent.
 */
export function computeBudgetVariance(
  budgetsByCategory: Record<string, number>,
  actualsByCategory: Record<string, number>,
): BudgetVariance {
  const keys = Array.from(
    new Set([...Object.keys(budgetsByCategory), ...Object.keys(actualsByCategory)]),
  ).sort();
  const byCategory: Record<string, CategoryVariance> = {};
  for (const key of keys) {
    const budgeted = round2(Number(budgetsByCategory[key]) || 0);
    const actual = round2(Number(actualsByCategory[key]) || 0);
    byCategory[key] = {
      budgeted,
      actual,
      remaining: round2(budgeted - actual),
      over: actual > budgeted,
    };
  }
  const values = Object.values(byCategory);
  const budgetedTotal = round2(values.reduce((s, v) => s + v.budgeted, 0));
  const actualTotal = round2(values.reduce((s, v) => s + v.actual, 0));
  return {
    byCategory,
    budgetedTotal,
    actualTotal,
    remainingTotal: round2(budgetedTotal - actualTotal),
  };
}

export function computeYear(months: MonthInput[]): YearResult {
  const perMonth = months.map(computeMonth);
  const total = (select: (c: MonthResult) => number): number =>
    round2(perMonth.reduce((s, c) => s + select(c), 0));
  return {
    perMonth,
    incomeTotal: total((c) => c.incomeTotal),
    goalTotal: total((c) => c.goal),
    canSpendTotal: total((c) => c.canSpend),
    expensesTotal: total((c) => c.expensesTotal),
    fixedTotal: total((c) => c.fixedTotal),
    variableTotal: total((c) => c.variableTotal),
    savingsTotal: total((c) => c.endOfMonthSavings),
    nominaTotal: round2(months.reduce((s, m) => s + (Number(m.nomina) || 0), 0)),
    otrosTotal: round2(months.reduce((s, m) => s + (Number(m.otros) || 0) + sum(m.extras), 0)),
  };
}
