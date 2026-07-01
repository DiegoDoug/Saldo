"""Identity / auth flows.

Covers the Stage 2 exit criterion: register two distinct users, log in as each,
and confirm each receives a distinct JWT that identifies them (via /users/me).
"""

from httpx import AsyncClient


async def register(client: AsyncClient, email: str, password: str) -> dict:
    resp = await client.post(
        "/auth/register",
        json={"email": email, "password": password},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def login(client: AsyncClient, email: str, password: str) -> str:
    # fastapi-users' JWT login expects form-encoded OAuth2 fields.
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": email, "password": password},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    assert token
    return token


async def test_register_returns_user_with_default_currency(client: AsyncClient) -> None:
    body = await register(client, "ana@example.com", "s3cret-passphrase")
    assert body["email"] == "ana@example.com"
    assert body["default_currency"] == "EUR"
    assert "id" in body
    # The password must never come back in a response.
    assert "password" not in body
    assert "hashed_password" not in body


async def test_two_users_get_distinct_jwts_identifying_them(client: AsyncClient) -> None:
    await register(client, "ana@example.com", "ana-passphrase-1")
    await register(client, "beto@example.com", "beto-passphrase-2")

    ana_token = await login(client, "ana@example.com", "ana-passphrase-1")
    beto_token = await login(client, "beto@example.com", "beto-passphrase-2")

    assert ana_token != beto_token

    ana_me = await client.get("/users/me", headers={"Authorization": f"Bearer {ana_token}"})
    beto_me = await client.get("/users/me", headers={"Authorization": f"Bearer {beto_token}"})
    assert ana_me.status_code == 200
    assert beto_me.status_code == 200
    assert ana_me.json()["email"] == "ana@example.com"
    assert beto_me.json()["email"] == "beto@example.com"
    assert ana_me.json()["id"] != beto_me.json()["id"]


async def test_me_requires_authentication(client: AsyncClient) -> None:
    resp = await client.get("/users/me")
    assert resp.status_code == 401


async def test_wrong_password_is_rejected(client: AsyncClient) -> None:
    await register(client, "ana@example.com", "correct-passphrase")
    resp = await client.post(
        "/auth/jwt/login",
        data={"username": "ana@example.com", "password": "wrong-passphrase"},
    )
    assert resp.status_code == 400


async def test_duplicate_email_is_rejected(client: AsyncClient) -> None:
    await register(client, "ana@example.com", "passphrase-one")
    resp = await client.post(
        "/auth/register",
        json={"email": "ana@example.com", "password": "passphrase-two"},
    )
    assert resp.status_code == 400
