"""Tests for the Money value object.

The invariant under test: no implicit cross-currency arithmetic. Conversions
must be explicit.
"""

import pytest

from app.shared.domain.money import CurrencyMismatchError, Money, zero


def test_construction_normalizes_currency_and_rounds_amount() -> None:
    m = Money(10.005, "eur")
    assert m.currency == "EUR"
    assert m.amount == 10.01  # half rounds up


def test_invalid_currency_code_rejected() -> None:
    for bad in ["EU", "EURO", "12", "e u"]:
        with pytest.raises(ValueError):
            Money(1, bad)


def test_same_currency_add_and_subtract() -> None:
    assert Money(100, "EUR").add(Money(50, "EUR")) == Money(150, "EUR")
    assert Money(100, "EUR").subtract(Money(30, "EUR")) == Money(70, "EUR")


def test_cross_currency_arithmetic_raises() -> None:
    with pytest.raises(CurrencyMismatchError):
        Money(100, "EUR").add(Money(100, "USD"))
    with pytest.raises(CurrencyMismatchError):
        Money(100, "EUR").subtract(Money(100, "USD"))


def test_cross_currency_comparison_raises() -> None:
    with pytest.raises(CurrencyMismatchError):
        _ = Money(100, "EUR") < Money(100, "USD")


def test_scale_stays_in_currency() -> None:
    assert Money(10, "EUR").scale(3) == Money(30, "EUR")


def test_convert_is_explicit_and_changes_currency() -> None:
    converted = Money(100, "EUR").convert(rate=1.08, to_currency="USD")
    assert converted == Money(108, "USD")


def test_equality_is_amount_and_currency() -> None:
    assert Money(100, "EUR") == Money(100, "EUR")
    assert Money(100, "EUR") != Money(100, "USD")
    assert Money(100, "EUR") != Money(101, "EUR")


def test_ordering_within_currency() -> None:
    assert Money(50, "EUR") < Money(100, "EUR")
    assert Money(100, "EUR") >= Money(100, "EUR")


def test_zero_helper() -> None:
    assert zero("EUR").is_zero() is True
    assert zero("EUR") == Money(0, "EUR")
