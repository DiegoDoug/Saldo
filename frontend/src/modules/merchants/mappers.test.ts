import { describe, expect, it } from "vitest";

import { localMerchantToSync, wireToLocalMerchant, type WireMerchant } from "./mappers";

const wire: WireMerchant = {
  id: "m1",
  name: "Netflix",
  logo: "",
  color: "#e50914",
  category_id: "c1",
  website: "https://netflix.com",
  location: "",
  recurring_probability: 0.9,
  updated_at: "2026-01-01T10:00:00Z",
  deleted: false,
};

describe("merchant mappers", () => {
  it("maps wire → local (snake→camel, bool→0/1)", () => {
    const local = wireToLocalMerchant(wire);
    expect(local.categoryId).toBe("c1");
    expect(local.recurringProbability).toBe(0.9);
    expect(local.deleted).toBe(0);
  });

  it("round-trips local → sync → local", () => {
    const local = wireToLocalMerchant({ ...wire, deleted: true });
    const sync = localMerchantToSync(local);
    expect(sync.category_id).toBe("c1");
    expect(sync.deleted).toBe(true);
    expect(wireToLocalMerchant(sync as WireMerchant)).toEqual(local);
  });
});
