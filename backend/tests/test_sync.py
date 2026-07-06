"""Sync: offline-queue replay and last-write-wins conflict resolution."""

import uuid

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def entry_payload(entry_id: str, amount: float, updated_at: str, deleted: bool = False) -> dict:
    return {
        "id": entry_id,
        "year": 2026,
        "month": 0,
        "kind": "income",
        "label": "Nómina",
        "amount": amount,
        "currency": "EUR",
        "updated_at": updated_at,
        "deleted": deleted,
    }


async def push_entry(client: AsyncClient, headers: dict, **kwargs):
    return await client.post(
        "/sync/push",
        json={"entries": [entry_payload(**kwargs)]},
        headers=headers,
    )


async def test_offline_queue_replay_is_idempotent(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    eid = str(uuid.uuid4())

    first = await push_entry(client, h, entry_id=eid, amount=1500, updated_at="2026-01-01T10:00:00")
    assert first.status_code == 200
    assert first.json()["entries"][0]["amount"] == 1500

    # One entry now exists on the server.
    listed = await client.get("/budgeting/entries?year=2026&month=0", headers=h)
    assert len(listed.json()) == 1

    # Replaying the identical batch must not duplicate or regress anything.
    replay = await push_entry(
        client, h, entry_id=eid, amount=1500, updated_at="2026-01-01T10:00:00"
    )
    assert replay.status_code == 200
    listed_again = await client.get("/budgeting/entries?year=2026&month=0", headers=h)
    assert len(listed_again.json()) == 1
    assert listed_again.json()[0]["amount"] == 1500


async def test_category_nesting_fields_round_trip_through_sync(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    root_id, child_id = str(uuid.uuid4()), str(uuid.uuid4())
    resp = await client.post(
        "/sync/push",
        json={
            "categories": [
                {
                    "id": root_id,
                    "name": "Casa",
                    "kind": "fixed",
                    "color": "#6EE7B7",
                    "icon": "House",
                    "updated_at": "2026-01-01T10:00:00",
                    "deleted": False,
                },
                {
                    "id": child_id,
                    "name": "Luz",
                    "kind": "fixed",
                    "parent_id": root_id,
                    "updated_at": "2026-01-01T10:00:00",
                    "deleted": False,
                },
            ]
        },
        headers=h,
    )
    assert resp.status_code == 200
    pulled = await client.get("/sync/pull", headers=h)
    by_id = {c["id"]: c for c in pulled.json()["categories"]}
    assert by_id[root_id]["color"] == "#6EE7B7"
    assert by_id[root_id]["icon"] == "House"
    assert by_id[child_id]["parent_id"] == root_id


async def test_last_write_wins_by_updated_at(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    eid = str(uuid.uuid4())

    # Seed at t1.
    await push_entry(client, h, entry_id=eid, amount=1000, updated_at="2026-01-01T10:00:00")

    # A stale update (older timestamp) must be ignored.
    stale = await push_entry(client, h, entry_id=eid, amount=500, updated_at="2026-01-01T09:00:00")
    assert stale.json()["entries"][0]["amount"] == 1000

    # A newer update wins.
    fresh = await push_entry(client, h, entry_id=eid, amount=2000, updated_at="2026-01-01T11:00:00")
    assert fresh.json()["entries"][0]["amount"] == 2000


async def test_pull_since_returns_only_newer_and_includes_tombstones(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    eid = str(uuid.uuid4())
    await push_entry(client, h, entry_id=eid, amount=1000, updated_at="2026-01-01T10:00:00")

    # Full pull returns the record.
    full = await client.get("/sync/pull", headers=h)
    assert len(full.json()["entries"]) == 1

    # Pull since a later time returns nothing.
    empty = await client.get("/sync/pull?since=2026-01-02T00:00:00", headers=h)
    assert empty.json()["entries"] == []

    # Delete via tombstone; pull since before the deletion surfaces it as deleted.
    await push_entry(
        client, h, entry_id=eid, amount=1000, updated_at="2026-01-03T10:00:00", deleted=True
    )
    after = await client.get("/sync/pull?since=2026-01-02T00:00:00", headers=h)
    tombstones = after.json()["entries"]
    assert len(tombstones) == 1
    assert tombstones[0]["deleted"] is True


async def test_push_cannot_overwrite_another_users_record(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-pass")
    beto = await auth_headers(client, "beto@example.com", "beto-pass")

    eid = str(uuid.uuid4())
    await push_entry(client, ana, entry_id=eid, amount=1000, updated_at="2026-01-01T10:00:00")

    # Beto pushing the same id (Ana's) is refused.
    resp = await push_entry(
        client, beto, entry_id=eid, amount=9999, updated_at="2026-01-02T10:00:00"
    )
    assert resp.status_code == 403

    # Ana's record is unchanged.
    ana_entry = await client.get("/budgeting/entries?year=2026&month=0", headers=ana)
    assert ana_entry.json()[0]["amount"] == 1000
