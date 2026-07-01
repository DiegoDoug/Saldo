import { describe, expect, it } from "vitest";

import { DEFAULT_LAYOUT, resolveLayout } from "./layoutRepo";
import { DEFAULT_ORDER } from "./widgets";

describe("resolveLayout", () => {
  it("returns defaults when nothing is stored", () => {
    expect(resolveLayout(undefined)).toEqual(DEFAULT_LAYOUT);
  });

  it("appends catalog widgets missing from a stored order", () => {
    const stored = { order: [DEFAULT_ORDER[0]], hidden: [], theme: "carbon" };
    const resolved = resolveLayout(stored);
    // Every catalog widget is present, the stored one stays first.
    expect(resolved.order).toHaveLength(DEFAULT_ORDER.length);
    expect(resolved.order[0]).toBe(DEFAULT_ORDER[0]);
    expect([...resolved.order].sort()).toEqual([...DEFAULT_ORDER].sort());
    expect(resolved.theme).toBe("carbon");
  });

  it("drops unknown widget ids from order and hidden", () => {
    const stored = {
      order: ["ghost", ...DEFAULT_ORDER],
      hidden: ["ghost", DEFAULT_ORDER[1]],
      theme: "cuaderno",
    };
    const resolved = resolveLayout(stored);
    expect(resolved.order).not.toContain("ghost");
    expect(resolved.hidden).toEqual([DEFAULT_ORDER[1]]);
  });
});
