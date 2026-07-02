"""Reports API: analytics over the caller's transactions, date filtering, and
user scoping. The arithmetic is covered by test_reports_domain; here we verify
the endpoint wires transactions into the core and stays user-scoped.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def make_account(client: AsyncClient, h: dict) -> str:
    resp = await client.post("/accounts", json={"name": "Checking", "type": "checking"}, headers=h)
    return resp.json()["id"]


async def add_tx(client: AsyncClient, h: dict, account_id: str, **kw) -> None:
    payload = {"account_id": account_id, "currency": "EUR", **kw}
    await client.post("/transactions", json=payload, headers=h)


async def test_report_totals_and_breakdowns(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h)
    cat_resp = await client.post(
        "/budgeting/categories", json={"name": "Food", "kind": "variable"}, headers=h
    )
    cat = cat_resp.json()

    await add_tx(client, h, aid, type="income", amount=2000, date="2026-01-05")
    await add_tx(
        client, h, aid, type="expense", amount=500, date="2026-01-10", category_id=cat["id"]
    )
    await add_tx(client, h, aid, type="expense", amount=300, date="2026-02-10")

    report = await client.get("/reports", headers=h)
    assert report.status_code == 200
    body = report.json()
    assert body["income_total"] == 2000
    assert body["expense_total"] == 800
    assert body["net"] == 1200
    assert body["savings_rate"] == 0.6
    assert len(body["by_month"]) == 2
    assert body["spending_by_category"][0] == {"key": cat["id"], "total": 500}
    assert body["largest_expenses"][0]["amount"] == 500


async def test_report_date_filter(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h)
    await add_tx(client, h, aid, type="expense", amount=100, date="2026-01-10")
    await add_tx(client, h, aid, type="expense", amount=200, date="2026-03-10")

    ranged = await client.get("/reports?date_from=2026-02-01&date_to=2026-12-31", headers=h)
    assert ranged.json()["expense_total"] == 200


async def test_report_is_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    aid = await make_account(client, ana)
    await add_tx(client, ana, aid, type="income", amount=999, date="2026-01-05")

    # Bob's report sees none of Ana's transactions.
    body = (await client.get("/reports", headers=bob)).json()
    assert body["income_total"] == 0
    assert body["expense_total"] == 0
