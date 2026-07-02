"""Pure, framework-free cash-flow forecasting. No I/O, no framework imports
(mirrors `shared/domain/budgeting`). The TS core in
`frontend/src/shared/domain/forecast.ts` must agree on the same balances.

The projection walks day by day from a starting balance, applying:
  - `avg_daily_net`: the average *discretionary* daily change from history
    (typically negative — everyday spending not tied to a recurring rule), and
  - `scheduled`: known dated events (recurring income +, recurring bills −),
    keyed by ISO date.

The caller (server or client) supplies those two inputs; the arithmetic here is
identical on both sides so the offline Forecast page matches the API.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class ForecastPoint:
    date: str  # YYYY-MM-DD
    balance: float


@dataclass
class ForecastResult:
    points: list[ForecastPoint]
    end_balance: float
    min_balance: float
    min_date: str


def forecast(
    start_balance: float,
    start_date: date,
    days: int,
    scheduled: dict[str, float],
    avg_daily_net: float,
) -> ForecastResult:
    points = [ForecastPoint(start_date.isoformat(), start_balance)]
    balance = start_balance
    current = start_date
    for _ in range(days):
        current = current + timedelta(days=1)
        balance += avg_daily_net + scheduled.get(current.isoformat(), 0.0)
        points.append(ForecastPoint(current.isoformat(), balance))

    # First point achieving the minimum (ties resolve to the earliest date).
    min_point = points[0]
    for point in points:
        if point.balance < min_point.balance:
            min_point = point

    return ForecastResult(
        points=points,
        end_balance=points[-1].balance,
        min_balance=min_point.balance,
        min_date=min_point.date,
    )
