"""Pure, framework-free net-worth math. No I/O, no framework imports (mirrors
`shared/domain/budgeting`). The TS core in
`frontend/src/shared/domain/networth.ts` must agree on the same numbers.

Net worth is intentionally simple arithmetic, but it is a *formula* so it lives
here and is mirrored (per the repo's dual-core rule):

  net_worth  = assets_total - liabilities_total
  growth     = (current - previous) / |previous|   (None when previous == 0)
  allocation = each bucket's share of the positive total (fractions in [0, 1])
"""

from __future__ import annotations


def net_worth(assets_total: float, liabilities_total: float) -> float:
    return assets_total - liabilities_total


def growth(current: float, previous: float) -> float | None:
    """Fractional change from `previous` to `current`.

    None when there is no baseline (previous == 0) — a percentage change from
    zero is undefined rather than infinite.
    """
    if previous == 0:
        return None
    return (current - previous) / abs(previous)


def allocation(buckets: dict[str, float]) -> dict[str, float]:
    """Each positive bucket's share of the total. Non-positive buckets are 0."""
    total = sum(v for v in buckets.values() if v > 0)
    if total <= 0:
        return {k: 0.0 for k in buckets}
    return {k: (v / total if v > 0 else 0.0) for k, v in buckets.items()}
