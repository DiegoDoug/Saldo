/**
 * Money value object — the one real invariant in this domain.
 *
 * You must never add 100 EUR to 100 USD as if they were the same number. Money
 * enforces that: same-currency arithmetic is allowed; cross-currency arithmetic
 * throws. Conversion is explicit (pass a rate + target currency) so it can
 * never happen by accident. Mirrors backend/app/shared/domain/money.py.
 */

import { round2 } from "./rounding";

export class CurrencyMismatchError extends Error {
  constructor(a: string, b: string) {
    super(
      `Refusing implicit cross-currency arithmetic: ${a} vs ${b}. ` +
        "Convert to a single currency first.",
    );
    this.name = "CurrencyMismatchError";
  }
}

function validateCurrency(code: string): string {
  if (typeof code !== "string" || !/^[A-Za-z]{3}$/.test(code)) {
    throw new Error(`Invalid ISO 4217 currency code: ${JSON.stringify(code)}`);
  }
  return code.toUpperCase();
}

export class Money {
  readonly amount: number;
  readonly currency: string;

  constructor(amount: number, currency: string) {
    this.currency = validateCurrency(currency);
    this.amount = round2(Number(amount));
    Object.freeze(this);
  }

  private sameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  add(other: Money): Money {
    this.sameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.sameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /** Multiply by a scalar (e.g. quantity) — stays in the same currency. */
  scale(factor: number): Money {
    return new Money(this.amount * factor, this.currency);
  }

  /** Explicitly convert to another currency at a given rate. */
  convert(rate: number, toCurrency: string): Money {
    return new Money(this.amount * rate, toCurrency);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  lessThan(other: Money): boolean {
    this.sameCurrency(other);
    return this.amount < other.amount;
  }

  greaterThan(other: Money): boolean {
    this.sameCurrency(other);
    return this.amount > other.amount;
  }

  toString(): string {
    return `${this.amount.toFixed(2)} ${this.currency}`;
  }
}

export function zeroMoney(currency: string): Money {
  return new Money(0, currency);
}
