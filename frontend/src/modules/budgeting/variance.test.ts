import { describe, expect, it } from "vitest";

import type { LocalEntry, LocalTransaction } from "../../db/db";
import { computeMonthVariance } from "./hooks";

function entry(partial: Partial<LocalEntry>): LocalEntry {
  return {
    id: crypto.randomUUID(),
    year: 2026,
    month: 0,
    kind: "fixed",
    categoryId: null,
    label: "",
    amount: 0,
    currency: "EUR",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deleted: 0,
    ...partial,
  };
}

function txn(partial: Partial<LocalTransaction>): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    type: "expense",
    amount: 0,
    currency: "EUR",
    accountId: "acc",
    transferAccountId: null,
    merchantId: null,
    recurringId: null,
    categoryId: null,
    date: "2026-01-15",
    notes: "",
    tags: [],
    updatedAt: "2026-01-15T00:00:00.000Z",
    deleted: 0,
    ...partial,
  };
}

describe("computeMonthVariance", () => {
  it("uses entries as budget and categorized transactions as actuals", () => {
    const v = computeMonthVariance(
      [entry({ categoryId: "food", amount: 200 }), entry({ categoryId: "rent", amount: 800 })],
      [
        txn({ categoryId: "food", amount: 120 }),
        txn({ categoryId: "food", amount: 100 }), // food overspent: 220 > 200
        txn({ categoryId: "rent", amount: 800 }),
      ],
    );
    expect(v.byCategory.food.actual).toBe(220);
    expect(v.byCategory.food.over).toBe(true);
    expect(v.byCategory.rent.remaining).toBe(0);
    expect(v.byCategory.rent.over).toBe(false);
    expect(v.budgetedTotal).toBe(1000);
    expect(v.actualTotal).toBe(1020);
  });

  it("excludes transfers, goal entries, and tombstones", () => {
    const v = computeMonthVariance(
      [
        entry({ categoryId: "food", amount: 200 }),
        entry({ kind: "goal", categoryId: null, amount: 500 }),
        entry({ categoryId: "food", amount: 999, deleted: 1 }),
      ],
      [
        txn({ categoryId: "food", amount: 50 }),
        txn({ categoryId: "food", type: "transfer", amount: 999 }),
        txn({ categoryId: "food", amount: 999, deleted: 1 }),
      ],
    );
    expect(v.byCategory.food.budgeted).toBe(200);
    expect(v.byCategory.food.actual).toBe(50);
    expect(v.budgetedTotal).toBe(200);
  });
});
