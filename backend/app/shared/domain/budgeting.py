"""Budgeting domain core — the actual product, ported from the prototype.

Framework-free. These are the reverse-engineered spreadsheet rules from
reference/Presupuesto.tsx, kept faithful to the original arithmetic (including
which sub-totals are rounded and which are not).

Per month:
    incomeTotal       = nomina + otros + Σ extras
    canSpend          = incomeTotal - savingsGoal          ("puedo gastar")
    expensesTotal     = Σ fixed + Σ variable
    endOfMonthSavings = incomeTotal - expensesTotal        ("ahorro a fin de mes")
    overspend         = expensesTotal > canSpend, but only when income > 0
Year = aggregation over its months.

The core works on plain amounts within a single currency. Multi-currency lives
at the boundary via the Money value object (see money.py); mixing currencies is
resolved to one currency *before* it reaches these functions.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.shared.domain.rounding import round2


@dataclass(frozen=True)
class MonthInput:
    """A month's raw figures, all in one currency.

    `extras`, `fixed`, and `variable` are the amounts of each dynamic line —
    category identity is a concern of the storage/UI layers, not this core.
    """

    nomina: float = 0.0
    otros: float = 0.0
    savings_goal: float = 0.0
    extras: Sequence[float] = field(default_factory=tuple)
    fixed: Sequence[float] = field(default_factory=tuple)
    variable: Sequence[float] = field(default_factory=tuple)


@dataclass(frozen=True)
class MonthResult:
    income_total: float
    extras_total: float
    fixed_total: float
    variable_total: float
    expenses_total: float
    goal: float
    can_spend: float
    end_of_month_savings: float
    remaining_to_spend: float
    met_goal: bool
    overspend: bool


@dataclass(frozen=True)
class YearResult:
    per_month: tuple[MonthResult, ...]
    income_total: float
    goal_total: float
    can_spend_total: float
    expenses_total: float
    fixed_total: float
    variable_total: float
    savings_total: float
    nomina_total: float
    otros_total: float


def compute_month(m: MonthInput) -> MonthResult:
    # extras_total is left unrounded here, exactly as in the prototype; the
    # rounding happens when it folds into income_total.
    extras_total = sum(m.extras)
    income_total = round2(m.nomina + m.otros + extras_total)
    fixed_total = round2(sum(m.fixed))
    variable_total = round2(sum(m.variable))
    expenses_total = round2(fixed_total + variable_total)
    goal = m.savings_goal
    can_spend = round2(income_total - goal)
    end_of_month_savings = round2(income_total - expenses_total)
    remaining_to_spend = round2(can_spend - expenses_total)
    return MonthResult(
        income_total=income_total,
        extras_total=extras_total,
        fixed_total=fixed_total,
        variable_total=variable_total,
        expenses_total=expenses_total,
        goal=goal,
        can_spend=can_spend,
        end_of_month_savings=end_of_month_savings,
        remaining_to_spend=remaining_to_spend,
        met_goal=end_of_month_savings >= goal,
        # The `income > 0` guard means a zero-income month is never "overspent",
        # even if it has expenses — matching the prototype.
        overspend=expenses_total > can_spend and income_total > 0,
    )


def compute_year(months: Sequence[MonthInput]) -> YearResult:
    per_month = tuple(compute_month(m) for m in months)

    def total(select) -> float:
        return round2(sum(select(c) for c in per_month))

    return YearResult(
        per_month=per_month,
        income_total=total(lambda c: c.income_total),
        goal_total=total(lambda c: c.goal),
        can_spend_total=total(lambda c: c.can_spend),
        expenses_total=total(lambda c: c.expenses_total),
        fixed_total=total(lambda c: c.fixed_total),
        variable_total=total(lambda c: c.variable_total),
        savings_total=total(lambda c: c.end_of_month_savings),
        nomina_total=round2(sum(m.nomina for m in months)),
        otros_total=round2(sum(m.otros + sum(m.extras) for m in months)),
    )
