"""Request/response schemas for the merchants API.

`MerchantCreate` accepts an optional client-supplied `id` so a merchant created
offline in Dexie keeps its id when it first reaches the server.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class MerchantCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str
    logo: str = ""
    color: str = ""
    category_id: uuid.UUID | None = None
    website: str = ""
    location: str = ""
    recurring_probability: float = Field(default=0.0, ge=0.0, le=1.0)


class MerchantUpdate(BaseModel):
    name: str | None = None
    logo: str | None = None
    color: str | None = None
    category_id: uuid.UUID | None = None
    website: str | None = None
    location: str | None = None
    recurring_probability: float | None = Field(default=None, ge=0.0, le=1.0)


class MerchantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    logo: str
    color: str
    category_id: uuid.UUID | None
    website: str
    location: str
    recurring_probability: float
    created_at: datetime
    updated_at: datetime
    deleted: bool


class MerchantStats(BaseModel):
    """Aggregate spend for a merchant across the user's transactions."""

    merchant_id: uuid.UUID
    transaction_count: int
    total_spent: float  # sum of expense amounts (positive magnitude)
    total_received: float  # sum of income amounts
