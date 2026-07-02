"""Merchants API: CRUD, spend stats, transaction linkage, and isolation."""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def make_account(client: AsyncClient, h: dict, name: str) -> str:
    resp = await client.post("/accounts", json={"name": name, "type": "checking"}, headers=h)
    return resp.json()["id"]


async def test_merchant_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    created = await client.post(
        "/merchants",
        json={"name": "Mercadona", "color": "#0a0", "recurring_probability": 0.2},
        headers=h,
    )
    assert created.status_code == 201
    m = created.json()
    assert m["name"] == "Mercadona"
    assert m["recurring_probability"] == 0.2

    assert len((await client.get("/merchants", headers=h)).json()) == 1

    patched = await client.patch(
        f"/merchants/{m['id']}", json={"website": "https://mercadona.es"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["website"] == "https://mercadona.es"

    deleted = await client.delete(f"/merchants/{m['id']}", headers=h)
    assert deleted.status_code == 204
    assert len((await client.get("/merchants", headers=h)).json()) == 0
    assert len((await client.get("/merchants?include_deleted=true", headers=h)).json()) == 1


async def test_recurring_probability_bounds(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    bad = await client.post(
        "/merchants", json={"name": "X", "recurring_probability": 1.5}, headers=h
    )
    assert bad.status_code == 422


async def test_merchant_stats_and_transaction_link(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    mid = (await client.post("/merchants", json={"name": "Netflix"}, headers=h)).json()["id"]

    for amount in (10.0, 15.0):
        r = await client.post(
            "/transactions",
            json={
                "type": "expense",
                "amount": amount,
                "account_id": aid,
                "merchant_id": mid,
                "date": "2026-01-15",
            },
            headers=h,
        )
        assert r.status_code == 201

    # Filter transactions by merchant.
    listed = await client.get(f"/transactions?merchant_id={mid}", headers=h)
    assert listed.json()["total"] == 2

    stats = (await client.get(f"/merchants/{mid}/stats", headers=h)).json()
    assert stats["transaction_count"] == 2
    assert stats["total_spent"] == 25.0
    assert stats["total_received"] == 0.0


async def test_transaction_rejects_foreign_merchant(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    created = await client.post("/merchants", json={"name": "Ana Shop"}, headers=ana)
    ana_merchant = created.json()["id"]
    bob_account = await make_account(client, bob, "Bob Checking")

    r = await client.post(
        "/transactions",
        json={
            "type": "expense",
            "amount": 5,
            "account_id": bob_account,
            "merchant_id": ana_merchant,
            "date": "2026-01-15",
        },
        headers=bob,
    )
    assert r.status_code == 400


async def test_merchants_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    mid = (await client.post("/merchants", json={"name": "Ana Shop"}, headers=ana)).json()["id"]

    assert len((await client.get("/merchants", headers=bob)).json()) == 0
    assert (await client.get(f"/merchants/{mid}", headers=bob)).status_code == 404
    assert (await client.get(f"/merchants/{mid}/stats", headers=bob)).status_code == 404
    patched = await client.patch(f"/merchants/{mid}", json={"name": "hax"}, headers=bob)
    assert patched.status_code == 404
    assert (await client.delete(f"/merchants/{mid}", headers=bob)).status_code == 404
