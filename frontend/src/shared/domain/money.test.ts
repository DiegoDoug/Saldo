/**
 * Tests for the Money value object — mirrors backend/tests/test_money.py.
 * Invariant under test: no implicit cross-currency arithmetic.
 */

import { describe, expect, it } from "vitest";
import { CurrencyMismatchError, Money, zeroMoney } from "./money";

describe("Money", () => {
  it("normalizes currency and rounds amount on construction", () => {
    const m = new Money(10.005, "eur");
    expect(m.currency).toBe("EUR");
    expect(m.amount).toBe(10.01); // half rounds up
  });

  it("rejects invalid currency codes", () => {
    for (const bad of ["EU", "EURO", "12", "e u"]) {
      expect(() => new Money(1, bad)).toThrow();
    }
  });

  it("adds and subtracts within a currency", () => {
    expect(new Money(100, "EUR").add(new Money(50, "EUR")).equals(new Money(150, "EUR"))).toBe(true);
    expect(
      new Money(100, "EUR").subtract(new Money(30, "EUR")).equals(new Money(70, "EUR")),
    ).toBe(true);
  });

  it("throws on cross-currency arithmetic", () => {
    expect(() => new Money(100, "EUR").add(new Money(100, "USD"))).toThrow(CurrencyMismatchError);
    expect(() => new Money(100, "EUR").subtract(new Money(100, "USD"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("throws on cross-currency comparison", () => {
    expect(() => new Money(100, "EUR").lessThan(new Money(100, "USD"))).toThrow(
      CurrencyMismatchError,
    );
  });

  it("scales within the currency", () => {
    expect(new Money(10, "EUR").scale(3).equals(new Money(30, "EUR"))).toBe(true);
  });

  it("converts explicitly to another currency", () => {
    const converted = new Money(100, "EUR").convert(1.08, "USD");
    expect(converted.equals(new Money(108, "USD"))).toBe(true);
  });

  it("equality is amount and currency", () => {
    expect(new Money(100, "EUR").equals(new Money(100, "EUR"))).toBe(true);
    expect(new Money(100, "EUR").equals(new Money(100, "USD"))).toBe(false);
    expect(new Money(100, "EUR").equals(new Money(101, "EUR"))).toBe(false);
  });

  it("orders within a currency", () => {
    expect(new Money(50, "EUR").lessThan(new Money(100, "EUR"))).toBe(true);
    expect(new Money(100, "EUR").greaterThan(new Money(50, "EUR"))).toBe(true);
  });

  it("zero helper", () => {
    expect(zeroMoney("EUR").isZero()).toBe(true);
    expect(zeroMoney("EUR").equals(new Money(0, "EUR"))).toBe(true);
  });
});
