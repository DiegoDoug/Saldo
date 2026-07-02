"""Reports HTTP endpoint — analytics computed from the user's transactions.

Thin: it loads the caller's (optionally date-filtered) transactions, hands them
to the framework-free reports core, and returns the result. All the arithmetic
lives in `app.shared.domain.reports`, mirrored by the TS core so the offline
Reports page produces identical numbers.
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_session
from app.modules.identity.dependencies import CurrentUser
from app.modules.reports.schemas import ReportResponse
from app.modules.transactions.models import Transaction
from app.shared.domain.reports import ReportTx, build_report

router = APIRouter(prefix="/reports", tags=["reports"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=ReportResponse)
async def get_report(
    user: CurrentUser,
    session: Session,
    date_from: str | None = None,
    date_to: str | None = None,
    largest_n: Annotated[int, Query(ge=1, le=50)] = 5,
):
    stmt = select(Transaction).where(
        Transaction.user_id == user.id,
        Transaction.deleted == False,  # noqa: E712
    )
    if date_from:
        stmt = stmt.where(Transaction.date >= date.fromisoformat(date_from))
    if date_to:
        stmt = stmt.where(Transaction.date <= date.fromisoformat(date_to))
    rows = (await session.execute(stmt)).scalars().all()

    report = build_report(
        [
            ReportTx(
                type=t.type,
                amount=t.amount,
                date=t.date.isoformat(),
                category_id=str(t.category_id) if t.category_id else None,
                merchant_id=str(t.merchant_id) if t.merchant_id else None,
            )
            for t in rows
        ],
        largest_n=largest_n,
    )
    return ReportResponse(
        by_month=[vars(p) for p in report.by_month],
        spending_by_category=[vars(k) for k in report.spending_by_category],
        spending_by_merchant=[vars(k) for k in report.spending_by_merchant],
        largest_expenses=[
            {
                "amount": t.amount,
                "date": t.date,
                "category_id": t.category_id,
                "merchant_id": t.merchant_id,
            }
            for t in report.largest_expenses
        ],
        income_total=report.income_total,
        expense_total=report.expense_total,
        net=report.net,
        savings_rate=report.savings_rate,
        health_score=report.health_score,
    )
