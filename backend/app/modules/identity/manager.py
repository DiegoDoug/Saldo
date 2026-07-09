"""User manager: fastapi-users hook point for registration/auth lifecycle.

Password hashing is argon2, wired explicitly via pwdlib so it's obvious to a
contributor which algorithm protects stored credentials (see TECH_STACK.md:
"Don't hand-roll auth for an app holding financial data.").
"""

import logging
import uuid

from fastapi import Request
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.password import PasswordHelper
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import settings
from app.modules.identity.email import reset_password_email_html, send_email
from app.modules.identity.models import User

logger = logging.getLogger("saldo.identity")

# argon2-only password hashing.
password_helper = PasswordHelper(PasswordHash((Argon2Hasher(),)))


def normalize_email(email: str) -> str:
    """Trim + lowercase, so "Ana@Mail.com " and "ana@mail.com" are one account.

    Enforced here (not just in a client) because the server owns the email
    uniqueness constraint — any client that skips normalization would otherwise
    mint a duplicate account the user can't tell apart from their real one.
    """
    return email.strip().lower()


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.jwt_secret
    verification_token_secret = settings.jwt_secret

    async def create(self, user_create, safe: bool = False, request: Request | None = None):
        user_create.email = normalize_email(user_create.email)
        return await super().create(user_create, safe=safe, request=request)

    async def get_by_email(self, user_email: str) -> User:
        # Login and forgot-password resolve accounts through this lookup.
        return await super().get_by_email(normalize_email(user_email))

    async def on_after_forgot_password(
        self, user: User, token: str, request: Request | None = None
    ) -> None:
        """Send the recovery email once a valid account requests a reset.

        fastapi-users only calls this for an existing, active user, so the
        public `/auth/forgot-password` endpoint stays non-enumerable: it always
        answers 202 whether or not the email is registered.
        """
        reset_url = f"{settings.frontend_base_url.rstrip('/')}/reset-password?token={token}"
        await send_email(
            to=user.email,
            subject="Restablece tu contraseña de Saldo",
            html=reset_password_email_html(reset_url),
        )

    async def on_after_reset_password(self, user: User, request: Request | None = None) -> None:
        logger.info("Password reset completed for user %s", user.id)
