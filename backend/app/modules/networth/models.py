"""Net-worth tables: Asset, Liability, and NetWorthSnapshot.

Assets and liabilities the user tracks manually (a house, a car, a mortgage, a
loan) sit alongside their account balances to form net worth. Snapshots record
the computed totals over time so the app can chart historical net worth and
monthly growth.

All three carry the standard sync envelope (client-generated UUID id, `user_id`
scope, `created_at`/`updated_at`, `deleted` tombstone).
"""

import uuid
from datetime import date as date_type
from datetime import datetime

from sqlalchemy import Index
from sqlmodel import Field, SQLModel

from app.modules.budgeting.models import utcnow

ASSET_KINDS = ("cash", "property", "vehicle", "investment", "crypto", "other")
LIABILITY_KINDS = ("mortgage", "loan", "credit_card", "student", "other")


class Asset(SQLModel, table=True):
    __tablename__ = "asset"
    # Sync pulls filter by user AND updated_at; see migration f5a6b7c8d9e0.
    __table_args__ = (Index("ix_asset_user_updated", "user_id", "updated_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    kind: str = Field(max_length=16)  # one of ASSET_KINDS
    value: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=3)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)


class Liability(SQLModel, table=True):
    __tablename__ = "liability"
    # Sync pulls filter by user AND updated_at; see migration f5a6b7c8d9e0.
    __table_args__ = (Index("ix_liability_user_updated", "user_id", "updated_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    name: str = Field(max_length=120)
    kind: str = Field(max_length=16)  # one of LIABILITY_KINDS
    balance: float = Field(default=0.0)  # amount owed (positive)
    currency: str = Field(default="EUR", max_length=3)
    interest_rate: float = Field(default=0.0)  # annual %, informational

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)


class NetWorthSnapshot(SQLModel, table=True):
    __tablename__ = "net_worth_snapshot"
    # Sync pulls filter by user AND updated_at; see migration f5a6b7c8d9e0.
    __table_args__ = (Index("ix_net_worth_snapshot_user_updated", "user_id", "updated_at"),)

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)

    date: date_type = Field(index=True)  # one snapshot per day (deduped on write)
    assets_total: float = Field(default=0.0)
    liabilities_total: float = Field(default=0.0)
    net_worth: float = Field(default=0.0)
    currency: str = Field(default="EUR", max_length=3)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
    deleted: bool = Field(default=False, index=True)
