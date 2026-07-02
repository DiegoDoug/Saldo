"""Merchants HTTP endpoints — CRUD plus per-merchant spend stats.

Every route depends on `CurrentUser` and scopes queries by `user.id`. A lookup
that finds a row owned by another user is treated as "not found" (404).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.budgeting.service import get_owned_category
from app.modules.identity.dependencies import CurrentUser
from app.modules.merchants.models import Merchant
from app.modules.merchants.schemas import (
    MerchantCreate,
    MerchantRead,
    MerchantStats,
    MerchantUpdate,
)
from app.modules.merchants.service import (
    get_owned_merchant,
    list_merchants,
    merchant_stats,
)

router = APIRouter(prefix="/merchants", tags=["merchants"])

Session = Annotated[AsyncSession, Depends(get_session)]


async def _check_category(session: AsyncSession, user_id: uuid.UUID, data: dict) -> None:
    cid = data.get("category_id")
    if cid is not None and await get_owned_category(session, user_id, cid) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")


@router.post("", response_model=MerchantRead, status_code=status.HTTP_201_CREATED)
async def create_merchant(payload: MerchantCreate, user: CurrentUser, session: Session):
    await _check_category(session, user.id, payload.model_dump())
    merchant = Merchant(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        logo=payload.logo,
        color=payload.color,
        category_id=payload.category_id,
        website=payload.website,
        location=payload.location,
        recurring_probability=payload.recurring_probability,
    )
    if await session.get(Merchant, merchant.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A merchant with this id already exists")
    session.add(merchant)
    await session.commit()
    await session.refresh(merchant)
    return merchant


@router.get("", response_model=list[MerchantRead])
async def get_merchants(user: CurrentUser, session: Session, include_deleted: bool = False):
    return await list_merchants(session, user.id, include_deleted)


@router.get("/{merchant_id}", response_model=MerchantRead)
async def get_merchant(merchant_id: uuid.UUID, user: CurrentUser, session: Session):
    merchant = await get_owned_merchant(session, user.id, merchant_id)
    if merchant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Merchant not found")
    return merchant


@router.get("/{merchant_id}/stats", response_model=MerchantStats)
async def get_merchant_stats(merchant_id: uuid.UUID, user: CurrentUser, session: Session):
    if await get_owned_merchant(session, user.id, merchant_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Merchant not found")
    return await merchant_stats(session, user.id, merchant_id)


@router.patch("/{merchant_id}", response_model=MerchantRead)
async def update_merchant(
    merchant_id: uuid.UUID, payload: MerchantUpdate, user: CurrentUser, session: Session
):
    merchant = await get_owned_merchant(session, user.id, merchant_id)
    if merchant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Merchant not found")
    data = payload.model_dump(exclude_unset=True)
    await _check_category(session, user.id, data)
    for key, value in data.items():
        setattr(merchant, key, value)
    merchant.updated_at = utcnow()
    session.add(merchant)
    await session.commit()
    await session.refresh(merchant)
    return merchant


@router.delete("/{merchant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_merchant(merchant_id: uuid.UUID, user: CurrentUser, session: Session):
    merchant = await get_owned_merchant(session, user.id, merchant_id)
    if merchant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Merchant not found")
    merchant.deleted = True
    merchant.updated_at = utcnow()
    session.add(merchant)
    await session.commit()
