"""Pure forecast math. Mirrored by frontend/src/shared/domain/forecast.test.ts
— both assert the SAME projected balances.
"""

from datetime import date

from app.shared.domain.forecast import forecast


def test_projection_applies_daily_net_and_scheduled_events() -> None:
    result = forecast(
        start_balance=1000,
        start_date=date(2026, 1, 1),
        days=3,
        scheduled={"2026-01-02": -50, "2026-01-03": 200},
        avg_daily_net=-10,
    )
    assert [(p.date, p.balance) for p in result.points] == [
        ("2026-01-01", 1000),
        ("2026-01-02", 940),
        ("2026-01-03", 1130),
        ("2026-01-04", 1120),
    ]
    assert result.end_balance == 1120
    assert result.min_balance == 940
    assert result.min_date == "2026-01-02"


def test_projection_length_matches_horizon() -> None:
    result = forecast(0, date(2026, 1, 1), 30, {}, -5)
    assert len(result.points) == 31  # start day + 30 projected
    assert result.end_balance == -150
    assert result.min_date == "2026-01-31"
