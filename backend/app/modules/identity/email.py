"""Outbound email for identity flows (currently: password reset).

Saldo sends its one recovery email through Resend (https://resend.com) over its
HTTPS API — there is no self-hosted mail server. Point it at Resend via the
`SALDO_RESEND_API_KEY` / `SALDO_EMAIL_FROM` settings. When no API key is
configured the message is logged instead of sent, so local dev, CI, and the
offline-first `docker compose up` need no mail infrastructure.
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger("saldo.email")

RESEND_API_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str) -> None:
    """Send (or, when email is disabled, log) a single HTML email via Resend."""
    if not settings.email_enabled:
        logger.info(
            "Email disabled (no SALDO_RESEND_API_KEY). Would send to %s: %s\n%s",
            to,
            subject,
            html,
        )
        return

    async with httpx.AsyncClient() as client:
        response = await client.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.email_from,
                "to": [to],
                "subject": subject,
                "html": html,
            },
        )
    response.raise_for_status()
    logger.info("Sent email to %s: %s", to, subject)


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
