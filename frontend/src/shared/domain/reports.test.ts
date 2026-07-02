import { describe, expect, it } from "vitest";

import { buildReport, healthScore, type ReportTx, savingsRate } from "./reports";

// Mirrors backend/tests/test_reports_domain.py — SAME numbers, same dataset.
const DATASET: ReportTx[] = [
  { type: "income", amount: 2000, date: "2026-01-05" },
  { type: "expense", amount: 500, date: "2026-01-10", categoryId: "food", merchantId: "m1" },
  { type: "expense", amount: 300, date: "2026-01-20", categoryId: "rent", merchantId: null },
  { type: "income", amount: 2000, date: "2026-02-05" },
  { type: "expense", amount: 800, date: "2026-02-10", categoryId: "food", merchantId: "m1" },
  { type: "transfer", amount: 1000, date: "2026-02-15" },
];

describe("reports (mirror of the Python core)", () => {
  it("computes savings rate and health score", () => {
    expect(savingsRate(1000, 800)).toBeCloseTo(0.2);
    expect(savingsRate(0, 100)).toBe(0);
    expect(healthScore(0.2)).toBe(67);
    expect(healthScore(0.3)).toBe(100);
    expect(healthScore(-0.1)).toBe(0);
  });

  it("computes totals", () => {
    const r = buildReport(DATASET);
    expect(r.incomeTotal).toBe(4000);
    expect(r.expenseTotal).toBe(1600);
    expect(r.net).toBe(2400);
    expect(r.savingsRate).toBeCloseTo(0.6);
    expect(r.healthScore).toBe(100);
  });

  it("computes breakdowns (transfers excluded)", () => {
    const r = buildReport(DATASET);
    expect(r.byMonth).toEqual([
      { month: "2026-01", income: 2000, expense: 800, net: 1200 },
      { month: "2026-02", income: 2000, expense: 800, net: 1200 },
    ]);
    expect(r.spendingByCategory).toEqual([
      { key: "food", total: 1300 },
      { key: "rent", total: 300 },
    ]);
    expect(r.spendingByMerchant).toEqual([{ key: "m1", total: 1300 }]);
    expect(r.largestExpenses.map((t) => t.amount)).toEqual([800, 500, 300]);
  });
});
