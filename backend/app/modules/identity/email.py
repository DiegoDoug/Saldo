"""Outbound email for identity flows (currently: password reset).

Saldo is a plain SMTP client — it does not run a mail server itself. Point it at
one via the `SALDO_SMTP_*` settings; the reference deploy uses Mailu (see
`mailu/README.md`). When no SMTP host is configured the message is logged
instead of sent, so local dev, CI, and the offline-first `docker compose up`
need no mail infrastructure.
"""

import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger("saldo.email")


async def send_email(to: str, subject: str, html: str) -> None:
    """Send (or, when email is disabled, log) a single HTML email."""
    if not settings.email_enabled:
        logger.info(
            "Email disabled (no SALDO_SMTP_HOST). Would send to %s: %s\n%s", to, subject, html
        )
        return

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
