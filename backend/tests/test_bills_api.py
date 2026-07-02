"""Recurring rules / bills API: CRUD, upcoming projection, materialization
(idempotent + deterministic ids), and cross-user isolation.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def make_account(client: AsyncClient, h: dict, name: str) -> str:
    resp = await client.post("/accounts", json={"name": name, "type": "checking"}, headers=h)
    return resp.json()["id"]


def rule_payload(account_id: str, **overrides) -> dict:
    base = {
        "name": "Netflix",
        "type": "expense",
        "amount": 12.0,
        "account_id": account_id,
        "frequency": "monthly",
        "interval": 1,
        "start_date": "2026-01-10",
    }
    base.update(overrides)
    return base


async def test_rule_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")

    created = await client.post("/recurring", json=rule_payload(aid), headers=h)
    assert created.status_code == 201
    rule = created.json()
    assert rule["frequency"] == "monthly"
    # next_run defaults to start_date.
    assert rule["next_run"] == "2026-01-10"

    assert len((await client.get("/recurring", headers=h)).json()) == 1

    patched = await client.patch(f"/recurring/{rule['id']}", json={"amount": 15.0}, headers=h)
    assert patched.status_code == 200
    assert patched.json()["amount"] == 15.0

    deleted = await client.delete(f"/recurring/{rule['id']}", headers=h)
    assert deleted.status_code == 204
    assert len((await client.get("/recurring", headers=h)).json()) == 0


async def test_upcoming_projection_does_not_persist(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    await client.post("/recurring", json=rule_payload(aid, start_date="2026-01-01"), headers=h)

    upcoming = await client.get("/bills/upcoming?days=90", headers=h)
    assert upcoming.status_code == 200
    bills = upcoming.json()
    assert len(bills) >= 1
    assert bills[0]["name"] == "Netflix"
    # Projection is not persisted as transactions.
    assert (await client.get("/transactions", headers=h)).json()["total"] == 0


async def test_materialize_is_idempotent_and_advances_next_run(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    rule = (
        await client.post("/recurring", json=rule_payload(aid, start_date="2026-01-01"), headers=h)
    ).json()

    # Materialize the Jan, Feb, Mar occurrences.
    resp = await client.post(f"/recurring/{rule['id']}/materialize?until=2026-03-15", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] == 3
    assert body["next_run"] == "2026-04-01"

    page = (await client.get("/transactions", headers=h)).json()
    assert page["total"] == 3
    assert all(t["recurring_id"] == rule["id"] for t in page["items"])

    # Re-running the same window creates nothing new (deterministic ids dedupe).
    again = await client.post(f"/recurring/{rule['id']}/materialize?until=2026-03-15", headers=h)
    assert again.json()["created"] == 0
    assert (await client.get("/transactions", headers=h)).json()["total"] == 3


async def test_rule_rejects_foreign_account(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    ana_account = await make_account(client, ana, "Ana Checking")

    r = await client.post("/recurring", json=rule_payload(ana_account), headers=bob)
    assert r.status_code == 400


async def test_rules_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    aid = await make_account(client, ana, "Ana Checking")
    rule = (await client.post("/recurring", json=rule_payload(aid), headers=ana)).json()

    assert len((await client.get("/recurring", headers=bob)).json()) == 0
    assert (await client.get(f"/recurring/{rule['id']}", headers=bob)).status_code == 404
    patched = await client.patch(f"/recurring/{rule['id']}", json={"amount": 1}, headers=bob)
    assert patched.status_code == 404
    mat = await client.post(f"/recurring/{rule['id']}/materialize", headers=bob)
    assert mat.status_code == 404
