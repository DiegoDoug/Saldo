"""Pure, framework-free recurrence math for recurring rules / bills.

No I/O and no framework imports (mirrors `shared/domain/budgeting`). The TS core
in `frontend/src/shared/domain/recurring.ts` must agree on the same results —
the mirrored tests assert the same dates and the same occurrence ids.

Two responsibilities:
  1. Advancing a date by a frequency (with monthly/yearly day-clamping).
  2. Deriving a *deterministic* occurrence id from (rule_id, date), so the same
     bill occurrence materialized on two devices collapses to one transaction
     under last-write-wins sync instead of duplicating.

The occurrence id is a 128-bit value rendered in UUID format. It is computed
with FNV-1a (not stdlib `uuid5`) precisely because the identical algorithm has
to run in TypeScript, where `uuid5`/SHA-1 is not readily available synchronously.
"""

from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date, timedelta
from typing import Literal

Frequency = Literal["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]

_MONTHS_STEP = {"monthly": 1, "quarterly": 3, "yearly": 12}


def _add_months(d: date, months: int) -> date:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, monthrange(year, month)[1])  # clamp (e.g. Jan 31 → Feb 28)
    return date(year, month, day)


def advance(d: date, frequency: Frequency, interval: int = 1) -> date:
    """Return the next occurrence date after `d` for the given frequency."""
    if interval < 1:
        interval = 1
    if frequency == "daily":
        return d + timedelta(days=interval)
    if frequency == "weekly":
        return d + timedelta(weeks=interval)
    if frequency == "biweekly":
        return d + timedelta(weeks=2 * interval)
    step = _MONTHS_STEP.get(frequency)
    if step is not None:
        return _add_months(d, step * interval)
    raise ValueError(f"Unknown frequency: {frequency}")


def occurrences_between(
    start: date,
    frequency: Frequency,
    interval: int,
    range_start: date,
    range_end: date,
    end_date: date | None = None,
) -> list[date]:
    """All occurrence dates in [range_start, range_end], honouring `end_date`.

    Iterates from `start`, advancing by the frequency, collecting dates that fall
    within the window. Bounded so a misconfigured rule can't loop forever.
    """
    out: list[date] = []
    current = start
    guard = 0
    while current <= range_end and guard < 10_000:
        if end_date is not None and current > end_date:
            break
        if current >= range_start:
            out.append(current)
        current = advance(current, frequency, interval)
        guard += 1
    return out


# --- Deterministic occurrence id ---------------------------------------
_FNV_OFFSET = 0xCBF29CE484222325
_FNV_PRIME = 0x100000001B3
_MASK64 = (1 << 64) - 1


def _fnv1a_64(data: bytes) -> int:
    h = _FNV_OFFSET
    for byte in data:
        h = ((h ^ byte) * _FNV_PRIME) & _MASK64
    return h


def occurrence_id(rule_id: str | uuid.UUID, d: date) -> uuid.UUID:
    """Deterministic UUID for the occurrence of `rule_id` on date `d`.

    Two independent materializations of the same bill occurrence therefore
    produce the *same* transaction id, so sync dedupes them instead of creating
    duplicate transactions.
    """
    base = f"{rule_id}:{d.isoformat()}"
    hi = _fnv1a_64(base.encode("utf-8"))
    lo = _fnv1a_64((base + "#saldo").encode("utf-8"))
    value = (hi << 64) | lo
    return uuid.UUID(int=value)
