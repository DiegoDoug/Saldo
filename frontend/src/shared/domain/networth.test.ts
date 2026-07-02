import { describe, expect, it } from "vitest";

import { allocation, growth, netWorth } from "./networth";

// Mirrors backend/tests/test_networth_domain.py — SAME numbers.
describe("net-worth math (mirror of the Python core)", () => {
  it("computes net worth", () => {
    expect(netWorth(1500, 400)).toBe(1100);
    expect(netWorth(200, 500)).toBe(-300);
  });

  it("computes growth (null baseline, magnitude-relative)", () => {
    expect(growth(1100, 1000)).toBeCloseTo(0.1);
    expect(growth(100, 0)).toBeNull();
    expect(growth(-50, -100)).toBe(0.5);
  });

  it("computes allocation shares of the positive total", () => {
    const alloc = allocation({ cash: 600, property: 900, debt: -100 });
    expect(alloc.cash).toBe(0.4);
    expect(alloc.property).toBe(0.6);
    expect(alloc.debt).toBe(0);
    expect(allocation({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
});
