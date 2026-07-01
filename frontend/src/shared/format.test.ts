import { describe, expect, it } from "vitest";

import { formatMoney, parseAmount } from "./format";

describe("formatMoney", () => {
  it("formats EUR with the es-ES locale", () => {
    // Thousands grouping depends on the Node ICU build, so match with an
    // optional group separator; the decimal comma and symbol are stable.
    const out = formatMoney(1234.5);
    expect(out).toMatch(/1\.?234,50/);
    expect(out).toContain("€");
  });

  it("treats non-finite as zero", () => {
    expect(formatMoney(Number.NaN)).toContain("0,00");
  });
});

describe("parseAmount", () => {
  it("parses plain decimals", () => {
    expect(parseAmount("12.34")).toBe(12.34);
  });

  it("parses European grouping and decimal comma", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
    expect(parseAmount("1.234,56 €")).toBe(1234.56);
  });

  it("clamps negatives and junk to zero", () => {
    expect(parseAmount("-5")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
  });
});
