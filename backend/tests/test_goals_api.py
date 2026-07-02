"""Goals API: CRUD, projection, contributions, and cross-user isolation."""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def goal_payload(**overrides) -> dict:
    base = {
        "name": "Emergencia",
        "kind": "emergency",
        "target_amount": 1000.0,
        "current_amount": 200.0,
        "monthly_contribution": 100.0,
    }
    base.update(overrides)
    return base


async def test_goal_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    created = await client.post("/goals", json=goal_payload(), headers=h)
    assert created.status_code == 201
    goal = created.json()
    assert goal["kind"] == "emergency"
    assert goal["target_amount"] == 1000.0

    assert len((await client.get("/goals", headers=h)).json()) == 1

    patched = await client.patch(
        f"/goals/{goal['id']}", json={"monthly_contribution": 200.0}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["monthly_contribution"] == 200.0

    deleted = await client.delete(f"/goals/{goal['id']}", headers=h)
    assert deleted.status_code == 204
    assert len((await client.get("/goals", headers=h)).json()) == 0


async def test_projection_uses_domain_core(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    goal = (await client.post("/goals", json=goal_payload(), headers=h)).json()

    proj = await client.get(f"/goals/{goal['id']}/projection", headers=h)
    assert proj.status_code == 200
    body = proj.json()
    assert body["progress"] == 0.2  # 200 / 1000
    assert body["remaining_amount"] == 800.0
    assert body["months_remaining"] == 8  # ceil(800 / 100)
    assert body["estimated_completion_date"] is not None


async def test_projection_unreachable_without_contribution(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    goal = (
        await client.post("/goals", json=goal_payload(monthly_contribution=0.0), headers=h)
    ).json()
    body = (await client.get(f"/goals/{goal['id']}/projection", headers=h)).json()
    assert body["months_remaining"] is None
    assert body["estimated_completion_date"] is None


async def test_contribute_advances_current_amount(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    goal = (await client.post("/goals", json=goal_payload(), headers=h)).json()

    resp = await client.post(f"/goals/{goal['id']}/contribute", json={"amount": 300.0}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["current_amount"] == 500.0

    proj = (await client.get(f"/goals/{goal['id']}/projection", headers=h)).json()
    assert proj["progress"] == 0.5


async def test_goals_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    goal = (await client.post("/goals", json=goal_payload(), headers=ana)).json()

    assert len((await client.get("/goals", headers=bob)).json()) == 0
    assert (await client.get(f"/goals/{goal['id']}", headers=bob)).status_code == 404
    assert (await client.get(f"/goals/{goal['id']}/projection", headers=bob)).status_code == 404
    patched = await client.patch(f"/goals/{goal['id']}", json={"name": "hax"}, headers=bob)
    assert patched.status_code == 404
    contrib = await client.post(f"/goals/{goal['id']}/contribute", json={"amount": 1}, headers=bob)
    assert contrib.status_code == 404
