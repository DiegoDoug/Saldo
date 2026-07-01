import { describe, expect, it } from "vitest";

import type { LocalEntry } from "../../db/db";
import { entriesToMonthInput } from "./mappers";

function entry(partial: Partial<LocalEntry>): LocalEntry {
  return {
    id: crypto.randomUUID(),
    year: 2026,
    month: 0,
    kind: "income",
    categoryId: null,
    label: "",
    amount: 0,
    currency: "EUR",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deleted: 0,
    ...partial,
  };
}

describe("entriesToMonthInput", () => {
  it("groups amounts by kind and sums the goal", () => {
    const input = entriesToMonthInput([
      entry({ kind: "income", amount: 1500 }),
      entry({ kind: "income", amount: 50 }),
      entry({ kind: "fixed", amount: 800 }),
      entry({ kind: "variable", amount: 150 }),
      entry({ kind: "goal", amount: 200 }),
    ]);
    expect(input.extras).toEqual([1500, 50]);
    expect(input.fixed).toEqual([800]);
    expect(input.variable).toEqual([150]);
    expect(input.savingsGoal).toBe(200);
  });

  it("ignores tombstoned entries", () => {
    const input = entriesToMonthInput([
      entry({ kind: "fixed", amount: 800 }),
      entry({ kind: "fixed", amount: 999, deleted: 1 }),
    ]);
    expect(input.fixed).toEqual([800]);
  });
});
