import { describe, expect, it } from "vitest";

import { localAccountToSync, wireToLocalAccount, type WireAccount } from "./mappers";

const wire: WireAccount = {
  id: "a1",
  name: "Checking",
  type: "checking",
  currency: "EUR",
  opening_balance: 100.5,
  color: "#0f0",
  icon: "bank",
  position: 2,
  archived: false,
  updated_at: "2026-01-01T10:00:00Z",
  deleted: false,
};

describe("account mappers", () => {
  it("maps wire → local, converting booleans to 0/1", () => {
    const local = wireToLocalAccount(wire);
    expect(local.openingBalance).toBe(100.5);
    expect(local.archived).toBe(0);
    expect(local.deleted).toBe(0);
    expect(local.updatedAt).toBe("2026-01-01T10:00:00Z");
  });

  it("round-trips local → sync → local", () => {
    const local = wireToLocalAccount({ ...wire, archived: true, deleted: true });
    const sync = localAccountToSync(local);
    expect(sync.opening_balance).toBe(100.5);
    expect(sync.archived).toBe(true);
    expect(sync.deleted).toBe(true);
    const back = wireToLocalAccount(sync as WireAccount);
    expect(back).toEqual(local);
  });
});
