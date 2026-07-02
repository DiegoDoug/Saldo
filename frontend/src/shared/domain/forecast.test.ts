import { describe, expect, it } from "vitest";

import { forecast } from "./forecast";

// Mirrors backend/tests/test_forecast_domain.py — SAME projected balances.
describe("cash-flow forecast (mirror of the Python core)", () => {
  it("applies daily net and scheduled events", () => {
    const result = forecast(1000, "2026-01-01", 3, { "2026-01-02": -50, "2026-01-03": 200 }, -10);
    expect(result.points).toEqual([
      { date: "2026-01-01", balance: 1000 },
      { date: "2026-01-02", balance: 940 },
      { date: "2026-01-03", balance: 1130 },
      { date: "2026-01-04", balance: 1120 },
    ]);
    expect(result.endBalance).toBe(1120);
    expect(result.minBalance).toBe(940);
    expect(result.minDate).toBe("2026-01-02");
  });

  it("produces horizon+1 points", () => {
    const result = forecast(0, "2026-01-01", 30, {}, -5);
    expect(result.points).toHaveLength(31);
    expect(result.endBalance).toBe(-150);
    expect(result.minDate).toBe("2026-01-31");
  });
});
