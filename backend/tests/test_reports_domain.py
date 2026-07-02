"""Pure analytics. Mirrored by frontend/src/shared/domain/reports.test.ts —
both assert the SAME numbers on the same fixed dataset.
"""

from app.shared.domain.reports import ReportTx, build_report, health_score, savings_rate

DATASET = [
    ReportTx("income", 2000, "2026-01-05"),
    ReportTx("expense", 500, "2026-01-10", "food", "m1"),
    ReportTx("expense", 300, "2026-01-20", "rent", None),
    ReportTx("income", 2000, "2026-02-05"),
    ReportTx("expense", 800, "2026-02-10", "food", "m1"),
    ReportTx("transfer", 1000, "2026-02-15"),  # excluded
]


def test_savings_rate_and_health() -> None:
    assert savings_rate(1000, 800) == 0.2
    assert savings_rate(0, 100) == 0.0  # no income
    assert health_score(0.2) == 67
    assert health_score(0.30) == 100
    assert health_score(-0.1) == 0


def test_build_report_totals() -> None:
    r = build_report(DATASET)
    assert r.income_total == 4000
    assert r.expense_total == 1600
    assert r.net == 2400
    assert r.savings_rate == 0.6
    assert r.health_score == 100


def test_build_report_breakdowns() -> None:
    r = build_report(DATASET)
    assert [(p.month, p.income, p.expense, p.net) for p in r.by_month] == [
        ("2026-01", 2000, 800, 1200),
        ("2026-02", 2000, 800, 1200),
    ]
    assert [(k.key, k.total) for k in r.spending_by_category] == [("food", 1300), ("rent", 300)]
    assert [(k.key, k.total) for k in r.spending_by_merchant] == [("m1", 1300)]
    # Transfers never appear as spending.
    assert [t.amount for t in r.largest_expenses] == [800, 500, 300]
