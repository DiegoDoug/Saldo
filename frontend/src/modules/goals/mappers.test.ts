import { describe, expect, it } from "vitest";

import { localGoalToSync, wireToLocalGoal, type WireGoal } from "./mappers";

const wire: WireGoal = {
  id: "g1",
  name: "Emergencia",
  kind: "emergency",
  target_amount: 1000,
  current_amount: 200,
  monthly_contribution: 100,
  currency: "EUR",
  target_date: null,
  updated_at: "2026-01-01T10:00:00Z",
  deleted: false,
};

describe("goal mappers", () => {
  it("maps wire → local (snake→camel, bool→0/1)", () => {
    const local = wireToLocalGoal(wire);
    expect(local.targetAmount).toBe(1000);
    expect(local.currentAmount).toBe(200);
    expect(local.monthlyContribution).toBe(100);
    expect(local.deleted).toBe(0);
  });

  it("round-trips local → sync → local", () => {
    const local = wireToLocalGoal({ ...wire, deleted: true });
    const sync = localGoalToSync(local);
    expect(sync.target_amount).toBe(1000);
    expect(sync.deleted).toBe(true);
    expect(wireToLocalGoal(sync as WireGoal)).toEqual(local);
  });
});
