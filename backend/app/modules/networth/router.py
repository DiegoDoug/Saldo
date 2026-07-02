"""Net-worth HTTP endpoints — assets & liabilities CRUD, the computed net-worth
summary, historical snapshots, and a snapshot-recording action.

Every route depends on `CurrentUser` and scopes queries by `user.id`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser
from app.modules.networth.models import Asset, Liability
from app.modules.networth.schemas import (
    AssetCreate,
    AssetRead,
    AssetUpdate,
    LiabilityCreate,
    LiabilityRead,
    LiabilityUpdate,
    NetWorthSummary,
    SnapshotRead,
)
from app.modules.networth.service import (
    compute_net_worth,
    get_owned_asset,
    get_owned_liability,
    list_assets,
    list_liabilities,
    list_snapshots,
    upsert_today_snapshot,
)

router = APIRouter(tags=["net-worth"])

Session = Annotated[AsyncSession, Depends(get_session)]


# ======================================================================
# Assets
# ======================================================================
@router.post("/assets", response_model=AssetRead, status_code=status.HTTP_201_CREATED)
async def create_asset(payload: AssetCreate, user: CurrentUser, session: Session):
    asset = Asset(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        value=payload.value,
        currency=payload.currency.upper(),
    )
    if await session.get(Asset, asset.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An asset with this id already exists")
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return asset


@router.get("/assets", response_model=list[AssetRead])
async def get_assets(user: CurrentUser, session: Session):
    return await list_assets(session, user.id)


@router.patch("/assets/{asset_id}", response_model=AssetRead)
async def update_asset(
    asset_id: uuid.UUID, payload: AssetUpdate, user: CurrentUser, session: Session
):
    asset = await get_owned_asset(session, user.id, asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(asset, key, value)
    asset.updated_at = utcnow()
    session.add(asset)
    await session.commit()
    await session.refresh(asset)
    return asset


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(asset_id: uuid.UUID, user: CurrentUser, session: Session):
    asset = await get_owned_asset(session, user.id, asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    asset.deleted = True
    asset.updated_at = utcnow()
    session.add(asset)
    await session.commit()


# ======================================================================
# Liabilities
# ======================================================================
@router.post("/liabilities", response_model=LiabilityRead, status_code=status.HTTP_201_CREATED)
async def create_liability(payload: LiabilityCreate, user: CurrentUser, session: Session):
    liability = Liability(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        balance=payload.balance,
        currency=payload.currency.upper(),
        interest_rate=payload.interest_rate,
    )
    if await session.get(Liability, liability.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A liability with this id already exists")
    session.add(liability)
    await session.commit()
    await session.refresh(liability)
    return liability


@router.get("/liabilities", response_model=list[LiabilityRead])
async def get_liabilities(user: CurrentUser, session: Session):
    return await list_liabilities(session, user.id)


@router.patch("/liabilities/{liability_id}", response_model=LiabilityRead)
async def update_liability(
    liability_id: uuid.UUID, payload: LiabilityUpdate, user: CurrentUser, session: Session
):
    liability = await get_owned_liability(session, user.id, liability_id)
    if liability is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Liability not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(liability, key, value)
    liability.updated_at = utcnow()
    session.add(liability)
    await session.commit()
    await session.refresh(liability)
    return liability


@router.delete("/liabilities/{liability_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_liability(liability_id: uuid.UUID, user: CurrentUser, session: Session):
    liability = await get_owned_liability(session, user.id, liability_id)
    if liability is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Liability not found")
    liability.deleted = True
    liability.updated_at = utcnow()
    session.add(liability)
    await session.commit()


# ======================================================================
# Net worth summary + history
# ======================================================================
@router.get("/net-worth", response_model=NetWorthSummary)
async def net_worth_summary(user: CurrentUser, session: Session):
    return await compute_net_worth(session, user.id)


@router.get("/net-worth/history", response_model=list[SnapshotRead])
async def net_worth_history(user: CurrentUser, session: Session):
    return await list_snapshots(session, user.id)


@router.post("/net-worth/snapshot", response_model=SnapshotRead)
async def record_snapshot(user: CurrentUser, session: Session):
    snapshot = await upsert_today_snapshot(session, user.id, user.default_currency)
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
