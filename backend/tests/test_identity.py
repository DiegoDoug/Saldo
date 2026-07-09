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


# --- Password reset -----------------------------------------------------


async def test_forgot_password_is_non_enumerable(client: AsyncClient, monkeypatch) -> None:
    """202 for both known and unknown emails; the email only fires for a real user."""
    sent: list[str] = []

    async def fake_send_email(to: str, subject: str, html: str) -> None:
        sent.append(to)

    monkeypatch.setattr("app.modules.identity.manager.send_email", fake_send_email)

    await register(client, "ana@example.com", "correct-passphrase")

    known = await client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    unknown = await client.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert known.status_code == 202
    assert unknown.status_code == 202
    # Only the registered account receives a recovery email.
    assert sent == ["ana@example.com"]


async def test_reset_password_with_valid_token_changes_password(
    client: AsyncClient, monkeypatch
) -> None:
    tokens: list[str] = []

    async def capture_token(to: str, subject: str, html: str) -> None:
        # The reset link embeds the token as `?token=...`.
        tokens.append(html.split("token=")[1].split('"')[0])

    monkeypatch.setattr("app.modules.identity.manager.send_email", capture_token)

    await register(client, "ana@example.com", "old-passphrase")
    await client.post("/auth/forgot-password", json={"email": "ana@example.com"})
    assert tokens, "no reset token was emitted"

    resp = await client.post(
        "/auth/reset-password",
        json={"token": tokens[0], "password": "brand-new-passphrase"},
    )
    assert resp.status_code == 200, resp.text

    # Old password no longer works; new one does.
    old = await client.post(
        "/auth/jwt/login",
        data={"username": "ana@example.com", "password": "old-passphrase"},
    )
    assert old.status_code == 400
    new_token = await login(client, "ana@example.com", "brand-new-passphrase")
    assert new_token


async def test_reset_password_with_bad_token_is_rejected(client: AsyncClient) -> None:
    resp = await client.post(
        "/auth/reset-password",
        json={"token": "not-a-real-token", "password": "whatever-passphrase"},
    )
    assert resp.status_code == 400


async def test_email_is_normalized_on_register_and_login(client: AsyncClient) -> None:
    body = await register(client, "  Ana@Example.COM ", "s3cret-passphrase")
    assert body["email"] == "ana@example.com"

    # A differently-cased login resolves to the same account...
    token = await login(client, "ANA@example.com", "s3cret-passphrase")
    me = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["email"] == "ana@example.com"

    # ...and a differently-cased re-register is a duplicate, not a new account.
    dup = await client.post(
        "/auth/register",
        json={"email": "ana@EXAMPLE.com", "password": "another-passphrase"},
    )
    assert dup.status_code == 400


async def test_change_password_requires_current_password(client: AsyncClient) -> None:
    await register(client, "ana@example.com", "old-passphrase")
    token = await login(client, "ana@example.com", "old-passphrase")
    headers = {"Authorization": f"Bearer {token}"}

    # Wrong current password is rejected and nothing changes.
    bad = await client.post(
        "/users/me/change-password",
        json={"current_password": "not-my-password", "new_password": "new-passphrase-9"},
        headers=headers,
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "CURRENT_PASSWORD_INCORRECT"
    assert await login(client, "ana@example.com", "old-passphrase")

    # Correct current password applies the change.
    ok = await client.post(
        "/users/me/change-password",
        json={"current_password": "old-passphrase", "new_password": "new-passphrase-9"},
        headers=headers,
    )
    assert ok.status_code == 204
    stale = await client.post(
        "/auth/jwt/login",
        data={"username": "ana@example.com", "password": "old-passphrase"},
    )
    assert stale.status_code == 400
    assert await login(client, "ana@example.com", "new-passphrase-9")


async def test_change_password_requires_authentication(client: AsyncClient) -> None:
    resp = await client.post(
        "/users/me/change-password",
        json={"current_password": "x", "new_password": "y-passphrase-123"},
    )
    assert resp.status_code == 401
