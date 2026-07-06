import { describe, expect, it } from "vitest";

import { splitChildrenSumTo } from "./localRepo";

describe("splitChildrenSumTo", () => {
  it("accepts line items that sum to the total (cent-safe)", () => {
    expect(splitChildrenSumTo(100, [{ amount: 60 }, { amount: 40 }])).toBe(true);
    // 0.1 + 0.2 float noise still counts as 0.3.
    expect(splitChildrenSumTo(0.3, [{ amount: 0.1 }, { amount: 0.2 }])).toBe(true);
  });

  it("rejects a mismatched sum and an empty split", () => {
    expect(splitChildrenSumTo(100, [{ amount: 55 }])).toBe(false);
    expect(splitChildrenSumTo(0, [])).toBe(false);
  });
});
