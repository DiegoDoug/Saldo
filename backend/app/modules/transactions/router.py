"""Transactions HTTP endpoints — CRUD, filtered/searchable/sorted/paginated
listing, bulk actions, and a transfer helper.

Every route depends on `CurrentUser` and scopes queries by `user.id`. Referenced
accounts and categories must belong to the caller; a mismatch is a 400 (bad
reference) and cross-user reads are 404 (not found).
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.accounts.service import get_owned_account
from app.modules.budgeting.models import utcnow
from app.modules.budgeting.service import get_owned_category
from app.modules.identity.dependencies import CurrentUser
from app.modules.transactions.models import Transaction
from app.modules.transactions.schemas import (
    BulkRequest,
    BulkResponse,
    SplitCreate,
    SplitRead,
    TransactionCreate,
    TransactionPage,
    TransactionRead,
    TransactionUpdate,
    TransferCreate,
)
from app.modules.transactions.service import (
    TransactionFilters,
    apply_sort_page,
    build_split_rows,
    count_select,
    filtered_select,
    get_owned_transaction,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])

Session = Annotated[AsyncSession, Depends(get_session)]


async def _validate_refs(
    session: AsyncSession, user_id: uuid.UUID, data: dict
) -> None:
    """Ensure any referenced account/category/merchant belongs to the caller."""
    for field in ("account_id", "transfer_account_id"):
        aid = data.get(field)
        if aid is not None and await get_owned_account(session, user_id, aid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown account for {field}")
    cid = data.get("category_id")
    if cid is not None and await get_owned_category(session, user_id, cid) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")
    mid = data.get("merchant_id")
    if mid is not None:
        from app.modules.merchants.service import get_owned_merchant

        if await get_owned_merchant(session, user_id, mid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown merchant for this user")


@router.post("", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transaction(payload: TransactionCreate, user: CurrentUser, session: Session):
    await _validate_refs(session, user.id, payload.model_dump())
    tx = Transaction(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency.upper(),
        account_id=payload.account_id,
        transfer_account_id=payload.transfer_account_id,
        merchant_id=payload.merchant_id,
        recurring_id=payload.recurring_id,
        category_id=payload.category_id,
        date=payload.date,
        notes=payload.notes,
        tags=payload.tags,
    )
    if await session.get(Transaction, tx.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A transaction with this id already exists")
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


@router.get("", response_model=TransactionPage)
async def list_transactions(
    user: CurrentUser,
    session: Session,
    account_id: uuid.UUID | None = None,
    type: str | None = None,
    category_id: uuid.UUID | None = None,
    merchant_id: uuid.UUID | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
    tag: str | None = None,
    include_deleted: bool = False,
    sort: str = "date",
    order: str = "desc",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    filters = TransactionFilters(
        account_id=account_id,
        type=type,
        category_id=category_id,
        merchant_id=merchant_id,
        date_from=date.fromisoformat(date_from) if date_from else None,
        date_to=date.fromisoformat(date_to) if date_to else None,
        q=q,
        tag=tag,
        include_deleted=include_deleted,
    )
    total = (await session.execute(count_select(user.id, filters))).scalar_one()
    stmt = apply_sort_page(filtered_select(user.id, filters), sort, order, limit, offset)
    items = list((await session.execute(stmt)).scalars().all())
    return TransactionPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/{tx_id}", response_model=TransactionRead)
async def get_transaction(tx_id: uuid.UUID, user: CurrentUser, session: Session):
    tx = await get_owned_transaction(session, user.id, tx_id)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    return tx


@router.patch("/{tx_id}", response_model=TransactionRead)
async def update_transaction(
    tx_id: uuid.UUID, payload: TransactionUpdate, user: CurrentUser, session: Session
):
    tx = await get_owned_transaction(session, user.id, tx_id)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    data = payload.model_dump(exclude_unset=True)
    await _validate_refs(session, user.id, data)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(tx, key, value)
    tx.updated_at = utcnow()
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(tx_id: uuid.UUID, user: CurrentUser, session: Session):
    tx = await get_owned_transaction(session, user.id, tx_id)
    if tx is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    tx.deleted = True
    tx.updated_at = utcnow()
    session.add(tx)
    await session.commit()


@router.post("/bulk", response_model=BulkResponse)
async def bulk_action(payload: BulkRequest, user: CurrentUser, session: Session):
    if payload.action == "set_category" and payload.category_id is not None:
        if await get_owned_category(session, user.id, payload.category_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")
    affected = 0
    for tx_id in payload.ids:
        tx = await get_owned_transaction(session, user.id, tx_id)
        if tx is None:
            continue  # skip ids the caller doesn't own — never leak their existence
        _apply_bulk(tx, payload)
        tx.updated_at = utcnow()
        session.add(tx)
        affected += 1
    await session.commit()
    return BulkResponse(affected=affected)


def _apply_bulk(tx: Transaction, payload: BulkRequest) -> None:
    if payload.action == "delete":
        tx.deleted = True
    elif payload.action == "set_category":
        tx.category_id = payload.category_id
    elif payload.action == "add_tag" and payload.tag and payload.tag not in tx.tags:
        # Reassign (not append) so SQLAlchemy notices the JSON column changed.
        tx.tags = [*tx.tags, payload.tag]


@router.post("/split", response_model=SplitRead, status_code=status.HTTP_201_CREATED)
async def create_split(payload: SplitCreate, user: CurrentUser, session: Session):
    """Create a split: one parent container plus its categorized child leaves.

    The children must sum to the total; each referenced account/merchant/category
    must belong to the caller.
    """
    await _validate_refs(
        session,
        user.id,
        {"account_id": payload.account_id, "merchant_id": payload.merchant_id},
    )
    for child in payload.children:
        if child.category_id is not None and (
            await get_owned_category(session, user.id, child.category_id) is None
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")

    parent, children = build_split_rows(user.id, payload)
    if await session.get(Transaction, parent.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A transaction with this id already exists")
    session.add(parent)
    for child in children:
        session.add(child)
    await session.commit()
    await session.refresh(parent)
    for child in children:
        await session.refresh(child)
    return SplitRead(parent=parent, children=children)


@router.post("/transfer", response_model=TransactionRead, status_code=status.HTTP_201_CREATED)
async def create_transfer(payload: TransferCreate, user: CurrentUser, session: Session):
    """Create a single transfer transaction moving money between two accounts.

    A transfer is one row with both legs (`account_id` → `transfer_account_id`);
    `account_deltas` applies -amount/+amount so balances stay consistent.
    """
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Transfer needs two distinct accounts")
    for aid in (payload.from_account_id, payload.to_account_id):
        if await get_owned_account(session, user.id, aid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown account for this user")
    tx = Transaction(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        type="transfer",
        amount=payload.amount,
        currency=payload.currency.upper(),
        account_id=payload.from_account_id,
        transfer_account_id=payload.to_account_id,
        date=payload.date,
        notes=payload.notes,
        tags=payload.tags,
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx
