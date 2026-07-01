"""Multi-currency month summary.

FX is stubbed (no network) via a dependency override, so the test is
deterministic and proves two things: a single-currency month never calls FX, and
a mixed-currency month converts to the user's default currency and totals
correctly.
"""

from httpx import AsyncClient

from app.main import app
from app.shared.currency import get_fx_provider


class StubFx:
    def __init__(self, rates: dict[tuple[str, str], float]) -> None:
        self.rates = rates
        self.calls = 0

    async def get_rate(self, base: str, target: str) -> float:
        self.calls += 1
        base, target = base.upper(), target.upper()
        if base == target:
            return 1.0
        return self.rates[(base, target)]


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def add_income(client: AsyncClient, headers: dict, amount: float, currency: str) -> None:
    r = await client.post(
        "/budgeting/entries",
        json={"year": 2026, "month": 0, "kind": "income", "amount": amount, "currency": currency},
        headers=headers,
    )
    assert r.status_code == 201


async def test_single_currency_month_does_not_call_fx(client: AsyncClient) -> None:
    stub = StubFx({})
    app.dependency_overrides[get_fx_provider] = lambda: stub
    try:
        h = await auth_headers(client, "ana@example.com", "passphrase-1")
        await add_income(client, h, 100, "EUR")
        await add_income(client, h, 50, "EUR")
        summary = await client.get("/budgeting/summary/2026/0", headers=h)
        assert summary.json()["income_total"] == 150
        assert stub.calls == 0  # no FX for a single-currency view
    finally:
        app.dependency_overrides.pop(get_fx_provider, None)


async def test_mixed_currency_month_converts_to_default(client: AsyncClient) -> None:
    # 1 USD -> 0.5 EUR for a clean expected total.
    stub = StubFx({("USD", "EUR"): 0.5})
    app.dependency_overrides[get_fx_provider] = lambda: stub
    try:
        h = await auth_headers(client, "ana@example.com", "passphrase-1")
        await add_income(client, h, 100, "EUR")
        await add_income(client, h, 100, "USD")  # -> 50 EUR
        summary = await client.get("/budgeting/summary/2026/0", headers=h)
        assert summary.json()["income_total"] == 150  # 100 + 50
        assert stub.calls >= 1  # FX consulted because currencies mixed
    finally:
        app.dependency_overrides.pop(get_fx_provider, None)
