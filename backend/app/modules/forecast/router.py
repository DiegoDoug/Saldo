"""Forecast HTTP endpoint — projected balances over a 7/30/90-day horizon.

Thin: gathers inputs (start balance, scheduled recurring events, historical daily
spend) and delegates the projection to the framework-free forecast core.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.forecast.schemas import ForecastResponse
from app.modules.forecast.service import build_forecast, forecast_inputs
from app.modules.identity.dependencies import CurrentUser

router = APIRouter(prefix="/forecast", tags=["forecast"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=ForecastResponse)
async def get_forecast(
    user: CurrentUser,
    session: Session,
    # Typically 7, 30, or 90 (the UI presets), but any horizon up to a year is
    # accepted; the projection is linear in the number of days.
    horizon: Annotated[int, Query(ge=1, le=365)] = 30,
):
    result = await build_forecast(session, user.id, horizon)
    start_balance, avg = await forecast_inputs(session, user.id)
    return ForecastResponse(
        horizon=horizon,
        start_balance=start_balance,
        avg_daily_net=avg,
        points=[{"date": p.date, "balance": p.balance} for p in result.points],
        end_balance=result.end_balance,
        min_balance=result.min_balance,
        min_date=result.min_date,
    )
