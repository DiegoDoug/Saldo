"""Response schemas for the reports API — a Pydantic view of the domain core's
`Report` (see `app.shared.domain.reports`). No new arithmetic lives here.
"""

from pydantic import BaseModel


class MonthPoint(BaseModel):
    month: str
    income: float
    expense: float
    net: float


class KeyTotal(BaseModel):
    key: str
    total: float


class LargestExpense(BaseModel):
    amount: float
    date: str
    category_id: str | None
    merchant_id: str | None


class ReportResponse(BaseModel):
    by_month: list[MonthPoint]
    spending_by_category: list[KeyTotal]
    spending_by_merchant: list[KeyTotal]
    largest_expenses: list[LargestExpense]
    income_total: float
    expense_total: float
    net: float
    savings_rate: float
    health_score: int
