"""Tags API: CRUD, sync round-trip, and the cross-user isolation invariant."""

import uuid

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_tag_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    created = await client.post("/tags", json={"name": "comida", "color": "#2F8F6F"}, headers=h)
    assert created.status_code == 201
    tag = created.json()
    assert tag["name"] == "comida"
    assert tag["color"] == "#2F8F6F"

    listed = await client.get("/tags", headers=h)
    assert len(listed.json()) == 1

    patched = await client.patch(f"/tags/{tag['id']}", json={"color": "#E06B52"}, headers=h)
    assert patched.status_code == 200
    assert patched.json()["color"] == "#E06B52"

    deleted = await client.delete(f"/tags/{tag['id']}", headers=h)
    assert deleted.status_code == 204
    assert (await client.get("/tags", headers=h)).json() == []
    assert len((await client.get("/tags?include_deleted=true", headers=h)).json()) == 1


async def test_tags_round_trip_through_sync(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    tid = str(uuid.uuid4())
    resp = await client.post(
        "/sync/push",
        json={
            "tags": [
                {"id": tid, "name": "viajes", "color": "#3E6E8E",
                 "updated_at": "2026-01-01T10:00:00", "deleted": False}
            ]
        },
        headers=h,
    )
    assert resp.status_code == 200
    pulled = await client.get("/sync/pull", headers=h)
    tags = {t["id"]: t for t in pulled.json()["tags"]}
    assert tags[tid]["name"] == "viajes"
    assert tags[tid]["color"] == "#3E6E8E"


async def test_tags_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-passphrase")
    beto = await auth_headers(client, "beto@example.com", "beto-passphrase")
    tag = await client.post("/tags", json={"name": "comida"}, headers=ana)
    tid = tag.json()["id"]

    assert (await client.get("/tags", headers=beto)).json() == []
    # Beto cannot read, update, or delete Ana's tag (404 — existence never leaks).
    patched = await client.patch(f"/tags/{tid}", json={"color": "#000000"}, headers=beto)
    assert patched.status_code == 404
    assert (await client.delete(f"/tags/{tid}", headers=beto)).status_code == 404
