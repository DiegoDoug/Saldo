import { describe, expect, it } from "vitest";

import { localRuleToSync, wireToLocalRule, type WireRecurringRule } from "./mappers";

const wire: WireRecurringRule = {
  id: "r1",
  name: "Netflix",
  type: "expense",
  amount: 12,
  currency: "EUR",
  account_id: "a1",
  transfer_account_id: null,
  merchant_id: "m1",
  category_id: "c1",
  notes: "",
  frequency: "monthly",
  interval: 1,
  start_date: "2026-01-10",
  end_date: null,
  next_run: "2026-02-10",
  auto_generate: true,
  updated_at: "2026-01-10T10:00:00Z",
  deleted: false,
};

describe("recurring-rule mappers", () => {
  it("maps wire → local (snake→camel, bool→0/1)", () => {
    const local = wireToLocalRule(wire);
    expect(local.accountId).toBe("a1");
    expect(local.nextRun).toBe("2026-02-10");
    expect(local.autoGenerate).toBe(1);
    expect(local.deleted).toBe(0);
  });

  it("round-trips local → sync → local", () => {
    const local = wireToLocalRule({ ...wire, deleted: true, auto_generate: false });
    const sync = localRuleToSync(local);
    expect(sync.next_run).toBe("2026-02-10");
    expect(sync.auto_generate).toBe(false);
    expect(sync.deleted).toBe(true);
    expect(wireToLocalRule(sync as WireRecurringRule)).toEqual(local);
  });
});
