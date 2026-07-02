"""Pure goal math. Mirrored by frontend/src/shared/domain/goals.test.ts —
both assert the SAME numbers and the SAME completion dates.
"""

from datetime import date

from app.shared.domain.goals import (
    completion_date,
    months_remaining,
    progress,
    remaining_amount,
)


def test_progress_clamped() -> None:
    assert progress(200, 1000) == 0.2
    assert progress(1200, 1000) == 1.0
    assert progress(50, 0) == 0.0  # non-positive target


def test_remaining_amount_never_negative() -> None:
    assert remaining_amount(200, 1000) == 800
    assert remaining_amount(1200, 1000) == 0


def test_months_remaining() -> None:
    assert months_remaining(200, 1000, 100) == 8
    assert months_remaining(250, 1000, 100) == 8  # ceil of 7.5
    assert months_remaining(1000, 1000, 100) == 0  # met
    assert months_remaining(200, 1000, 0) is None  # unreachable


def test_completion_date_and_clamp() -> None:
    assert completion_date(date(2026, 1, 15), 200, 1000, 100) == date(2026, 9, 15)
    # Jan 31 + 1 month clamps to Feb 28.
    assert completion_date(date(2026, 1, 31), 900, 1000, 100) == date(2026, 2, 28)
    assert completion_date(date(2026, 1, 15), 200, 1000, 0) is None
