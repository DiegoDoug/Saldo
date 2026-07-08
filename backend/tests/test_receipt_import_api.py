"""Receipt import API: upload/status/list/draft-edit/confirm/discard, isolation,
duplicate detection, the feature-disabled gate, and the pipeline's
success/failure outcomes.

OCR and the AI provider are always faked here via `app.dependency_overrides`
(same pattern `test_currency.py` uses for `get_fx_provider`) — these are
HTTP/orchestration tests, not a test of real Tesseract or DeepSeek output.
`test_receipt_import_pipeline.py` covers `draft_builder`, the DeepSeek request
shape, and a real-Tesseract smoke test in isolation.

Upload returns 202 with the row as it stood *before* the background pipeline
ran (FastAPI sends the response, then runs background tasks — see
`pipeline.py`'s docstring), so tests that need the final outcome follow up
with a GET. Under `httpx`'s `ASGITransport`, a background task added during a
request has already finished by the time `await client.post(...)` returns
control here, so this GET is deterministic, not a real poll loop.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.main import app
from app.modules.receipt_import.ai.base import RawExtraction
from app.modules.receipt_import.ai.dependency import get_ai_provider
from app.modules.receipt_import.ocr.dependency import get_ocr_provider


class FakeOcrProvider:
    async def extract_text(self, images, mime_type):
        return "FAKE OCR TEXT"


class FakeAiProvider:
    """Deterministic stand-in for DeepSeek — these tests never touch the network."""

    def __init__(self, raw: RawExtraction | None = None, error: Exception | None = None):
        self.raw = raw
        self.error = error

    async def extract(self, ocr_text, context):
        if self.error is not None:
            raise self.error
        return self.raw or RawExtraction(
            merchant_name="Test Merchant",
            date="2026-07-06",
            currency="USD",
            total=12.5,
            confidence={"merchant_name": 0.9, "date": 0.9, "currency": 0.9, "total": 0.95},
        )


@pytest.fixture(autouse=True)
def _fake_providers():
    app.dependency_overrides[get_ocr_provider] = lambda: FakeOcrProvider()
    app.dependency_overrides[get_ai_provider] = lambda: FakeAiProvider()
    yield
    app.dependency_overrides.pop(get_ocr_provider, None)
    app.dependency_overrides.pop(get_ai_provider, None)


@pytest.fixture(autouse=True)
def _receipt_storage_dir(tmp_path, monkeypatch):
    """Keep uploaded test images out of the real `data/receipts` directory."""
    monkeypatch.setattr(settings, "receipt_storage_dir", str(tmp_path))


TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753"
    "de0000000c4944415408d763f8ffff3f0005fe02fea739669d0000000049454e"
    "44ae426082"
)


async def auth_headers(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    await client.post("/auth/register", json={"email": email, "password": password})
    resp = await client.post("/auth/jwt/login", data={"username": email, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def upload(client: AsyncClient, h: dict, data: bytes = TINY_PNG):
    return await client.post(
        "/receipt-imports",
        files={"file": ("receipt.png", data, "image/png")},
        headers=h,
    )


async def test_upload_disabled_without_api_key(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h)
    assert resp.status_code == 503


async def test_upload_runs_pipeline_to_ready(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    resp = await upload(client, h)
    assert resp.status_code == 202
    receipt_id = resp.json()["id"]

    fetched = await client.get(f"/receipt-imports/{receipt_id}", headers=h)
    body = fetched.json()
    assert body["status"] == "ready"
    assert body["draft"]["amount"]["value"] == 12.5
    assert body["draft"]["amount"]["confidence"] == 0.95
    assert body["draft"]["merchant"]["raw_text"] == "Test Merchant"
    assert body["draft"]["merchant"]["match_type"] == "none"  # no merchant of that name exists yet
    assert body["draft"]["overall_confidence"] > 0


async def test_upload_prefers_exact_merchant_match_and_inherits_its_category(
    client: AsyncClient, monkeypatch
) -> None:
    """End-to-end proof of the matching priority order (Document 2 §5-6):
    an exact normalized merchant match wins over the AI's own semantic guess,
    and the category comes along for free via the merchant's default —
    without the AI proposing a category at all.
    """
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    category_payload = {"name": "Comida", "kind": "variable"}
    category = (
        await client.post("/budgeting/categories", json=category_payload, headers=h)
    ).json()
    merchant = (
        await client.post(
            "/merchants",
            json={"name": "Mercadona", "category_id": category["id"]},
            headers=h,
        )
    ).json()

    app.dependency_overrides[get_ai_provider] = lambda: FakeAiProvider(
        # "MERCADONA #12" normalizes to the same text as the existing
        # merchant's name — exact match should win even though no
        # possible_merchant_id/possible_category_id was supplied at all.
        raw=RawExtraction(merchant_name="MERCADONA #12", total=20.0, confidence={"total": 0.9})
    )

    resp = await upload(client, h)
    receipt_id = resp.json()["id"]
    body = (await client.get(f"/receipt-imports/{receipt_id}", headers=h)).json()

    assert body["draft"]["merchant"]["matched_merchant_id"] == merchant["id"]
    assert body["draft"]["merchant"]["match_type"] == "exact"
    assert body["draft"]["category"]["matched_category_id"] == category["id"]
    assert body["draft"]["category"]["match_type"] == "merchant_default"


async def test_upload_falls_back_to_ai_semantic_match_when_no_local_match(
    client: AsyncClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    category_payload = {"name": "Compras online", "kind": "variable"}
    category = (
        await client.post("/budgeting/categories", json=category_payload, headers=h)
    ).json()
    merchant = (await client.post("/merchants", json={"name": "Netflix"}, headers=h)).json()

    app.dependency_overrides[get_ai_provider] = lambda: FakeAiProvider(
        raw=RawExtraction(
            # Doesn't fuzzy-match "Netflix" at all, so merchant matching must
            # fall through to the AI's own semantic guess (no
            # possible_category_name is given either, so category matching
            # skips straight past the fuzzy tier to its own semantic guess).
            merchant_name="AMZN Mktp US",
            possible_merchant_id=merchant["id"],
            possible_category_id=category["id"],
            total=20.0,
            confidence={"possible_merchant_id": 0.7, "possible_category_id": 0.65, "total": 0.9},
        )
    )

    resp = await upload(client, h)
    receipt_id = resp.json()["id"]
    body = (await client.get(f"/receipt-imports/{receipt_id}", headers=h)).json()

    assert body["draft"]["merchant"]["matched_merchant_id"] == merchant["id"]
    assert body["draft"]["merchant"]["match_type"] == "semantic"
    assert body["draft"]["category"]["matched_category_id"] == category["id"]
    assert body["draft"]["category"]["match_type"] == "ai_semantic"


async def test_pipeline_failure_marks_receipt_failed(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    app.dependency_overrides[get_ai_provider] = lambda: FakeAiProvider(
        error=RuntimeError("DeepSeek is down")
    )
    h = await auth_headers(client, "ana@example.com", "passphrase-1")

    resp = await upload(client, h)
    receipt_id = resp.json()["id"]
    body = (await client.get(f"/receipt-imports/{receipt_id}", headers=h)).json()

    assert body["status"] == "failed"
    assert "DeepSeek is down" in body["error_message"]
    assert body["draft"] is None
    # A failed receipt is neither editable nor confirmable.
    assert (
        await client.patch(f"/receipt-imports/{receipt_id}/draft", json={}, headers=h)
    ).status_code == 409


async def test_rejects_unsupported_content_type(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await client.post(
        "/receipt-imports",
        files={"file": ("receipt.txt", b"not an image", "text/plain")},
        headers=h,
    )
    assert resp.status_code == 400


async def test_rejects_oversized_upload(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(settings, "receipt_max_upload_mb", 0)
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h)
    assert resp.status_code == 400


async def test_duplicate_upload_returns_existing(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    first = (await upload(client, h)).json()
    second = (await upload(client, h)).json()
    assert second["id"] == first["id"]
    assert second["duplicate_of"] == first["id"]
    # The duplicate response reflects the *original* upload's finished
    # pipeline run, not a fresh "processing" row.
    assert second["status"] == "ready"

    listed = await client.get("/receipt-imports", headers=h)
    assert listed.json()["total"] == 1


async def test_image_download_round_trips(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    receipt = (await upload(client, h)).json()
    img = await client.get(f"/receipt-imports/{receipt['id']}/image", headers=h)
    assert img.status_code == 200
    assert img.content == TINY_PNG


async def test_draft_patch_confirm_discard_lifecycle(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    receipt = (await upload(client, h)).json()
    rid = receipt["id"]

    patched = await client.patch(
        f"/receipt-imports/{rid}/draft",
        json={"amount": {"value": 12.5, "confidence": 1.0}},
        headers=h,
    )
    assert patched.status_code == 200
    assert patched.json()["draft"]["amount"]["value"] == 12.5

    confirmed = await client.post(
        f"/receipt-imports/{rid}/confirm",
        json={"transaction_id": "11111111-1111-1111-1111-111111111111"},
        headers=h,
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["linked_transaction_id"] == "11111111-1111-1111-1111-111111111111"

    # A confirmed receipt can no longer be edited or confirmed again.
    assert (
        await client.patch(f"/receipt-imports/{rid}/draft", json={}, headers=h)
    ).status_code == 409
    assert (
        await client.post(
            f"/receipt-imports/{rid}/confirm",
            json={"transaction_id": "11111111-1111-1111-1111-111111111111"},
            headers=h,
        )
    ).status_code == 409


async def test_discard_receipt(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    receipt = (await upload(client, h)).json()
    rid = receipt["id"]

    deleted = await client.delete(f"/receipt-imports/{rid}", headers=h)
    assert deleted.status_code == 204
    assert (await client.get(f"/receipt-imports/{rid}", headers=h)).json()["status"] == "discarded"
    # The underlying image file was reclaimed immediately; the endpoint reports
    # it as not found rather than erroring.
    assert (await client.get(f"/receipt-imports/{rid}/image", headers=h)).status_code == 404


async def test_receipts_are_user_scoped(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    ana = await auth_headers(client, "ana@example.com", "passphrase-1")
    bob = await auth_headers(client, "bob@example.com", "passphrase-2")
    receipt = (await upload(client, ana)).json()
    rid = receipt["id"]

    assert (await client.get(f"/receipt-imports/{rid}", headers=bob)).status_code == 404
    assert (await client.get(f"/receipt-imports/{rid}/image", headers=bob)).status_code == 404
    assert len((await client.get("/receipt-imports", headers=bob)).json()["items"]) == 0
    assert (
        await client.delete(f"/receipt-imports/{rid}", headers=bob)
    ).status_code == 404
    assert (
        await client.post(
            f"/receipt-imports/{rid}/confirm",
            json={"transaction_id": "11111111-1111-1111-1111-111111111111"},
            headers=bob,
        )
    ).status_code == 404
