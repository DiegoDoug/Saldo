import { describe, expect, it } from "vitest";

import { localTransactionToSync, wireToLocalTransaction, type WireTransaction } from "./mappers";

const wire: WireTransaction = {
  id: "t1",
  type: "expense",
  amount: 20,
  currency: "EUR",
  account_id: "a1",
  transfer_account_id: null,
  merchant_id: null,
  recurring_id: null,
  category_id: "c1",
  split_parent: false,
  parent_id: null,
  date: "2026-01-15",
  notes: "Coffee",
  tags: ["food"],
  updated_at: "2026-01-15T10:00:00Z",
  deleted: false,
};

describe("transaction mappers", () => {
  it("maps wire → local (snake→camel, bool→0/1)", () => {
    const local = wireToLocalTransaction(wire);
    expect(local.accountId).toBe("a1");
    expect(local.categoryId).toBe("c1");
    expect(local.transferAccountId).toBeNull();
    expect(local.tags).toEqual(["food"]);
    expect(local.deleted).toBe(0);
  });

  it("round-trips local → sync → local", () => {
    const local = wireToLocalTransaction({ ...wire, deleted: true });
    const sync = localTransactionToSync(local);
    expect(sync.account_id).toBe("a1");
    expect(sync.deleted).toBe(true);
    expect(wireToLocalTransaction(sync as WireTransaction)).toEqual(local);
  });

  it("defaults missing tags to an empty array", () => {
    const local = wireToLocalTransaction({ ...wire, tags: undefined as unknown as string[] });
    expect(local.tags).toEqual([]);
  });
});
