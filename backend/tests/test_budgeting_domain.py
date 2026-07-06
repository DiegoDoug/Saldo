"""Tests for the budgeting domain core.

This is the highest-value code in the app, so it gets the hardest tests:
the formulas from ARCHITECTURE.md and the prototype, plus edge cases
(zero income, overspend, negative goal) and rounding parity with the frontend.

The literal expected numbers here are the shared contract with the TypeScript
core (frontend/src/shared/domain/budgeting.test.ts) — the same cases appear on
both sides with the same expected values.
"""

from app.shared.domain.budgeting import (
    MonthInput,
    compute_budget_variance,
    compute_month,
    compute_year,
)


def test_seed_month_from_sheet() -> None:
    # nomina 1500, otros 50, goal 200 — the seeded example from the spreadsheet.
    r = compute_month(MonthInput(nomina=1500, otros=50, savings_goal=200))
    assert r.income_total == 1550
    assert r.expenses_total == 0
    assert r.can_spend == 1350
    assert r.end_of_month_savings == 1550
    assert r.remaining_to_spend == 1350
    assert r.met_goal is True
    assert r.overspend is False


def test_income_sums_nomina_otros_and_extras() -> None:
    r = compute_month(MonthInput(nomina=1000, otros=200, extras=[300, 50.5]))
    assert r.extras_total == 350.5
    assert r.income_total == 1550.5


def test_expenses_sum_fixed_and_variable() -> None:
    r = compute_month(
        MonthInput(
            nomina=2000,
            fixed=[800, 120.25],
            variable=[50, 49.75],
        )
    )
    assert r.fixed_total == 920.25
    assert r.variable_total == 99.75
    assert r.expenses_total == 1020
    assert r.end_of_month_savings == 980


def test_overspend_when_expenses_exceed_can_spend() -> None:
    r = compute_month(MonthInput(nomina=1000, savings_goal=200, fixed=[900]))
    assert r.can_spend == 800
    assert r.expenses_total == 900
    assert r.overspend is True
    assert r.remaining_to_spend == -100
    assert r.end_of_month_savings == 100


def test_zero_income_is_never_overspent() -> None:
    # Expenses with no income: prototype's `income > 0` guard means NOT overspend.
    r = compute_month(MonthInput(fixed=[50]))
    assert r.income_total == 0
    assert r.expenses_total == 50
    assert r.can_spend == 0
    assert r.overspend is False


def test_all_zero_month() -> None:
    r = compute_month(MonthInput())
    assert r.income_total == 0
    assert r.expenses_total == 0
    assert r.can_spend == 0
    assert r.end_of_month_savings == 0
    assert r.overspend is False
    assert r.met_goal is True  # 0 >= 0


def test_negative_goal_raises_can_spend_above_income() -> None:
    r = compute_month(MonthInput(nomina=1000, savings_goal=-500))
    assert r.can_spend == 1500
    assert r.met_goal is True


def test_rounding_matches_js_math_round_half_up() -> None:
    # 0.1 + 0.2 float noise collapses to 0.30.
    assert compute_month(MonthInput(nomina=0.1, otros=0.2)).income_total == 0.30
    # Half rounds up (JS Math.round), NOT banker's rounding:
    # 0.125 -> 0.13 (banker's round() would give 0.12).
    assert compute_month(MonthInput(nomina=0.125)).income_total == 0.13


def test_met_goal_boundary() -> None:
    # Exactly meeting the goal counts as met.
    r = compute_month(MonthInput(nomina=1000, savings_goal=1000))
    assert r.end_of_month_savings == 1000
    assert r.met_goal is True


def test_compute_year_aggregates_twelve_months() -> None:
    months = [MonthInput(nomina=1500, otros=50, savings_goal=200) for _ in range(12)]
    y = compute_year(months)
    assert len(y.per_month) == 12
    assert y.income_total == 12 * 1550
    assert y.goal_total == 12 * 200
    assert y.can_spend_total == 12 * 1350
    assert y.expenses_total == 0
    assert y.savings_total == 12 * 1550
    assert y.nomina_total == 12 * 1500
    # otros_total folds in extras too (prototype behaviour).
    assert y.otros_total == 12 * 50


# ----------------------------------------------------------------------
# Budget-vs-actual variance (mirrored in budgeting.test.ts with the SAME numbers)
# ----------------------------------------------------------------------
def test_budget_variance_per_category_and_totals() -> None:
    v = compute_budget_variance(
        {"a": 100, "b": 200, "c": 50},
        {"a": 120, "b": 150, "d": 30},
    )
    assert v.by_category["a"].remaining == -20 and v.by_category["a"].over is True
    assert v.by_category["b"].remaining == 50 and v.by_category["b"].over is False
    # Budgeted-but-unspent shows up with actual 0.
    assert v.by_category["c"].actual == 0 and v.by_category["c"].remaining == 50
    # Spent-without-budget shows up with budgeted 0 and over=True.
    assert v.by_category["d"].budgeted == 0 and v.by_category["d"].over is True
    assert v.budgeted_total == 350
    assert v.actual_total == 300
    assert v.remaining_total == 50


def test_budget_variance_rounding_parity() -> None:
    v = compute_budget_variance({"x": 0.1}, {"x": 0.2})
    assert v.by_category["x"].budgeted == 0.1
    assert v.by_category["x"].actual == 0.2
    assert v.by_category["x"].remaining == -0.1
    assert v.remaining_total == -0.1
    # Half rounds up (round2), matching the frontend: 0.125 -> 0.13.
    assert compute_budget_variance({"x": 0.125}, {}).by_category["x"].budgeted == 0.13


def test_budget_variance_empty() -> None:
    v = compute_budget_variance({}, {})
    assert v.by_category == {}
    assert v.budgeted_total == 0
    assert v.actual_total == 0
    assert v.remaining_total == 0


def test_compute_year_mixed_months() -> None:
    months = [
        MonthInput(nomina=1000, fixed=[300], variable=[200]),
        MonthInput(nomina=2000, otros=100, extras=[50], fixed=[400], variable=[100]),
    ]
    y = compute_year(months)
    assert y.income_total == 1000 + 2150
    assert y.expenses_total == 500 + 500
    assert y.fixed_total == 700
    assert y.variable_total == 300
    assert y.savings_total == 500 + 1650
    assert y.otros_total == 0 + 150  # otros(100) + extras(50)
