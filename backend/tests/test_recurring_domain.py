"""Pure recurrence math. Mirrored by frontend/src/shared/domain/recurring.test.ts
— both assert the SAME dates and the SAME deterministic occurrence id.
"""

from datetime import date

from app.shared.domain.recurring import advance, occurrence_id, occurrences_between


def test_advance_daily_weekly_biweekly() -> None:
    assert advance(date(2026, 1, 1), "daily", 1) == date(2026, 1, 2)
    assert advance(date(2026, 1, 1), "daily", 10) == date(2026, 1, 11)
    assert advance(date(2026, 1, 1), "weekly", 1) == date(2026, 1, 8)
    assert advance(date(2026, 1, 1), "biweekly", 1) == date(2026, 1, 15)


def test_advance_monthly_clamps_short_months() -> None:
    # Jan 31 + 1 month → Feb 28 (2026 is not a leap year).
    assert advance(date(2026, 1, 31), "monthly", 1) == date(2026, 2, 28)
    assert advance(date(2026, 1, 15), "quarterly", 1) == date(2026, 4, 15)


def test_advance_yearly_clamps_leap_day() -> None:
    assert advance(date(2024, 2, 29), "yearly", 1) == date(2025, 2, 28)


def test_occurrences_between_window_and_end_date() -> None:
    occ = occurrences_between(
        date(2026, 1, 1), "monthly", 1, date(2026, 1, 1), date(2026, 4, 15)
    )
    assert occ == [date(2026, 1, 1), date(2026, 2, 1), date(2026, 3, 1), date(2026, 4, 1)]

    # end_date stops generation early.
    bounded = occurrences_between(
        date(2026, 1, 1), "monthly", 1, date(2026, 1, 1), date(2026, 12, 31),
        end_date=date(2026, 2, 15),
    )
    assert bounded == [date(2026, 1, 1), date(2026, 2, 1)]


def test_occurrence_id_is_deterministic() -> None:
    rule = "11111111-1111-1111-1111-111111111111"
    first = occurrence_id(rule, date(2026, 1, 15))
    again = occurrence_id(rule, date(2026, 1, 15))
    assert first == again
    # Same literal the TS mirror asserts.
    assert str(first) == "a7cc883e-440f-666e-0731-025b44746f10"
    # Different date → different id.
    assert occurrence_id(rule, date(2026, 2, 15)) != first
