"""Accounts HTTP endpoints — CRUD plus derived balances.

Every route depends on `CurrentUser` and scopes its queries by `user.id`. A
lookup that finds a row owned by another user is treated as "not found" (404),
never returned — cross-user access is impossible by construction.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.accounts.models import Account
from app.modules.accounts.schemas import (
    AccountCreate,
    AccountRead,
    AccountUpdate,
    BalancesResponse,
)
from app.modules.accounts.service import (
    build_balances,
    get_owned_account,
    list_accounts,
)
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser

router = APIRouter(prefix="/accounts", tags=["accounts"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def create_account(payload: AccountCreate, user: CurrentUser, session: Session):
    account = Account(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        type=payload.type,
        currency=payload.currency.upper(),
        opening_balance=payload.opening_balance,
        color=payload.color,
        icon=payload.icon,
        position=payload.position,
        archived=payload.archived,
    )
    if await session.get(Account, account.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this id already exists")
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.get("", response_model=list[AccountRead])
async def get_accounts(
    user: CurrentUser,
    session: Session,
    include_archived: bool = False,
    include_deleted: bool = False,
):
    return await list_accounts(session, user.id, include_archived, include_deleted)


# Balances must be declared before the /{account_id} route so "balances" is not
# captured as a UUID path parameter.
@router.get("/balances", response_model=BalancesResponse)
async def account_balances(user: CurrentUser, session: Session):
    accounts = await list_accounts(session, user.id, include_archived=True)
    deltas = await _account_deltas(session, user.id)
    return build_balances(accounts, deltas)


@router.get("/{account_id}", response_model=AccountRead)
async def get_account(account_id: uuid.UUID, user: CurrentUser, session: Session):
    account = await get_owned_account(session, user.id, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    return account


@router.patch("/{account_id}", response_model=AccountRead)
async def update_account(
    account_id: uuid.UUID, payload: AccountUpdate, user: CurrentUser, session: Session
):
    account = await get_owned_account(session, user.id, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(account, key, value)
    account.updated_at = utcnow()
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(account_id: uuid.UUID, user: CurrentUser, session: Session):
    account = await get_owned_account(session, user.id, account_id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    # Soft-delete so offline clients reconcile the tombstone.
    account.deleted = True
    account.updated_at = utcnow()
    session.add(account)
    await session.commit()


async def _account_deltas(
    session: AsyncSession, user_id: uuid.UUID
) -> dict[uuid.UUID, float]:
    """Signed transaction sum per account.

    The transactions module fills this in (see
    `app.modules.transactions.service.account_deltas`). Until that slice exists
    there are no transactions, so balances equal opening balances.
    """
    try:
        from app.modules.transactions.service import account_deltas
    except ModuleNotFoundError:
        return {}
    return await account_deltas(session, user_id)
