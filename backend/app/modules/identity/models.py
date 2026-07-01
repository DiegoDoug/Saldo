"""User table.

Defined as a plain SQLModel with the columns fastapi-users needs
(id/email/hashed_password/is_active/is_superuser/is_verified) plus one
app-specific field, `default_currency`. Keeping it a SQLModel means it lives in
the same `SQLModel.metadata` as every other table, so Alembic autogenerate sees
it — no separate declarative base to reconcile.
"""

import uuid

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "user"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # fastapi-users core columns
    email: str = Field(unique=True, index=True, max_length=320)
    hashed_password: str = Field(max_length=1024)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    is_verified: bool = Field(default=False)

    # app-specific: the user's default currency (ISO 4217). Every user owns
    # their own default currency (see TECH_STACK.md data model).
    default_currency: str = Field(default="EUR", max_length=3)
