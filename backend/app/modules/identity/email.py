"""Outbound email for identity flows (currently: password reset).

Saldo can send mail two ways, chosen by `SALDO_EMAIL_PROVIDER` (see config):
  - **SMTP** — any mail server via the `SALDO_SMTP_*` settings. The reference
    self-hosted deploy uses Stalwart (`stalwart/README.md`); the Docker test
    sink uses Mailpit.
  - **Resend** — the https://resend.com HTTP API, for hosts where outbound SMTP
    ports are blocked. Set `SALDO_RESEND_API_KEY`.
When neither is configured the message is logged instead of sent, so local dev,
CI, and the offline-first `docker compose up` need no mail infrastructure.
"""

import logging
from email.message import EmailMessage

import aiosmtplib
import httpx

from app.core.config import settings

logger = logging.getLogger("saldo.email")


async def send_email(to: str, subject: str, html: str) -> None:
    """Send a single HTML email via the configured provider (or log it)."""
    provider = settings.resolved_email_provider
    if provider == "log":
        logger.info("Email provider is 'log'. Would send to %s: %s\n%s", to, subject, html)
        return
    if provider == "resend":
        await _send_via_resend(to, subject, html)
    else:
        await _send_via_smtp(to, subject, html)
    logger.info("Sent email to %s via %s: %s", to, provider, subject)


async def _send_via_smtp(to: str, subject: str, html: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content("Este mensaje requiere un cliente que soporte HTML.")
    message.add_alternative(html, subtype="html")

    await aiosmtplib.send(
        message,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=settings.smtp_starttls,
    )


async def _send_via_resend(to: str, subject: str, html: str) -> None:
    # Uses httpx (already a dependency) rather than the Resend SDK, to keep the
    # backend framework-light and consistent with the rest of the codebase.
    payload = {"from": settings.smtp_from, "to": [to], "subject": subject, "html": html}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            settings.resend_api_url,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json=payload,
        )
        resp.raise_for_status()


def reset_password_email_html(reset_url: str) -> str:
    """Spanish-language recovery email body containing the reset link."""
    return f"""\
<div style="font-family: system-ui, sans-serif; max-width: 480px; margin: auto;">
  <h2>Restablece tu contraseña</h2>
  <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de Saldo.</p>
  <p>
    <a href="{reset_url}"
       style="display:inline-block;padding:12px 20px;background:#10b981;
              color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">
      Restablecer contraseña
    </a>
  </p>
  <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
  <p style="color:#6b7280;font-size:13px;">Este enlace caduca en una hora.</p>
</div>
"""
