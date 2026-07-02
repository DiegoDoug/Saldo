"""Response schema for the forecast API — a Pydantic view of the domain core's
`ForecastResult` plus the inputs used, for transparency.
"""

from pydantic import BaseModel


class ForecastPoint(BaseModel):
    date: str
    balance: float


class ForecastResponse(BaseModel):
    horizon: int
    start_balance: float
    avg_daily_net: float
    points: list[ForecastPoint]
    end_balance: float
    min_balance: float
    min_date: str
