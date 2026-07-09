"""Sync endpoints: /sync/push and /sync/pull.

Conflict resolution is last-write-wins on `updated_at`. A push is idempotent:
replaying the same batch produces the same server state (equal timestamps let
the incoming record re-apply harmlessly; older timestamps are ignored).

Every record is scoped to the authenticated user. Pushing an id that already
exists for a *different* user never overwrites or leaks data across the
security boundary: the record is skipped and its id reported back in
`rejected_ids`, so the client can purge the stale foreign record locally.
(A hard 403 here would poison the whole batch forever — the client would
retry the same payload on every sync pass and never sync again.)
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_session
from app.modules.accounts.models import Account
from app.modules.bills.models import RecurringRule
from app.modules.budgeting.models import Category, Entry, utcnow
from app.modules.goals.models import Goal
from app.modules.identity.dependencies import CurrentUser
from app.modules.merchants.models import Merchant
from app.modules.networth.models import Asset, Liability, NetWorthSnapshot
from app.modules.sync.schemas import PullResponse, PushRequest, PushResponse
from app.modules.tags.models import Tag
from app.modules.transactions.models import Transaction

router = APIRouter(prefix="/sync", tags=["sync"])

Session = Annotated[AsyncSession, Depends(get_session)]

# A pull re-reads this far behind the client's watermark. It papers over the
# race where another device's push commits (with a slightly older updated_at)
# while this pull is already reading — without it those rows would fall between
# two watermarks and never reach this client. Re-sent rows are harmless: the
# client's merge is last-write-wins and idempotent.
PULL_GRACE = timedelta(seconds=30)


def _to_naive_utc(dt: datetime) -> datetime:
    """Normalize any datetime to naive UTC, matching stored timestamps."""
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


_ACCOUNT_FIELDS = (
    "name",
    "type",
    "currency",
    "opening_balance",
    "color",
    "icon",
    "position",
    "archived",
    "deleted",
)
_CATEGORY_FIELDS = ("name", "kind", "position", "parent_id", "color", "icon", "deleted")
_ENTRY_FIELDS = ("year", "month", "kind", "category_id", "label", "amount", "currency", "deleted")
_TAG_FIELDS = ("name", "color", "deleted")
_ASSET_FIELDS = ("name", "kind", "value", "currency", "deleted")
_LIABILITY_FIELDS = ("name", "kind", "balance", "currency", "interest_rate", "deleted")
_SNAPSHOT_FIELDS = (
    "date",
    "assets_total",
    "liabilities_total",
    "net_worth",
    "currency",
    "deleted",
)
_GOAL_FIELDS = (
    "name",
    "kind",
    "target_amount",
    "current_amount",
    "monthly_contribution",
    "currency",
    "target_date",
    "deleted",
)
_RULE_FIELDS = (
    "name",
    "type",
    "amount",
    "currency",
    "account_id",
    "transfer_account_id",
    "merchant_id",
    "category_id",
    "notes",
    "frequency",
    "interval",
    "start_date",
    "end_date",
    "next_run",
    "auto_generate",
    "deleted",
)
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
_TX_FIELDS = (
    "type",
    "amount",
    "currency",
    "account_id",
    "transfer_account_id",
    "merchant_id",
    "recurring_id",
    "category_id",
    "split_parent",
    "parent_id",
    "date",
    "notes",
    "tags",
    "deleted",
)


async def _upsert_batch(
    session: AsyncSession,
    user_id: uuid.UUID,
    incoming_batch,
    model,
    fields: tuple[str, ...],
    rejected: list[uuid.UUID],
) -> list:
    """Last-write-wins upsert for one table, batched.

    Existing rows are fetched with a single `IN` query (not one `get` per
    record — a first sync can carry thousands of rows). A record whose id is
    owned by another user is skipped and reported via `rejected`.
    """
    if not incoming_batch:
        return []
    ids = [r.id for r in incoming_batch]
    by_id = {}
    # Chunked so a huge first sync never exceeds SQLite's bind-variable limit.
    for start in range(0, len(ids), 500):
        chunk = ids[start : start + 500]
        rows = (await session.execute(select(model).where(model.id.in_(chunk)))).scalars()
        by_id.update({row.id: row for row in rows})

    results = []
    for incoming in incoming_batch:
        existing = by_id.get(incoming.id)
        if existing is not None and existing.user_id != user_id:
            rejected.append(incoming.id)
            continue
        inc_ts = _to_naive_utc(incoming.updated_at)
        data = incoming.model_dump()
        if "currency" in data:
            data["currency"] = data["currency"].upper()

        if existing is None:
            row = model(
                id=incoming.id,
                user_id=user_id,
                created_at=inc_ts,
                updated_at=inc_ts,
                **{k: data[k] for k in fields},
            )
            session.add(row)
            by_id[incoming.id] = row
            results.append(row)
            continue

        if inc_ts >= existing.updated_at:
            for field in fields:
                setattr(existing, field, data[field])
            existing.updated_at = inc_ts
            session.add(existing)
        results.append(existing)
    return results


@router.post("/push", response_model=PushResponse)
async def push(payload: PushRequest, user: CurrentUser, session: Session):
    rejected: list[uuid.UUID] = []

    async def batch(records, model, fields):
        return await _upsert_batch(session, user.id, records, model, fields, rejected)

    accounts = await batch(payload.accounts, Account, _ACCOUNT_FIELDS)
    merchants = await batch(payload.merchants, Merchant, _MERCHANT_FIELDS)
    rules = await batch(payload.recurring_rules, RecurringRule, _RULE_FIELDS)
    goals = await batch(payload.goals, Goal, _GOAL_FIELDS)
    assets = await batch(payload.assets, Asset, _ASSET_FIELDS)
    liabilities = await batch(payload.liabilities, Liability, _LIABILITY_FIELDS)
    snapshots = await batch(payload.snapshots, NetWorthSnapshot, _SNAPSHOT_FIELDS)
    transactions = await batch(payload.transactions, Transaction, _TX_FIELDS)
    categories = await batch(payload.categories, Category, _CATEGORY_FIELDS)
    entries = await batch(payload.entries, Entry, _ENTRY_FIELDS)
    tags = await batch(payload.tags, Tag, _TAG_FIELDS)
    await session.commit()
    # No per-record refresh: `expire_on_commit=False` keeps the committed state
    # on the instances, and refreshing each row would double the round-trips.
    return PushResponse(
        accounts=accounts,
        transactions=transactions,
        merchants=merchants,
        recurring_rules=rules,
        goals=goals,
        assets=assets,
        liabilities=liabilities,
        snapshots=snapshots,
        categories=categories,
        entries=entries,
        tags=tags,
        rejected_ids=rejected,
        server_time=utcnow(),
    )


@router.get("/pull", response_model=PullResponse)
async def pull(user: CurrentUser, session: Session, since: datetime | None = None):
    cutoff = _to_naive_utc(since) - PULL_GRACE if since is not None else None

    async def fetch(model):
        stmt = select(model).where(model.user_id == user.id)
        if cutoff is not None:
            stmt = stmt.where(model.updated_at > cutoff)
        # Tombstones (deleted=True) are intentionally included so the client
        # can remove locally-deleted records it hasn't yet seen the deletion for.
        return list((await session.execute(stmt)).scalars().all())

    return PullResponse(
        accounts=await fetch(Account),
        transactions=await fetch(Transaction),
        merchants=await fetch(Merchant),
        recurring_rules=await fetch(RecurringRule),
        goals=await fetch(Goal),
        assets=await fetch(Asset),
        liabilities=await fetch(Liability),
        snapshots=await fetch(NetWorthSnapshot),
        categories=await fetch(Category),
        entries=await fetch(Entry),
        tags=await fetch(Tag),
        server_time=utcnow(),
    )
