"""Merchants table.

A merchant is a payee/vendor a transaction references instead of free text
(e.g. "Mercadona", "Netflix"). Like every syncable table it carries the sync
envelope (client-generated UUID id, `user_id` scope, `created_at`/`updated_at`,
`deleted` tombstone).

`category_id` optionally links a merchant to a budgeting Category (so a
transaction can inherit a sensible default category from its merchant).
`recurring_probability` is a 0..1 hint the recurring/bills module uses to flag
merchants that tend to bill on a schedule.
"""

import uuid
from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow


class Merchant(SQLModel, table=True):
    __tablename__ = "merchant"
    # Sync pulls filter by user AND updated_at; see migration f5a6b7c8d9e0.
    __table_args__ = (Index("ix_merchant_user_updated", "user_id", "updated_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    logo: str = Field(default="", max_length=500)  # URL or data-uri
    color: str = Field(default="", max_length=32)
    category_id: uuid.UUID | None = Field(default=None, foreign_key="category.id", index=True)
    website: str = Field(default="", max_length=255)
    location: str = Field(default="", max_length=255)
    recurring_probability: float = Field(default=0.0)  # 0..1 hint

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
