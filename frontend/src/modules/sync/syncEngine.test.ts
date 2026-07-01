import { describe, expect, it } from "vitest";

import { toEpoch } from "./syncEngine";

describe("toEpoch", () => {
  it("treats a zone-less (server naive-UTC) timestamp as UTC", () => {
    // The backend emits "...T10:00:00" (no Z); the client writes "...Z".
    // Both must map to the same instant so last-write-wins compares correctly.
    expect(toEpoch("2026-01-01T10:00:00")).toBe(toEpoch("2026-01-01T10:00:00.000Z"));
  });

  it("orders timestamps chronologically regardless of format", () => {
    expect(toEpoch("2026-01-01T09:00:00")).toBeLessThan(toEpoch("2026-01-01T11:00:00.000Z"));
  });

  it("respects an explicit offset", () => {
    expect(toEpoch("2026-01-01T12:00:00+02:00")).toBe(toEpoch("2026-01-01T10:00:00Z"));
  });
});
