/**
 * Tests for the budgeting domain core.
 *
 * These mirror backend/tests/test_budgeting_domain.py case-for-case with the
 * same expected numbers — that shared contract is what guarantees the Python
 * and TypeScript cores stay in agreement.
 */

import { describe, expect, it } from "vitest";
import { computeBudgetVariance, computeMonth, computeYear, makeMonthInput } from "./budgeting";

describe("computeMonth", () => {
  it("seed month from the sheet (nomina 1500, otros 50, goal 200)", () => {
    const r = computeMonth(makeMonthInput({ nomina: 1500, otros: 50, savingsGoal: 200 }));
    expect(r.incomeTotal).toBe(1550);
    expect(r.expensesTotal).toBe(0);
    expect(r.canSpend).toBe(1350);
    expect(r.endOfMonthSavings).toBe(1550);
    expect(r.remainingToSpend).toBe(1350);
    expect(r.metGoal).toBe(true);
    expect(r.overspend).toBe(false);
  });

  it("income sums nomina, otros and extras", () => {
    const r = computeMonth(makeMonthInput({ nomina: 1000, otros: 200, extras: [300, 50.5] }));
    expect(r.extrasTotal).toBe(350.5);
    expect(r.incomeTotal).toBe(1550.5);
  });

  it("expenses sum fixed and variable", () => {
    const r = computeMonth(
      makeMonthInput({ nomina: 2000, fixed: [800, 120.25], variable: [50, 49.75] }),
    );
    expect(r.fixedTotal).toBe(920.25);
    expect(r.variableTotal).toBe(99.75);
    expect(r.expensesTotal).toBe(1020);
    expect(r.endOfMonthSavings).toBe(980);
  });

  it("overspends when expenses exceed canSpend", () => {
    const r = computeMonth(makeMonthInput({ nomina: 1000, savingsGoal: 200, fixed: [900] }));
    expect(r.canSpend).toBe(800);
    expect(r.expensesTotal).toBe(900);
    expect(r.overspend).toBe(true);
    expect(r.remainingToSpend).toBe(-100);
    expect(r.endOfMonthSavings).toBe(100);
  });

  it("zero income is never overspent (income > 0 guard)", () => {
    const r = computeMonth(makeMonthInput({ fixed: [50] }));
    expect(r.incomeTotal).toBe(0);
    expect(r.expensesTotal).toBe(50);
    expect(r.canSpend).toBe(0);
    expect(r.overspend).toBe(false);
  });

  it("all-zero month", () => {
    const r = computeMonth(makeMonthInput());
    expect(r.incomeTotal).toBe(0);
    expect(r.expensesTotal).toBe(0);
    expect(r.canSpend).toBe(0);
    expect(r.endOfMonthSavings).toBe(0);
    expect(r.overspend).toBe(false);
    expect(r.metGoal).toBe(true);
  });

  it("negative goal raises canSpend above income", () => {
    const r = computeMonth(makeMonthInput({ nomina: 1000, savingsGoal: -500 }));
    expect(r.canSpend).toBe(1500);
    expect(r.metGoal).toBe(true);
  });

  it("rounds half up like JS Math.round, not banker's rounding", () => {
    expect(computeMonth(makeMonthInput({ nomina: 0.1, otros: 0.2 })).incomeTotal).toBe(0.3);
    expect(computeMonth(makeMonthInput({ nomina: 0.125 })).incomeTotal).toBe(0.13);
  });

  it("meeting the goal exactly counts as met", () => {
    const r = computeMonth(makeMonthInput({ nomina: 1000, savingsGoal: 1000 }));
    expect(r.endOfMonthSavings).toBe(1000);
    expect(r.metGoal).toBe(true);
  });
});

describe("computeYear", () => {
  it("aggregates twelve identical months", () => {
    const months = Array.from({ length: 12 }, () =>
      makeMonthInput({ nomina: 1500, otros: 50, savingsGoal: 200 }),
    );
    const y = computeYear(months);
    expect(y.perMonth).toHaveLength(12);
    expect(y.incomeTotal).toBe(12 * 1550);
    expect(y.goalTotal).toBe(12 * 200);
    expect(y.canSpendTotal).toBe(12 * 1350);
    expect(y.expensesTotal).toBe(0);
    expect(y.savingsTotal).toBe(12 * 1550);
    expect(y.nominaTotal).toBe(12 * 1500);
    expect(y.otrosTotal).toBe(12 * 50);
  });

  it("aggregates mixed months", () => {
    const months = [
      makeMonthInput({ nomina: 1000, fixed: [300], variable: [200] }),
      makeMonthInput({ nomina: 2000, otros: 100, extras: [50], fixed: [400], variable: [100] }),
    ];
    const y = computeYear(months);
    expect(y.incomeTotal).toBe(1000 + 2150);
    expect(y.expensesTotal).toBe(500 + 500);
    expect(y.fixedTotal).toBe(700);
    expect(y.variableTotal).toBe(300);
    expect(y.savingsTotal).toBe(500 + 1650);
    expect(y.otrosTotal).toBe(0 + 150);
  });
});

// These mirror test_budget_variance_* in the Python core with the SAME numbers.
describe("computeBudgetVariance", () => {
  it("computes per-category variance and totals", () => {
    const v = computeBudgetVariance(
      { a: 100, b: 200, c: 50 },
      { a: 120, b: 150, d: 30 },
    );
    expect(v.byCategory.a.remaining).toBe(-20);
    expect(v.byCategory.a.over).toBe(true);
    expect(v.byCategory.b.remaining).toBe(50);
    expect(v.byCategory.b.over).toBe(false);
    // Budgeted-but-unspent shows up with actual 0.
    expect(v.byCategory.c.actual).toBe(0);
    expect(v.byCategory.c.remaining).toBe(50);
    // Spent-without-budget shows up with budgeted 0 and over=true.
    expect(v.byCategory.d.budgeted).toBe(0);
    expect(v.byCategory.d.over).toBe(true);
    expect(v.budgetedTotal).toBe(350);
    expect(v.actualTotal).toBe(300);
    expect(v.remainingTotal).toBe(50);
  });

  it("rounds to the cent, matching the Python core", () => {
    const v = computeBudgetVariance({ x: 0.1 }, { x: 0.2 });
    expect(v.byCategory.x.budgeted).toBe(0.1);
    expect(v.byCategory.x.actual).toBe(0.2);
    expect(v.byCategory.x.remaining).toBe(-0.1);
    expect(v.remainingTotal).toBe(-0.1);
    // Half rounds up: 0.125 -> 0.13.
    expect(computeBudgetVariance({ x: 0.125 }, {}).byCategory.x.budgeted).toBe(0.13);
  });

  it("handles empty inputs", () => {
    const v = computeBudgetVariance({}, {});
    expect(v.byCategory).toEqual({});
    expect(v.budgetedTotal).toBe(0);
    expect(v.actualTotal).toBe(0);
    expect(v.remainingTotal).toBe(0);
  });
});
