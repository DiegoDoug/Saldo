"""WidgetLayout: per-user persistence, last-write-wins, and isolation."""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_default_layout_is_empty(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await client.get("/layout", headers=h)
    assert resp.status_code == 200
    assert resp.json()["data"] == {}


async def test_put_then_get_roundtrip(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    layout = {"widgets": ["hero", "trend", "months"], "theme": "carbon"}
    put = await client.put("/layout", json={"data": layout}, headers=h)
    assert put.status_code == 200
    assert put.json()["data"] == layout

    got = await client.get("/layout", headers=h)
    assert got.json()["data"] == layout


async def test_last_write_wins_ignores_stale(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    await client.put(
        "/layout",
        json={"data": {"theme": "carbon"}, "updated_at": "2026-01-01T10:00:00"},
        headers=h,
    )
    # A stale write (older timestamp) is ignored.
    stale = await client.put(
        "/layout",
        json={"data": {"theme": "cuaderno"}, "updated_at": "2026-01-01T09:00:00"},
        headers=h,
    )
    assert stale.json()["data"]["theme"] == "carbon"


async def test_layout_is_isolated_per_user(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-pass")
    beto = await auth_headers(client, "beto@example.com", "beto-pass")

    await client.put("/layout", json={"data": {"theme": "carbon"}}, headers=ana)
    await client.put("/layout", json={"data": {"theme": "cuaderno"}}, headers=beto)

    assert (await client.get("/layout", headers=ana)).json()["data"]["theme"] == "carbon"
    assert (await client.get("/layout", headers=beto)).json()["data"]["theme"] == "cuaderno"
