"""User manager: fastapi-users hook point for registration/auth lifecycle.

Password hashing is argon2, wired explicitly via pwdlib so it's obvious to a
contributor which algorithm protects stored credentials (see TECH_STACK.md:
"Don't hand-roll auth for an app holding financial data.").
"""

import uuid

from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi_users.password import PasswordHelper
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import settings
from app.modules.identity.models import User

# argon2-only password hashing.
password_helper = PasswordHelper(PasswordHash((Argon2Hasher(),)))


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.jwt_secret
    verification_token_secret = settings.jwt_secret
