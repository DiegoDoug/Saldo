"""Accounts API: CRUD, derived balances, and the cross-user isolation invariant.

Mirrors the budgeting API tests. The isolation test proves a second user can
neither read nor mutate the first user's accounts — the same security boundary
that protects every piece of financial data.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_account_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    created = await client.post(
        "/accounts",
        json={"name": "Checking", "type": "checking", "opening_balance": 100.0},
        headers=h,
    )
    assert created.status_code == 201
    acc = created.json()
    assert acc["name"] == "Checking"
    assert acc["type"] == "checking"
    assert acc["currency"] == "EUR"

    listed = await client.get("/accounts", headers=h)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    patched = await client.patch(
        f"/accounts/{acc['id']}", json={"name": "Main", "currency": "usd"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Main"
    assert patched.json()["currency"] == "USD"  # normalized

    deleted = await client.delete(f"/accounts/{acc['id']}", headers=h)
    assert deleted.status_code == 204
    # Soft-deleted: gone from the default list, present when include_deleted.
    assert len((await client.get("/accounts", headers=h)).json()) == 0
    assert len((await client.get("/accounts?include_deleted=true", headers=h)).json()) == 1


async def test_archived_accounts_hidden_by_default(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    created = await client.post(
        "/accounts", json={"name": "Old", "type": "cash"}, headers=h
    )
    aid = created.json()["id"]
    await client.patch(f"/accounts/{aid}", json={"archived": True}, headers=h)

    assert len((await client.get("/accounts", headers=h)).json()) == 0
    assert len((await client.get("/accounts?include_archived=true", headers=h)).json()) == 1


async def test_balances_default_to_opening_balance(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    await client.post(
        "/accounts",
        json={"name": "Checking", "type": "checking", "opening_balance": 250.5},
        headers=h,
    )
    await client.post(
        "/accounts",
        json={"name": "USD Cash", "type": "cash", "currency": "USD", "opening_balance": 40.0},
        headers=h,
    )

    resp = await client.get("/accounts/balances", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["accounts"]) == 2
    # No transactions yet, so balance == opening_balance.
    assert all(a["balance"] == a["opening_balance"] for a in body["accounts"])
    assert body["totals_by_currency"]["EUR"] == 250.5
    assert body["totals_by_currency"]["USD"] == 40.0


async def test_accounts_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")

    created = await client.post(
        "/accounts", json={"name": "Ana Checking", "type": "checking"}, headers=ana
    )
    aid = created.json()["id"]

    # Bob cannot see, read, patch, or delete Ana's account.
    assert len((await client.get("/accounts", headers=bob)).json()) == 0
    assert (await client.get(f"/accounts/{aid}", headers=bob)).status_code == 404
    patched = await client.patch(f"/accounts/{aid}", json={"name": "hax"}, headers=bob)
    assert patched.status_code == 404
    assert (await client.delete(f"/accounts/{aid}", headers=bob)).status_code == 404

    # Ana still owns an untouched account.
    assert (await client.get(f"/accounts/{aid}", headers=ana)).json()["name"] == "Ana Checking"
