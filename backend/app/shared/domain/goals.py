"""Pure, framework-free goal math — the source of truth for savings-goal
projections. No I/O, no framework imports (mirrors `shared/domain/budgeting`).

The TS core in `frontend/src/shared/domain/goals.ts` must agree on the same
numbers and dates (the mirrored tests assert identical values).

A goal knows only three inputs: how much is saved (`current`), the `target`, and
the `monthly` contribution. From those we derive progress, the amount left,
how many whole months remain, and an estimated completion date.
"""

from __future__ import annotations

import math
from calendar import monthrange
from datetime import date


def progress(current: float, target: float) -> float:
    """Fraction complete, clamped to [0, 1]. A non-positive target is 0."""
    if target <= 0:
        return 0.0
    return max(0.0, min(1.0, current / target))


def remaining_amount(current: float, target: float) -> float:
    """How much is still needed (never negative)."""
    return max(0.0, target - current)


def months_remaining(current: float, target: float, monthly: float) -> int | None:
    """Whole months of contributions still required.

    Returns 0 when the goal is already met, and None when it can never be
    reached at the current contribution (monthly <= 0 while still short).
    """
    remaining = remaining_amount(current, target)
    if remaining <= 0:
        return 0
    if monthly <= 0:
        return None
    return math.ceil(remaining / monthly)


def add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, monthrange(year, month)[1])  # clamp (Jan 31 → Feb 28)
    return date(year, month, day)


def completion_date(
    today: date, current: float, target: float, monthly: float
) -> date | None:
    """Estimated date the goal is reached, or None if unreachable."""
    months = months_remaining(current, target, monthly)
    if months is None:
        return None
    return add_months(today, months)
