import { describe, expect, it } from "vitest";

import type { LocalTransaction } from "../../db/db";
import { accountDeltas } from "./hooks";

function tx(partial: Partial<LocalTransaction>): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    type: "expense",
    amount: 0,
    currency: "EUR",
    accountId: "a",
    transferAccountId: null,
    merchantId: null,
    recurringId: null,
    categoryId: null,
    date: "2026-01-01",
    notes: "",
    tags: [],
    updatedAt: "2026-01-01T00:00:00Z",
    deleted: 0,
    ...partial,
  };
}

describe("accountDeltas (mirrors backend account_deltas)", () => {
  it("adds income and subtracts expenses on the account", () => {
    const deltas = accountDeltas([
      tx({ type: "income", amount: 100, accountId: "a" }),
      tx({ type: "expense", amount: 30, accountId: "a" }),
    ]);
    expect(deltas.get("a")).toBe(70);
  });

  it("moves money across both legs of a transfer", () => {
    const deltas = accountDeltas([
      tx({ type: "transfer", amount: 40, accountId: "a", transferAccountId: "b" }),
    ]);
    expect(deltas.get("a")).toBe(-40);
    expect(deltas.get("b")).toBe(40);
  });

  it("ignores tombstoned transactions", () => {
    const deltas = accountDeltas([
      tx({ type: "income", amount: 100, accountId: "a", deleted: 1 }),
    ]);
    expect(deltas.get("a")).toBeUndefined();
  });
});
