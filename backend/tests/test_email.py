"""Resend email transport (app.modules.identity.email.send_email).

Covers the two branches: when no API key is configured the message is logged
and no HTTP call is made; when a key is set it POSTs to the Resend API with the
Bearer header and the expected JSON payload.
"""

import httpx
import pytest

from app.core.config import settings
from app.modules.identity import email as email_module


async def test_send_email_disabled_makes_no_http_call(monkeypatch) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "")

    called = False

    async def fail_post(*args, **kwargs):  # pragma: no cover - must not run
        nonlocal called
        called = True

    monkeypatch.setattr(httpx.AsyncClient, "post", fail_post)

    await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")
    assert called is False


async def test_send_email_posts_to_resend(monkeypatch) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "email_from", "Saldo <noreply@saldo.test>")

    captured: dict = {}

    async def fake_post(self, url, headers=None, json=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return httpx.Response(200, request=httpx.Request("POST", url), json={"id": "abc"})

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")

    assert captured["url"] == email_module.RESEND_API_URL
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["json"]["from"] == "Saldo <noreply@saldo.test>"
    assert captured["json"]["to"] == ["ana@example.com"]
    assert captured["json"]["subject"] == "Hola"
    assert captured["json"]["html"] == "<p>hi</p>"


async def test_send_email_raises_on_api_error(monkeypatch) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")

    async def fake_post(self, url, headers=None, json=None):
        return httpx.Response(422, request=httpx.Request("POST", url), json={"message": "bad"})

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with pytest.raises(httpx.HTTPStatusError):
        await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")
