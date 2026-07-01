"""API schemas for users (fastapi-users read/create/update contracts)."""

import uuid

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    default_currency: str


class UserCreate(schemas.BaseUserCreate):
    default_currency: str = "EUR"


class UserUpdate(schemas.BaseUserUpdate):
    default_currency: str | None = None
