import { describe, expect, it } from "vitest";

import { completionDate, monthsRemaining, progress, remainingAmount } from "./goals";

// Mirrors backend/tests/test_goals_domain.py — SAME numbers, SAME dates.
describe("goal math (mirror of the Python core)", () => {
  it("clamps progress to [0,1]", () => {
    expect(progress(200, 1000)).toBe(0.2);
    expect(progress(1200, 1000)).toBe(1);
    expect(progress(50, 0)).toBe(0);
  });

  it("keeps remaining amount non-negative", () => {
    expect(remainingAmount(200, 1000)).toBe(800);
    expect(remainingAmount(1200, 1000)).toBe(0);
  });

  it("computes months remaining (ceil, met, unreachable)", () => {
    expect(monthsRemaining(200, 1000, 100)).toBe(8);
    expect(monthsRemaining(250, 1000, 100)).toBe(8);
    expect(monthsRemaining(1000, 1000, 100)).toBe(0);
    expect(monthsRemaining(200, 1000, 0)).toBeNull();
  });

  it("estimates completion date with month clamping", () => {
    expect(completionDate("2026-01-15", 200, 1000, 100)).toBe("2026-09-15");
    expect(completionDate("2026-01-31", 900, 1000, 100)).toBe("2026-02-28");
    expect(completionDate("2026-01-15", 200, 1000, 0)).toBeNull();
  });
});
