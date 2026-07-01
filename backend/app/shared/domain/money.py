"""Money value object — the one real invariant in this domain.

You must never add 100 EUR to 100 USD as if they were the same number. `Money`
enforces that: same-currency arithmetic is allowed; cross-currency arithmetic
raises. Converting between currencies is *explicit* — you pass a rate and the
target currency — so a conversion can never happen by accident.

Amounts are stored rounded to the cent (via the shared `round2`) so a Money and
its equivalent literal compare equal.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.shared.domain.rounding import round2


class CurrencyMismatchError(ValueError):
    """Raised when two different currencies are combined without conversion."""

    def __init__(self, a: str, b: str) -> None:
        super().__init__(
            f"Refusing implicit cross-currency arithmetic: {a} vs {b}. "
            "Convert to a single currency first."
        )


def _validate_currency(code: str) -> str:
    if not isinstance(code, str) or len(code) != 3 or not code.isalpha():
        raise ValueError(f"Invalid ISO 4217 currency code: {code!r}")
    return code.upper()


@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

    def __post_init__(self) -> None:
        # frozen dataclass: mutate through object.__setattr__ during init only.
        object.__setattr__(self, "currency", _validate_currency(self.currency))
        object.__setattr__(self, "amount", round2(float(self.amount)))

    def _same_currency(self, other: Money) -> None:
        if self.currency != other.currency:
            raise CurrencyMismatchError(self.currency, other.currency)

    def add(self, other: Money) -> Money:
        self._same_currency(other)
        return Money(self.amount + other.amount, self.currency)

    def subtract(self, other: Money) -> Money:
        self._same_currency(other)
        return Money(self.amount - other.amount, self.currency)

    def scale(self, factor: float) -> Money:
        """Multiply by a scalar (e.g. quantity) — stays in the same currency."""
        return Money(self.amount * factor, self.currency)

    def convert(self, rate: float, to_currency: str) -> Money:
        """Explicitly convert to another currency at a given rate."""
        return Money(self.amount * rate, to_currency)

    def is_zero(self) -> bool:
        return self.amount == 0.0

    def __lt__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount < other.amount

    def __le__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount <= other.amount

    def __gt__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount > other.amount

    def __ge__(self, other: Money) -> bool:
        self._same_currency(other)
        return self.amount >= other.amount

    def __str__(self) -> str:
        return f"{self.amount:.2f} {self.currency}"


def zero(currency: str) -> Money:
    return Money(0.0, currency)
