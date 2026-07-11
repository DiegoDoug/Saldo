"""Bank import API: upload/status/list/draft-edit/confirm/discard, user
isolation, duplicate detection, the feature-disabled gate, and the pipeline's
success/failure outcomes.

The AI provider is always faked via `app.dependency_overrides` (same pattern as
`test_receipt_import_api.py`) — these are HTTP/orchestration tests, not a test
of real DeepSeek output. Upload returns 202 with the row as it stood before the
background pipeline ran; under `httpx`'s `ASGITransport` the background task has
already finished by the time the POST returns, so the follow-up GET is
deterministic (see `test_receipt_import_api.py`'s module docstring).
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.main import app
from app.modules.bank_import.ai.base import ProposedEntity, RawBankExtraction, RawMovement
from app.modules.bank_import.ai.dependency import get_bank_ai_provider

CSV = b"Fecha,Concepto,Importe\n2026-06-01,NOMINA ACME,1800.00\n2026-06-03,MERCADONA,-42.15\n"


def _default_extraction() -> RawBankExtraction:
    return RawBankExtraction(
        bank_name="Test Bank",
        currency="EUR",
        movements=[
            RawMovement(
                date="2026-06-01",
                description="NOMINA ACME",
                type="income",
                amount=1800.0,
                account_name="Cuenta principal",
                category_name="Nomina",
                merchant_name="Acme",
                is_recurring=True,
                confidence=0.9,
            ),
            RawMovement(
                date="2026-06-03",
                description="MERCADONA",
                type="expense",
                amount=42.15,
                account_name="Cuenta principal",
                category_name="Supermercado",
                merchant_name="Mercadona",
                tags=["compras"],
                confidence=0.95,
            ),
        ],
        new_accounts=[ProposedEntity(name="Cuenta principal", kind="checking")],
        new_categories=[
            ProposedEntity(name="Nomina", kind="income"),
            ProposedEntity(name="Supermercado", kind="variable"),
        ],
        new_merchants=[ProposedEntity(name="Acme"), ProposedEntity(name="Mercadona")],
    )


class FakeBankProvider:
    def __init__(self, raw: RawBankExtraction | None = None, error: Exception | None = None):
        self.raw = raw
        self.error = error

    async def extract(self, file_text, context):
        if self.error is not None:
            raise self.error
        return self.raw or _default_extraction()


@pytest.fixture(autouse=True)
def _fake_provider():
    app.dependency_overrides[get_bank_ai_provider] = lambda: FakeBankProvider()
    yield
    app.dependency_overrides.pop(get_bank_ai_provider, None)


@pytest.fixture(autouse=True)
def _bank_storage_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "bank_storage_dir", str(tmp_path))


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def upload(
    client: AsyncClient, h: dict, data: bytes = CSV, name="statement.csv", mime="text/csv"
):
    return await client.post("/bank-imports", files={"file": (name, data, mime)}, headers=h)


async def test_upload_disabled_without_api_key(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h)
    assert resp.status_code == 503


async def test_upload_rejects_unsupported_type(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h, data=b"x", mime="image/png")
    assert resp.status_code == 400


async def test_upload_runs_pipeline_to_ready(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    resp = await upload(client, h)
    assert resp.status_code == 202
    import_id = resp.json()["id"]

    body = (await client.get(f"/bank-imports/{import_id}", headers=h)).json()
    assert body["status"] == "ready"
    draft = body["draft"]
    assert len(draft["movements"]) == 2
    assert draft["movements"][0]["type"] == "income"
    assert draft["movements"][0]["amount"] == 1800.0
    # No such account/category/merchant exists yet -> proposed by name.
    assert draft["movements"][0]["account_ref"] == "Cuenta principal"
    assert {a["name"] for a in draft["new_accounts"]} == {"Cuenta principal"}
    assert {c["name"] for c in draft["new_categories"]} == {"Nomina", "Supermercado"}
    assert {m["name"] for m in draft["new_merchants"]} == {"Acme", "Mercadona"}
    assert {t["name"] for t in draft["new_tags"]} == {"compras"}
    assert body["created_transaction_count"] is None


async def test_existing_account_matched_by_id(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    account = (
        await client.post(
            "/accounts", json={"name": "Cuenta principal", "type": "checking"}, headers=h
        )
    ).json()

    app.dependency_overrides[get_bank_ai_provider] = lambda: FakeBankProvider(
        raw=RawBankExtraction(
            movements=[
                RawMovement(
                    date="2026-06-03",
                    description="MERCADONA",
                    type="expense",
                    amount=42.15,
                    account_id=account["id"],
                    confidence=0.9,
                )
            ]
        )
    )
    resp = await upload(client, h)
    body = (await client.get(f"/bank-imports/{resp.json()['id']}", headers=h)).json()
    mv = body["draft"]["movements"][0]
    assert mv["account_id"] == account["id"]
    assert mv["account_ref"] is None
    assert body["draft"]["new_accounts"] == []


async def test_hallucinated_id_is_demoted_to_proposal(client: AsyncClient, monkeypatch) -> None:
    """An account id the user doesn't own must never leak through — it is
    dropped and demoted to a name proposal (the security-boundary rule)."""
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    app.dependency_overrides[get_bank_ai_provider] = lambda: FakeBankProvider(
        raw=RawBankExtraction(
            movements=[
                RawMovement(
                    description="X",
                    amount=5.0,
                    account_id="00000000-0000-0000-0000-000000000123",
                    account_name="Inventada",
                    confidence=0.5,
                )
            ]
        )
    )
    resp = await upload(client, h)
    mv = (await client.get(f"/bank-imports/{resp.json()['id']}", headers=h)).json()["draft"][
        "movements"
    ][0]
    assert mv["account_id"] is None
    assert mv["account_ref"] == "Inventada"


async def test_duplicate_upload_detected(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    first = await upload(client, h)
    second = await upload(client, h)
    assert second.json()["duplicate_of"] == first.json()["id"]


async def test_patch_then_confirm(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    import_id = (await upload(client, h)).json()["id"]

    # Drop one movement in review, keep one.
    kept = [
        {
            "date": "2026-06-03",
            "description": "MERCADONA",
            "type": "expense",
            "amount": 42.15,
        }
    ]
    patched = await client.patch(
        f"/bank-imports/{import_id}/draft", json={"movements": kept}, headers=h
    )
    assert patched.status_code == 200
    assert len(patched.json()["draft"]["movements"]) == 1

    confirmed = await client.post(
        f"/bank-imports/{import_id}/confirm", json={"transaction_count": 1}, headers=h
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["created_transaction_count"] == 1

    # A confirmed import can't be confirmed again.
    again = await client.post(
        f"/bank-imports/{import_id}/confirm", json={"transaction_count": 1}, headers=h
    )
    assert again.status_code == 409


async def test_user_isolation(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    ha = await auth_headers(client, "ana@example.com", "passphrase-1")
    hb = await auth_headers(client, "ben@example.com", "passphrase-2")
    import_id = (await upload(client, ha)).json()["id"]
    assert (await client.get(f"/bank-imports/{import_id}", headers=hb)).status_code == 404


async def test_pipeline_failure_marks_failed(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    app.dependency_overrides[get_bank_ai_provider] = lambda: FakeBankProvider(
        error=RuntimeError("DeepSeek is down")
    )
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    import_id = (await upload(client, h)).json()["id"]
    body = (await client.get(f"/bank-imports/{import_id}", headers=h)).json()
    assert body["status"] == "failed"
    assert "DeepSeek is down" in body["error_message"]
