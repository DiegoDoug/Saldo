"""Receipt import API: upload/status/list/draft-edit/confirm/discard, isolation,
duplicate detection, and the feature-disabled gate.

Stage 1 runs a stub pipeline (no real OCR/AI calls — see
`app/modules/receipt_import/pipeline.py`), so every upload here resolves to
`status == "ready"` synchronously with a fixed low-confidence draft. Stage 2
introduces the real pipeline and BackgroundTasks without changing this
contract test's shape.
"""

import pytest
from httpx import AsyncClient

from app.core.config import settings


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


async def upload(client: AsyncClient, h: dict, data: bytes = TINY_PNG) -> dict:
    resp = await client.post(
        "/receipt-imports",
        files={"file": ("receipt.png", data, "image/png")},
        headers=h,
    )
    return resp


async def test_upload_disabled_without_api_key(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h)
    assert resp.status_code == 503


async def test_upload_runs_stub_pipeline_to_ready(client: AsyncClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    h = await auth_headers(client, "ana@example.com", "passphrase-1")
    resp = await upload(client, h)
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "ready"
    assert body["draft"]["overall_confidence"] == 0.0
    assert "merchant" in body["draft"]["missing_fields"]

    fetched = await client.get(f"/receipt-imports/{body['id']}", headers=h)
    assert fetched.status_code == 200
    assert fetched.json()["draft"]["warnings"]


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
