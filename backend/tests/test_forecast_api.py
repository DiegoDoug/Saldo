"""Forecast API: projects balances from accounts + recurring rules + history,
and stays user-scoped. The projection arithmetic is covered by
test_forecast_domain; here we verify the endpoint assembles inputs correctly.
"""

from datetime import date, timedelta

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def make_account(client: AsyncClient, h: dict, opening: float) -> str:
    resp = await client.post(
        "/accounts", json={"name": "Checking", "type": "checking", "opening_balance": opening},
        headers=h,
    )
    return resp.json()["id"]


async def test_forecast_starts_from_current_balance(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    await make_account(client, h, 1500.0)

    resp = await client.get("/forecast?horizon=30", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["horizon"] == 30
    assert body["start_balance"] == 1500.0
    assert len(body["points"]) == 31
    assert body["points"][0]["balance"] == 1500.0
    # No history and no recurring rules → flat projection.
    assert body["avg_daily_net"] == 0.0
    assert body["end_balance"] == 1500.0


async def test_forecast_includes_recurring_income(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, 0.0)
    soon = (date.today() + timedelta(days=3)).isoformat()
    await client.post(
        "/recurring",
        json={
            "name": "Payday",
            "type": "income",
            "amount": 1000,
            "account_id": aid,
            "frequency": "monthly",
            "start_date": soon,
        },
        headers=h,
    )

    body = (await client.get("/forecast?horizon=7", headers=h)).json()
    # The scheduled income lands within the horizon, lifting the end balance.
    assert body["end_balance"] == 1000.0


async def test_forecast_is_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    await make_account(client, ana, 5000.0)

    # Bob has no accounts → zero start balance, unaffected by Ana's data.
    body = (await client.get("/forecast?horizon=7", headers=bob)).json()
    assert body["start_balance"] == 0.0
