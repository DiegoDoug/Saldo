"""Email transport: provider resolution, Resend HTTP path, and resilience."""

import httpx
import pytest

from app.core.config import Settings
from app.modules.identity import email as email_module


def test_provider_auto_prefers_resend_then_smtp_then_log() -> None:
    assert Settings(email_provider="auto").resolved_email_provider == "log"
    assert Settings(email_provider="auto", smtp_host="mail").resolved_email_provider == "smtp"
    # A Resend key wins over SMTP under "auto".
    both = Settings(email_provider="auto", smtp_host="mail", resend_api_key="re_x")
    assert both.resolved_email_provider == "resend"


def test_provider_can_be_forced() -> None:
    # Force SMTP even when a Resend key is present (the Mailpit-in-Docker case).
    forced = Settings(email_provider="smtp", resend_api_key="re_x")
    assert forced.resolved_email_provider == "smtp"
    assert Settings(email_provider="log", smtp_host="mail").resolved_email_provider == "log"


async def test_log_provider_does_not_call_a_transport(monkeypatch) -> None:
    monkeypatch.setattr(email_module.settings, "email_provider", "log", raising=False)

    async def fail(*args, **kwargs):  # pragma: no cover - must not run
        raise AssertionError("no transport should be invoked in log mode")

    monkeypatch.setattr(email_module, "_send_via_smtp", fail)
    monkeypatch.setattr(email_module, "_send_via_resend", fail)
    await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")


async def test_resend_posts_to_api_with_auth(monkeypatch) -> None:
    monkeypatch.setattr(email_module.settings, "email_provider", "resend", raising=False)
    monkeypatch.setattr(email_module.settings, "resend_api_key", "re_test_key", raising=False)
    monkeypatch.setattr(email_module.settings, "smtp_from", "noreply@saldo.app", raising=False)

    captured: dict = {}

    async def fake_post(self, url, headers=None, json=None):
        captured.update(url=url, headers=headers, json=json)
        return httpx.Response(200, json={"id": "abc"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")

    assert captured["url"] == email_module.settings.resend_api_url
    assert captured["headers"]["Authorization"] == "Bearer re_test_key"
    assert captured["json"] == {
        "from": "noreply@saldo.app",
        "to": ["ana@example.com"],
        "subject": "Hola",
        "html": "<p>hi</p>",
    }


async def test_resend_raises_on_api_error(monkeypatch) -> None:
    monkeypatch.setattr(email_module.settings, "email_provider", "resend", raising=False)
    monkeypatch.setattr(email_module.settings, "resend_api_key", "re_test_key", raising=False)

    async def fake_post(self, url, headers=None, json=None):
        request = httpx.Request("POST", url)
        return httpx.Response(422, json={"message": "invalid from"}, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with pytest.raises(httpx.HTTPStatusError):
        await email_module.send_email("ana@example.com", "Hola", "<p>hi</p>")
