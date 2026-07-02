"""Sync endpoints: /sync/push and /sync/pull.

Conflict resolution is last-write-wins on `updated_at`. A push is idempotent:
replaying the same batch produces the same server state (equal timestamps let
the incoming record re-apply harmlessly; older timestamps are ignored).

Every record is scoped to the authenticated user. Pushing an id that already
exists for a *different* user is refused (403) rather than silently overwriting
or leaking data across the security boundary.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_session
from app.modules.accounts.models import Account
from app.modules.budgeting.models import Category, Entry, utcnow
from app.modules.identity.dependencies import CurrentUser
from app.modules.merchants.models import Merchant
from app.modules.sync.schemas import (
    AccountSync,
    CategorySync,
    EntrySync,
    MerchantSync,
    PullResponse,
    PushRequest,
    PushResponse,
    TransactionSync,
)
from app.modules.transactions.models import Transaction

router = APIRouter(prefix="/sync", tags=["sync"])

Session = Annotated[AsyncSession, Depends(get_session)]


def _to_naive_utc(dt: datetime) -> datetime:
    """Normalize any datetime to naive UTC, matching stored timestamps."""
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def _ensure_owned(record, user_id: uuid.UUID) -> None:
    if record is not None and record.user_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Record belongs to another user")


async def _upsert_account(
    session: AsyncSession, user_id: uuid.UUID, incoming: AccountSync
) -> Account:
    existing = await session.get(Account, incoming.id)
    _ensure_owned(existing, user_id)
    inc_ts = _to_naive_utc(incoming.updated_at)

    if existing is None:
        account = Account(
            id=incoming.id,
            user_id=user_id,
            name=incoming.name,
            type=incoming.type,
            currency=incoming.currency.upper(),
            opening_balance=incoming.opening_balance,
            color=incoming.color,
            icon=incoming.icon,
            position=incoming.position,
            archived=incoming.archived,
            created_at=inc_ts,
            updated_at=inc_ts,
            deleted=incoming.deleted,
        )
        session.add(account)
        return account

    if inc_ts >= existing.updated_at:
        existing.name = incoming.name
        existing.type = incoming.type
        existing.currency = incoming.currency.upper()
        existing.opening_balance = incoming.opening_balance
        existing.color = incoming.color
        existing.icon = incoming.icon
        existing.position = incoming.position
        existing.archived = incoming.archived
        existing.deleted = incoming.deleted
        existing.updated_at = inc_ts
        session.add(existing)
    return existing


_MERCHANT_FIELDS = (
    "name",
    "logo",
    "color",
    "category_id",
    "website",
    "location",
    "recurring_probability",
    "deleted",
)


async def _upsert_merchant(
    session: AsyncSession, user_id: uuid.UUID, incoming: MerchantSync
) -> Merchant:
    existing = await session.get(Merchant, incoming.id)
    _ensure_owned(existing, user_id)
    inc_ts = _to_naive_utc(incoming.updated_at)
    data = incoming.model_dump()

    if existing is None:
        merchant = Merchant(
            id=incoming.id,
            user_id=user_id,
            created_at=inc_ts,
            updated_at=inc_ts,
            **{k: data[k] for k in _MERCHANT_FIELDS},
        )
        session.add(merchant)
        return merchant

    if inc_ts >= existing.updated_at:
        for field in _MERCHANT_FIELDS:
            setattr(existing, field, data[field])
        existing.updated_at = inc_ts
        session.add(existing)
    return existing


_TX_FIELDS = (
    "type",
    "amount",
    "currency",
    "account_id",
    "transfer_account_id",
    "merchant_id",
    "recurring_id",
    "category_id",
    "date",
    "notes",
    "tags",
    "deleted",
)


async def _upsert_transaction(
    session: AsyncSession, user_id: uuid.UUID, incoming: TransactionSync
) -> Transaction:
    existing = await session.get(Transaction, incoming.id)
    _ensure_owned(existing, user_id)
    inc_ts = _to_naive_utc(incoming.updated_at)
    data = incoming.model_dump()
    data["currency"] = incoming.currency.upper()

    if existing is None:
        tx = Transaction(
            id=incoming.id,
            user_id=user_id,
            created_at=inc_ts,
            updated_at=inc_ts,
            **{k: data[k] for k in _TX_FIELDS},
        )
        session.add(tx)
        return tx

    if inc_ts >= existing.updated_at:
        for field in _TX_FIELDS:
            setattr(existing, field, data[field])
        existing.updated_at = inc_ts
        session.add(existing)
    return existing


async def _upsert_category(
    session: AsyncSession, user_id: uuid.UUID, incoming: CategorySync
) -> Category:
    existing = await session.get(Category, incoming.id)
    _ensure_owned(existing, user_id)
    inc_ts = _to_naive_utc(incoming.updated_at)

    if existing is None:
        category = Category(
            id=incoming.id,
            user_id=user_id,
            name=incoming.name,
            kind=incoming.kind,
            position=incoming.position,
            created_at=inc_ts,
            updated_at=inc_ts,
            deleted=incoming.deleted,
        )
        session.add(category)
        return category

    # Last-write-wins: apply only if the incoming version is at least as new.
    if inc_ts >= existing.updated_at:
        existing.name = incoming.name
        existing.kind = incoming.kind
        existing.position = incoming.position
        existing.deleted = incoming.deleted
        existing.updated_at = inc_ts
        session.add(existing)
    return existing


async def _upsert_entry(
    session: AsyncSession, user_id: uuid.UUID, incoming: EntrySync
) -> Entry:
    existing = await session.get(Entry, incoming.id)
    _ensure_owned(existing, user_id)
    inc_ts = _to_naive_utc(incoming.updated_at)

    if existing is None:
        entry = Entry(
            id=incoming.id,
            user_id=user_id,
            year=incoming.year,
            month=incoming.month,
            kind=incoming.kind,
            category_id=incoming.category_id,
            label=incoming.label,
            amount=incoming.amount,
            currency=incoming.currency.upper(),
            created_at=inc_ts,
            updated_at=inc_ts,
            deleted=incoming.deleted,
        )
        session.add(entry)
        return entry

    if inc_ts >= existing.updated_at:
        existing.year = incoming.year
        existing.month = incoming.month
        existing.kind = incoming.kind
        existing.category_id = incoming.category_id
        existing.label = incoming.label
        existing.amount = incoming.amount
        existing.currency = incoming.currency.upper()
        existing.deleted = incoming.deleted
        existing.updated_at = inc_ts
        session.add(existing)
    return existing


@router.post("/push", response_model=PushResponse)
async def push(payload: PushRequest, user: CurrentUser, session: Session):
    accounts = [await _upsert_account(session, user.id, a) for a in payload.accounts]
    merchants = [await _upsert_merchant(session, user.id, m) for m in payload.merchants]
    transactions = [await _upsert_transaction(session, user.id, t) for t in payload.transactions]
    categories = [await _upsert_category(session, user.id, c) for c in payload.categories]
    entries = [await _upsert_entry(session, user.id, e) for e in payload.entries]
    await session.commit()
    for record in (*accounts, *merchants, *transactions, *categories, *entries):
        await session.refresh(record)
    return PushResponse(
        accounts=accounts,
        transactions=transactions,
        merchants=merchants,
        categories=categories,
        entries=entries,
        server_time=utcnow(),
    )


@router.get("/pull", response_model=PullResponse)
async def pull(user: CurrentUser, session: Session, since: datetime | None = None):
    acc_stmt = select(Account).where(Account.user_id == user.id)
    merchant_stmt = select(Merchant).where(Merchant.user_id == user.id)
    tx_stmt = select(Transaction).where(Transaction.user_id == user.id)
    cat_stmt = select(Category).where(Category.user_id == user.id)
    entry_stmt = select(Entry).where(Entry.user_id == user.id)
    if since is not None:
        cutoff = _to_naive_utc(since)
        acc_stmt = acc_stmt.where(Account.updated_at > cutoff)
        merchant_stmt = merchant_stmt.where(Merchant.updated_at > cutoff)
        tx_stmt = tx_stmt.where(Transaction.updated_at > cutoff)
        cat_stmt = cat_stmt.where(Category.updated_at > cutoff)
        entry_stmt = entry_stmt.where(Entry.updated_at > cutoff)

    # Tombstones (deleted=True) are intentionally included so the client can
    # remove locally-deleted records it hasn't yet seen the deletion for.
    accounts = list((await session.execute(acc_stmt)).scalars().all())
    merchants = list((await session.execute(merchant_stmt)).scalars().all())
    transactions = list((await session.execute(tx_stmt)).scalars().all())
    categories = list((await session.execute(cat_stmt)).scalars().all())
    entries = list((await session.execute(entry_stmt)).scalars().all())
    return PullResponse(
        accounts=accounts,
        transactions=transactions,
        merchants=merchants,
        categories=categories,
        entries=entries,
        server_time=utcnow(),
    )
