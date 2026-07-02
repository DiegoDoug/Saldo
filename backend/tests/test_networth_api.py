"""Net-worth API: assets/liabilities CRUD, computed summary (incl. account
balances), snapshots, and cross-user isolation.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def make_account(client: AsyncClient, h: dict, name: str, opening: float) -> str:
    resp = await client.post(
        "/accounts", json={"name": name, "type": "checking", "opening_balance": opening}, headers=h
    )
    return resp.json()["id"]


async def test_asset_and_liability_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    asset = await client.post(
        "/assets", json={"name": "Piso", "kind": "property", "value": 200000}, headers=h
    )
    assert asset.status_code == 201
    assert len((await client.get("/assets", headers=h)).json()) == 1

    liab = await client.post(
        "/liabilities",
        json={"name": "Hipoteca", "kind": "mortgage", "balance": 120000, "interest_rate": 2.5},
        headers=h,
    )
    assert liab.status_code == 201
    lid = liab.json()["id"]
    patched = await client.patch(f"/liabilities/{lid}", json={"balance": 119000}, headers=h)
    assert patched.json()["balance"] == 119000

    await client.delete(f"/assets/{asset.json()['id']}", headers=h)
    assert len((await client.get("/assets", headers=h)).json()) == 0


async def test_net_worth_aggregates_accounts_assets_liabilities(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    await make_account(client, h, "Checking", 1000.0)  # +1000 asset
    await client.post("/assets", json={"name": "Car", "kind": "vehicle", "value": 5000}, headers=h)
    await client.post(
        "/liabilities", json={"name": "Loan", "kind": "loan", "balance": 2000}, headers=h
    )

    nw = await client.get("/net-worth", headers=h)
    assert nw.status_code == 200
    body = nw.json()
    assert body["assets_total"] == 6000.0  # 1000 account + 5000 car
    assert body["liabilities_total"] == 2000.0
    assert body["net_worth"] == 4000.0
    # Allocation shares of the positive asset side sum to ~1.
    assert abs(sum(body["allocation"].values()) - 1.0) < 1e-9
    assert body["monthly_growth"] is None  # no prior snapshot


async def test_snapshot_history_and_growth(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    await make_account(client, h, "Checking", 1000.0)

    snap = await client.post("/net-worth/snapshot", headers=h)
    assert snap.status_code == 200
    assert snap.json()["net_worth"] == 1000.0

    history = await client.get("/net-worth/history", headers=h)
    assert len(history.json()) == 1

    # Re-recording the same day updates the row rather than adding a second.
    await client.post("/net-worth/snapshot", headers=h)
    assert len((await client.get("/net-worth/history", headers=h)).json()) == 1


async def test_networth_is_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    asset = await client.post("/assets", json={"name": "Ana Gold", "value": 100}, headers=ana)
    aid = asset.json()["id"]

    assert len((await client.get("/assets", headers=bob)).json()) == 0
    patched = await client.patch(f"/assets/{aid}", json={"value": 0}, headers=bob)
    assert patched.status_code == 404
    assert (await client.delete(f"/assets/{aid}", headers=bob)).status_code == 404
    # Bob's own net worth doesn't see Ana's asset.
    assert (await client.get("/net-worth", headers=bob)).json()["assets_total"] == 0.0
