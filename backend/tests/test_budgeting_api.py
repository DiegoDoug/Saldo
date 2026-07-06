"""Budgeting API: CRUD, summaries, and the cross-user isolation invariant.

The isolation test is the important one: it proves a second user can neither
read nor mutate the first user's data. That is the app's one security boundary
(financial data), so it is tested explicitly rather than assumed.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ----------------------------------------------------------------------
# CRUD
# ----------------------------------------------------------------------
async def test_category_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    created = await client.post(
        "/budgeting/categories", json={"name": "Alquiler", "kind": "fixed"}, headers=h
    )
    assert created.status_code == 201
    cat = created.json()
    assert cat["name"] == "Alquiler"
    assert cat["kind"] == "fixed"

    listed = await client.get("/budgeting/categories", headers=h)
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    patched = await client.patch(
        f"/budgeting/categories/{cat['id']}", json={"name": "Hipoteca"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Hipoteca"

    deleted = await client.delete(f"/budgeting/categories/{cat['id']}", headers=h)
    assert deleted.status_code == 204
    # Soft-deleted: gone from the default list, present when include_deleted.
    assert await client.get("/budgeting/categories", headers=h)
    assert len((await client.get("/budgeting/categories", headers=h)).json()) == 0
    with_deleted = await client.get(
        "/budgeting/categories?include_deleted=true", headers=h
    )
    assert len(with_deleted.json()) == 1


async def test_category_nesting_color_icon(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    root = await client.post(
        "/budgeting/categories",
        json={"name": "Casa", "kind": "fixed", "color": "#6EE7B7", "icon": "House"},
        headers=h,
    )
    assert root.status_code == 201
    root_body = root.json()
    assert root_body["color"] == "#6EE7B7"
    assert root_body["icon"] == "House"
    assert root_body["parent_id"] is None
    root_id = root_body["id"]

    child = await client.post(
        "/budgeting/categories",
        json={"name": "Luz", "kind": "fixed", "parent_id": root_id},
        headers=h,
    )
    assert child.status_code == 201
    assert child.json()["parent_id"] == root_id

    # Tree endpoint nests the child under its root.
    tree = await client.get("/budgeting/categories/tree", headers=h)
    assert tree.status_code == 200
    forest = tree.json()
    assert len(forest) == 1
    assert forest[0]["id"] == root_id
    assert [c["name"] for c in forest[0]["children"]] == ["Luz"]


async def test_subcategory_rejects_cross_kind_parent(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    fixed = await client.post(
        "/budgeting/categories", json={"name": "Casa", "kind": "fixed"}, headers=h
    )
    fixed_id = fixed.json()["id"]
    # A variable child under a fixed parent is rejected (kind must be inherited).
    bad = await client.post(
        "/budgeting/categories",
        json={"name": "Ocio", "kind": "variable", "parent_id": fixed_id},
        headers=h,
    )
    assert bad.status_code == 400


async def test_category_parent_cycle_rejected(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    a = await client.post(
        "/budgeting/categories", json={"name": "A", "kind": "variable"}, headers=h
    )
    a_id = a.json()["id"]
    b = await client.post(
        "/budgeting/categories",
        json={"name": "B", "kind": "variable", "parent_id": a_id},
        headers=h,
    )
    b_id = b.json()["id"]
    # Re-parenting A under its own descendant B would form a cycle.
    looped = await client.patch(
        f"/budgeting/categories/{a_id}", json={"parent_id": b_id}, headers=h
    )
    assert looped.status_code == 400
    # A category cannot be its own parent either.
    self_loop = await client.patch(
        f"/budgeting/categories/{a_id}", json={"parent_id": a_id}, headers=h
    )
    assert self_loop.status_code == 400


async def test_category_parent_must_be_owned(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-passphrase")
    beto = await auth_headers(client, "beto@example.com", "beto-passphrase")
    ana_cat = await client.post(
        "/budgeting/categories", json={"name": "Casa", "kind": "fixed"}, headers=ana
    )
    ana_id = ana_cat.json()["id"]
    # Beto cannot nest his category under Ana's.
    resp = await client.post(
        "/budgeting/categories",
        json={"name": "Luz", "kind": "fixed", "parent_id": ana_id},
        headers=beto,
    )
    assert resp.status_code == 400


async def test_entry_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    created = await client.post(
        "/budgeting/entries",
        json={"year": 2026, "month": 0, "kind": "income", "label": "Nómina", "amount": 1500},
        headers=h,
    )
    assert created.status_code == 201
    entry = created.json()
    assert entry["amount"] == 1500
    assert entry["currency"] == "EUR"

    patched = await client.patch(
        f"/budgeting/entries/{entry['id']}", json={"amount": 1600}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["amount"] == 1600

    listed = await client.get("/budgeting/entries?year=2026&month=0", headers=h)
    assert len(listed.json()) == 1

    deleted = await client.delete(f"/budgeting/entries/{entry['id']}", headers=h)
    assert deleted.status_code == 204
    assert len((await client.get("/budgeting/entries?year=2026&month=0", headers=h)).json()) == 0


async def test_entry_rejects_foreign_currency_lowercase_normalized(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    created = await client.post(
        "/budgeting/entries",
        json={"year": 2026, "month": 0, "kind": "income", "amount": 100, "currency": "usd"},
        headers=h,
    )
    assert created.status_code == 201
    assert created.json()["currency"] == "USD"


# ----------------------------------------------------------------------
# Summaries via the domain core
# ----------------------------------------------------------------------
async def test_month_summary_matches_domain_core(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    async def add(kind: str, amount: float) -> None:
        r = await client.post(
            "/budgeting/entries",
            json={"year": 2026, "month": 0, "kind": kind, "amount": amount},
            headers=h,
        )
        assert r.status_code == 201

    await add("income", 1500)  # nomina-equivalent
    await add("income", 50)  # otros-equivalent
    await add("goal", 200)
    await add("fixed", 800)
    await add("variable", 150)

    summary = await client.get("/budgeting/summary/2026/0", headers=h)
    assert summary.status_code == 200
    s = summary.json()
    assert s["income_total"] == 1550
    assert s["expenses_total"] == 950
    assert s["goal"] == 200
    assert s["can_spend"] == 1350
    assert s["end_of_month_savings"] == 600
    assert s["remaining_to_spend"] == 400
    assert s["overspend"] is False
    assert s["met_goal"] is True


async def test_year_summary_aggregates(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    for month in range(12):
        await client.post(
            "/budgeting/entries",
            json={"year": 2026, "month": month, "kind": "income", "amount": 1000},
            headers=h,
        )
    year = await client.get("/budgeting/summary/2026", headers=h)
    assert year.status_code == 200
    y = year.json()
    assert y["income_total"] == 12000
    assert len(y["per_month"]) == 12
    assert y["per_month"][5]["income_total"] == 1000


# ----------------------------------------------------------------------
# Cross-user isolation (the security invariant)
# ----------------------------------------------------------------------
async def test_second_user_cannot_read_or_mutate_first_users_data(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-passphrase")
    beto = await auth_headers(client, "beto@example.com", "beto-passphrase")

    # Ana creates a category and an entry.
    cat = await client.post(
        "/budgeting/categories", json={"name": "Alquiler", "kind": "fixed"}, headers=ana
    )
    cat_id = cat.json()["id"]
    entry = await client.post(
        "/budgeting/entries",
        json={"year": 2026, "month": 0, "kind": "fixed", "amount": 800, "category_id": cat_id},
        headers=ana,
    )
    entry_id = entry.json()["id"]

    # Beto sees none of Ana's data.
    assert (await client.get("/budgeting/categories", headers=beto)).json() == []
    assert (await client.get("/budgeting/entries", headers=beto)).json() == []

    # Beto cannot read, update, or delete Ana's rows (404 — not even existence leaks).
    assert (
        await client.patch(f"/budgeting/entries/{entry_id}", json={"amount": 1}, headers=beto)
    ).status_code == 404
    assert (
        await client.delete(f"/budgeting/entries/{entry_id}", headers=beto)
    ).status_code == 404
    assert (
        await client.patch(
            f"/budgeting/categories/{cat_id}", json={"name": "x"}, headers=beto
        )
    ).status_code == 404
    assert (
        await client.delete(f"/budgeting/categories/{cat_id}", headers=beto)
    ).status_code == 404

    # Beto cannot attach an entry to Ana's category.
    assert (
        await client.post(
            "/budgeting/entries",
            json={
                "year": 2026,
                "month": 0,
                "kind": "fixed",
                "amount": 10,
                "category_id": cat_id,
            },
            headers=beto,
        )
    ).status_code == 400

    # Beto's summary reflects only his (empty) data; Ana's is intact.
    beto_summary = await client.get("/budgeting/summary/2026/0", headers=beto)
    assert beto_summary.json()["expenses_total"] == 0
    ana_summary = await client.get("/budgeting/summary/2026/0", headers=ana)
    assert ana_summary.json()["expenses_total"] == 800

    # Ana's entry is untouched.
    ana_entry = await client.get("/budgeting/entries?year=2026&month=0", headers=ana)
    assert ana_entry.json()[0]["amount"] == 800
