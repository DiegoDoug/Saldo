"""Transactions API: CRUD, filters/search/sort/pagination, bulk actions,
transfers, balance derivation, and the cross-user isolation invariant.
"""

from httpx import AsyncClient


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def post_tx(client: AsyncClient, h: dict, account_id: str, **overrides):
    return await client.post("/transactions", json=tx_payload(account_id, **overrides), headers=h)


async def get_list(client: AsyncClient, h: dict, query: str = ""):
    return (await client.get(f"/transactions{query}", headers=h)).json()


async def make_account(client: AsyncClient, h: dict, name: str, opening: float = 0.0) -> str:
    resp = await client.post(
        "/accounts",
        json={"name": name, "type": "checking", "opening_balance": opening},
        headers=h,
    )
    return resp.json()["id"]


def tx_payload(account_id: str, **overrides) -> dict:
    base = {
        "type": "expense",
        "amount": 20.0,
        "account_id": account_id,
        "date": "2026-01-15",
        "notes": "Coffee",
        "tags": [],
    }
    base.update(overrides)
    return base


async def test_transaction_crud(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")

    created = await client.post("/transactions", json=tx_payload(aid), headers=h)
    assert created.status_code == 201
    tx = created.json()
    assert tx["type"] == "expense"
    assert tx["amount"] == 20.0
    assert tx["currency"] == "EUR"

    page = await client.get("/transactions", headers=h)
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1

    patched = await client.patch(
        f"/transactions/{tx['id']}", json={"amount": 25.0, "notes": "Latte"}, headers=h
    )
    assert patched.status_code == 200
    assert patched.json()["amount"] == 25.0

    deleted = await client.delete(f"/transactions/{tx['id']}", headers=h)
    assert deleted.status_code == 204
    assert (await client.get("/transactions", headers=h)).json()["total"] == 0


async def test_filters_search_sort_pagination(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    other = await make_account(client, h, "Savings")

    await post_tx(client, h, aid, amount=10, date="2026-01-01", type="income", notes="Salary")
    await post_tx(client, h, aid, amount=30, date="2026-02-01", notes="Rent", tags=["home"])
    await post_tx(client, h, other, amount=5, date="2026-03-01", notes="Snack")

    # Filter by account.
    by_acc = await get_list(client, h, f"?account_id={aid}")
    assert by_acc["total"] == 2

    # Filter by type.
    incomes = await get_list(client, h, "?type=income")
    assert incomes["total"] == 1

    # Date range.
    ranged = await get_list(client, h, "?date_from=2026-02-01&date_to=2026-12-31")
    assert ranged["total"] == 2

    # Search notes.
    searched = await get_list(client, h, "?q=rent")
    assert searched["total"] == 1
    assert searched["items"][0]["notes"] == "Rent"

    # Tag filter.
    tagged = await get_list(client, h, "?tag=home")
    assert tagged["total"] == 1

    # Sort by amount ascending + pagination.
    p = await get_list(client, h, "?sort=amount&order=asc&limit=2&offset=0")
    assert p["total"] == 3
    assert [i["amount"] for i in p["items"]] == [5, 10]
    p2 = await get_list(client, h, "?sort=amount&order=asc&limit=2&offset=2")
    assert [i["amount"] for i in p2["items"]] == [30]


async def _make_category(client: AsyncClient, h: dict, name: str, kind: str = "variable") -> str:
    resp = await client.post(
        "/budgeting/categories", json={"name": name, "kind": kind}, headers=h
    )
    return resp.json()["id"]


async def test_split_creates_parent_and_children(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking", opening=1000)
    food = await _make_category(client, h, "Súper")
    fun = await _make_category(client, h, "Ocio")

    resp = await client.post(
        "/transactions/split",
        json={
            "type": "expense",
            "amount": 100,
            "account_id": aid,
            "date": "2026-01-15",
            "notes": "Compra grande",
            "children": [
                {"category_id": food, "amount": 60},
                {"category_id": fun, "amount": 40},
            ],
        },
        headers=h,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["parent"]["split_parent"] is True
    assert body["parent"]["category_id"] is None
    assert len(body["children"]) == 2
    assert all(c["parent_id"] == body["parent"]["id"] for c in body["children"])

    # Balance counts the leaves once (1000 - 100), not the parent on top of them.
    balances = await client.get("/accounts/balances", headers=h)
    bal = next(b for b in balances.json()["accounts"] if b["account_id"] == aid)
    assert bal["balance"] == 900

    # Variance counts the categorized children, not the parent.
    variance = await client.get("/budgeting/variance/2026/0", headers=h)
    v = variance.json()
    assert v["actual_total"] == 100
    by_cat = {r["category_id"]: r["actual"] for r in v["by_category"]}
    assert by_cat[food] == 60
    assert by_cat[fun] == 40


async def test_split_rejects_mismatched_sum(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    food = await _make_category(client, h, "Súper")
    resp = await client.post(
        "/transactions/split",
        json={
            "type": "expense",
            "amount": 100,
            "account_id": aid,
            "date": "2026-01-15",
            "children": [{"category_id": food, "amount": 55}],
        },
        headers=h,
    )
    assert resp.status_code == 400


async def test_split_rejects_foreign_category(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "ana-passphrase")
    beto = await auth_headers(client, "beto@example.com", "beto-passphrase")
    ana_cat = await _make_category(client, ana, "Súper")
    aid = await make_account(client, beto, "Checking")
    resp = await client.post(
        "/transactions/split",
        json={
            "type": "expense",
            "amount": 30,
            "account_id": aid,
            "date": "2026-01-15",
            "children": [{"category_id": ana_cat, "amount": 30}],
        },
        headers=beto,
    )
    assert resp.status_code == 400


async def test_bulk_actions(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    cat_resp = await client.post(
        "/budgeting/categories", json={"name": "Food", "kind": "variable"}, headers=h
    )
    cat = cat_resp.json()

    ids = []
    for _ in range(3):
        r = await post_tx(client, h, aid)
        ids.append(r.json()["id"])

    # Bulk categorize.
    r = await client.post(
        "/transactions/bulk",
        json={"ids": ids, "action": "set_category", "category_id": cat["id"]},
        headers=h,
    )
    assert r.json()["affected"] == 3
    listed = await get_list(client, h, f"?category_id={cat['id']}")
    assert listed["total"] == 3

    # Bulk add tag.
    r = await client.post(
        "/transactions/bulk",
        json={"ids": ids, "action": "add_tag", "tag": "reviewed"},
        headers=h,
    )
    assert r.json()["affected"] == 3
    assert (await get_list(client, h, "?tag=reviewed"))["total"] == 3

    # Bulk delete.
    r = await client.post(
        "/transactions/bulk", json={"ids": ids, "action": "delete"}, headers=h
    )
    assert r.json()["affected"] == 3
    assert (await get_list(client, h))["total"] == 0


async def test_transfer_and_balances(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    checking = await make_account(client, h, "Checking", opening=100.0)
    savings = await make_account(client, h, "Savings", opening=0.0)

    # Income raises checking; expense lowers it.
    await post_tx(client, h, checking, type="income", amount=50)
    await post_tx(client, h, checking, type="expense", amount=20)

    # Transfer 30 from checking to savings.
    tr = await client.post(
        "/transactions/transfer",
        json={
            "amount": 30,
            "from_account_id": checking,
            "to_account_id": savings,
            "date": "2026-01-20",
        },
        headers=h,
    )
    assert tr.status_code == 201
    assert tr.json()["type"] == "transfer"

    balances = (await client.get("/accounts/balances", headers=h)).json()
    by_id = {b["account_id"]: b["balance"] for b in balances["accounts"]}
    # 100 + 50 - 20 - 30 = 100
    assert by_id[checking] == 100.0
    # 0 + 30 = 30
    assert by_id[savings] == 30.0


async def test_transfer_needs_two_distinct_accounts(client: AsyncClient) -> None:
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    aid = await make_account(client, h, "Checking")
    r = await client.post(
        "/transactions/transfer",
        json={"amount": 10, "from_account_id": aid, "to_account_id": aid, "date": "2026-01-20"},
        headers=h,
    )
    assert r.status_code == 400


async def test_transaction_rejects_foreign_account(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    ana_account = await make_account(client, ana, "Ana Checking")

    # Bob cannot create a transaction against Ana's account.
    r = await client.post("/transactions", json=tx_payload(ana_account), headers=bob)
    assert r.status_code == 400


async def test_transactions_are_user_scoped(client: AsyncClient) -> None:
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    aid = await make_account(client, ana, "Ana Checking")
    tx = (await client.post("/transactions", json=tx_payload(aid), headers=ana)).json()

    assert (await client.get("/transactions", headers=bob)).json()["total"] == 0
    assert (await client.get(f"/transactions/{tx['id']}", headers=bob)).status_code == 404
    patched = await client.patch(f"/transactions/{tx['id']}", json={"amount": 999}, headers=bob)
    assert patched.status_code == 404
    # Bulk silently skips ids the caller doesn't own.
    r = await client.post(
        "/transactions/bulk", json={"ids": [tx["id"]], "action": "delete"}, headers=bob
    )
    assert r.json()["affected"] == 0
