"""Pure net-worth math. Mirrored by frontend/src/shared/domain/networth.test.ts
— both assert the SAME numbers.
"""

from app.shared.domain.networth import allocation, growth, net_worth


def test_net_worth() -> None:
    assert net_worth(1500, 400) == 1100
    assert net_worth(200, 500) == -300


def test_growth() -> None:
    assert growth(1100, 1000) == 0.1
    assert growth(100, 0) is None  # no baseline
    assert growth(-50, -100) == 0.5  # relative to magnitude


def test_allocation() -> None:
    alloc = allocation({"cash": 600, "property": 900, "debt": -100})
    assert alloc["cash"] == 0.4
    assert alloc["property"] == 0.6
    assert alloc["debt"] == 0.0  # non-positive buckets don't take a share

    assert allocation({"a": 0, "b": 0}) == {"a": 0.0, "b": 0.0}
