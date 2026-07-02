"""Pure, framework-free analytics over transactions. No I/O, no framework
imports (mirrors `shared/domain/budgeting`). The TS core in
`frontend/src/shared/domain/reports.ts` must agree on the same numbers — the
mirrored tests assert identical values on a fixed dataset.

Everything is computed from a normalized transaction list so the same code runs
server-side (over SQL rows) and client-side (over Dexie rows). Transfers are
internal moves and are excluded from income/expense analytics.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ReportTx:
    type: str  # income | expense | transfer
    amount: float
    date: str  # YYYY-MM-DD
    category_id: str | None = None
    merchant_id: str | None = None


@dataclass
class MonthPoint:
    month: str  # YYYY-MM
    income: float = 0.0
    expense: float = 0.0
    net: float = 0.0


@dataclass
class KeyTotal:
    key: str
    total: float


@dataclass
class Report:
    by_month: list[MonthPoint] = field(default_factory=list)
    spending_by_category: list[KeyTotal] = field(default_factory=list)
    spending_by_merchant: list[KeyTotal] = field(default_factory=list)
    largest_expenses: list[ReportTx] = field(default_factory=list)
    income_total: float = 0.0
    expense_total: float = 0.0
    net: float = 0.0
    savings_rate: float = 0.0
    health_score: int = 0


def savings_rate(income_total: float, expense_total: float) -> float:
    """Fraction of income kept. 0 when there is no income."""
    if income_total <= 0:
        return 0.0
    return (income_total - expense_total) / income_total


def health_score(rate: float) -> int:
    """Financial-health score in [0, 100], from the savings rate.

    A savings rate of 30%+ is full marks; 0% or negative is 0. Linear between.
    """
    scaled = round((rate / 0.30) * 100)
    return max(0, min(100, scaled))


def _sorted_totals(totals: dict[str, float]) -> list[KeyTotal]:
    return [
        KeyTotal(key=k, total=v)
        for k, v in sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def build_report(txs: list[ReportTx], largest_n: int = 5) -> Report:
    months: dict[str, MonthPoint] = {}
    by_category: dict[str, float] = {}
    by_merchant: dict[str, float] = {}
    income_total = 0.0
    expense_total = 0.0
    expenses: list[ReportTx] = []

    for tx in txs:
        if tx.type == "transfer":
            continue  # internal move, not spending or income
        month = tx.date[:7]
        point = months.setdefault(month, MonthPoint(month=month))
        if tx.type == "income":
            income_total += tx.amount
            point.income += tx.amount
        elif tx.type == "expense":
            expense_total += tx.amount
            point.expense += tx.amount
            expenses.append(tx)
            if tx.category_id is not None:
                by_category[tx.category_id] = by_category.get(tx.category_id, 0.0) + tx.amount
            if tx.merchant_id is not None:
                by_merchant[tx.merchant_id] = by_merchant.get(tx.merchant_id, 0.0) + tx.amount
        point.net = point.income - point.expense

    rate = savings_rate(income_total, expense_total)
    return Report(
        by_month=[months[m] for m in sorted(months)],
        spending_by_category=_sorted_totals(by_category),
        spending_by_merchant=_sorted_totals(by_merchant),
        largest_expenses=sorted(expenses, key=lambda t: (-t.amount, t.date))[:largest_n],
        income_total=income_total,
        expense_total=expense_total,
        net=income_total - expense_total,
        savings_rate=rate,
        health_score=health_score(rate),
    )
