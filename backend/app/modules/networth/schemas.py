"""Request/response schemas for the net-worth API."""

import uuid
from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

AssetKind = Literal["cash", "property", "vehicle", "investment", "crypto", "other"]
LiabilityKind = Literal["mortgage", "loan", "credit_card", "student", "other"]


# --- Asset --------------------------------------------------------------
class AssetCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    kind: AssetKind = "other"
    value: float = 0.0
    currency: str = "EUR"


class AssetUpdate(BaseModel):
    name: str | None = None
    kind: AssetKind | None = None
    value: float | None = None
    currency: str | None = None


class AssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    value: float
    currency: str
    created_at: datetime
    updated_at: datetime
    deleted: bool


# --- Liability ----------------------------------------------------------
class LiabilityCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    kind: LiabilityKind = "other"
    balance: float = 0.0
    currency: str = "EUR"
    interest_rate: float = 0.0


class LiabilityUpdate(BaseModel):
    name: str | None = None
    kind: LiabilityKind | None = None
    balance: float | None = None
    currency: str | None = None
    interest_rate: float | None = None


class LiabilityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    balance: float
    currency: str
    interest_rate: float
    created_at: datetime
    updated_at: datetime
    deleted: bool


# --- Net worth summary + history ----------------------------------------
class NetWorthSummary(BaseModel):
    assets_total: float
    liabilities_total: float
    net_worth: float
    # Share of the (positive) asset side by bucket, for a pie chart.
    allocation: dict[str, float]
    # Fractional change vs. the most recent earlier snapshot, if any.
    monthly_growth: float | None


class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: date_type
    assets_total: float
    liabilities_total: float
    net_worth: float
    currency: str
    updated_at: datetime
    deleted: bool
