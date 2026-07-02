import { describe, expect, it } from "vitest";

import { advance, occurrenceId, occurrencesBetween } from "./recurring";

// Mirrors backend/tests/test_recurring_domain.py — SAME dates, SAME id literal.
describe("recurrence math (mirror of the Python core)", () => {
  it("advances daily/weekly/biweekly", () => {
    expect(advance("2026-01-01", "daily", 1)).toBe("2026-01-02");
    expect(advance("2026-01-01", "daily", 10)).toBe("2026-01-11");
    expect(advance("2026-01-01", "weekly", 1)).toBe("2026-01-08");
    expect(advance("2026-01-01", "biweekly", 1)).toBe("2026-01-15");
  });

  it("clamps short months and leap days", () => {
    expect(advance("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(advance("2026-01-15", "quarterly", 1)).toBe("2026-04-15");
    expect(advance("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });

  it("lists occurrences within a window and honours end_date", () => {
    expect(occurrencesBetween("2026-01-01", "monthly", 1, "2026-01-01", "2026-04-15")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(
      occurrencesBetween("2026-01-01", "monthly", 1, "2026-01-01", "2026-12-31", "2026-02-15"),
    ).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("derives a deterministic occurrence id matching the Python core", () => {
    const rule = "11111111-1111-1111-1111-111111111111";
    expect(occurrenceId(rule, "2026-01-15")).toBe("a7cc883e-440f-666e-0731-025b44746f10");
    expect(occurrenceId(rule, "2026-01-15")).toBe(occurrenceId(rule, "2026-01-15"));
    expect(occurrenceId(rule, "2026-02-15")).not.toBe(occurrenceId(rule, "2026-01-15"));
  });
});
