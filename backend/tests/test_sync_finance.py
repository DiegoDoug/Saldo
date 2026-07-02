"""Sync for the finance tables (accounts + transactions).

Proves the new tables ride the same last-write-wins / tombstone / user-scoping
machinery as budgeting: idempotent replay, newest-wins, and cross-user push
refusal.
"""

import uuid

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def account_payload(account_id: str, name: str, updated_at: str, deleted: bool = False) -> dict:
    return {
        "id": account_id,
        "name": name,
        "type": "checking",
        "currency": "EUR",
        "opening_balance": 0.0,
        "updated_at": updated_at,
        "deleted": deleted,
    }


def transaction_payload(tx_id: str, account_id: str, amount: float, updated_at: str) -> dict:
    return {
        "id": tx_id,
        "type": "expense",
        "amount": amount,
        "currency": "EUR",
        "account_id": account_id,
        "date": "2026-01-15",
        "notes": "synced",
        "tags": ["a"],
        "updated_at": updated_at,
    }


async def test_account_and_transaction_push_pull_roundtrip(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = str(uuid.uuid4())
    tid = str(uuid.uuid4())

    resp = await client.post(
        "/sync/push",
        json={
            "accounts": [account_payload(aid, "Checking", "2026-01-01T10:00:00")],
            "transactions": [transaction_payload(tid, aid, 20.0, "2026-01-01T10:00:00")],
        },
        headers=h,
    )
    assert resp.status_code == 200
    assert resp.json()["accounts"][0]["name"] == "Checking"
    assert resp.json()["transactions"][0]["amount"] == 20.0

    # Visible through the normal CRUD APIs.
    assert len((await client.get("/accounts", headers=h)).json()) == 1
    assert (await client.get("/transactions", headers=h)).json()["total"] == 1

    # Idempotent replay.
    await client.post(
        "/sync/push",
        json={"transactions": [transaction_payload(tid, aid, 20.0, "2026-01-01T10:00:00")]},
        headers=h,
    )
    assert (await client.get("/transactions", headers=h)).json()["total"] == 1

    # Last-write-wins on a newer timestamp.
    await client.post(
        "/sync/push",
        json={"transactions": [transaction_payload(tid, aid, 99.0, "2026-01-02T10:00:00")]},
        headers=h,
    )
    page = (await client.get("/transactions", headers=h)).json()
    assert page["items"][0]["amount"] == 99.0


async def test_finance_push_is_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    aid = str(uuid.uuid4())

    await client.post(
        "/sync/push",
        json={"accounts": [account_payload(aid, "Ana Checking", "2026-01-01T10:00:00")]},
        headers=ana,
    )
    # Bob pushing the same account id is refused.
    resp = await client.post(
        "/sync/push",
        json={"accounts": [account_payload(aid, "Hijack", "2026-01-02T10:00:00")]},
        headers=bob,
    )
    assert resp.status_code == 403
    # Ana's account is unchanged.
    assert (await client.get(f"/accounts/{aid}", headers=ana)).json()["name"] == "Ana Checking"
