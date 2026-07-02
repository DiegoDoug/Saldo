"""Query + mapping helpers for the transactions module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it.

`account_deltas` is the seam the accounts module consumes to turn opening
balances into current balances.
"""

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, String, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.transactions.models import Transaction


async def get_owned_transaction(
    session: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID
) -> Transaction | None:
    tx = await session.get(Transaction, tx_id)
    if tx is None or tx.user_id != user_id:
        return None
    return tx


async def account_deltas(
    session: AsyncSession, user_id: uuid.UUID
) -> dict[uuid.UUID, float]:
    """Signed transaction sum per account for the current user.

    income +amount / expense -amount on `account_id`; transfers move -amount from
    `account_id` and +amount to `transfer_account_id`. Deleted rows are ignored.
    """
    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.deleted == False,  # noqa: E712
    )
    deltas: dict[uuid.UUID, float] = {}
    for tx in (await session.execute(stmt)).scalars().all():
        if tx.type == "income":
            deltas[tx.account_id] = deltas.get(tx.account_id, 0.0) + tx.amount
        elif tx.type == "expense":
            deltas[tx.account_id] = deltas.get(tx.account_id, 0.0) - tx.amount
        elif tx.type == "transfer":
            deltas[tx.account_id] = deltas.get(tx.account_id, 0.0) - tx.amount
            if tx.transfer_account_id is not None:
                deltas[tx.transfer_account_id] = (
                    deltas.get(tx.transfer_account_id, 0.0) + tx.amount
                )
    return deltas


@dataclass(frozen=True)
class TransactionFilters:
    account_id: uuid.UUID | None = None
    type: str | None = None
    category_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None
    date_from: date | None = None
    date_to: date | None = None
    q: str | None = None  # substring search over notes
    tag: str | None = None
    include_deleted: bool = False


def _apply_filters(stmt: Select, user_id: uuid.UUID, f: TransactionFilters) -> Select:
    stmt = stmt.where(Transaction.user_id == user_id)
    if not f.include_deleted:
        stmt = stmt.where(Transaction.deleted == False)  # noqa: E712
    if f.account_id is not None:
        # Either leg of a transfer counts as "on" the account.
        stmt = stmt.where(
            (Transaction.account_id == f.account_id)
            | (Transaction.transfer_account_id == f.account_id)
        )
    if f.type is not None:
        stmt = stmt.where(Transaction.type == f.type)
    if f.category_id is not None:
        stmt = stmt.where(Transaction.category_id == f.category_id)
    if f.merchant_id is not None:
        stmt = stmt.where(Transaction.merchant_id == f.merchant_id)
    if f.date_from is not None:
        stmt = stmt.where(Transaction.date >= f.date_from)
    if f.date_to is not None:
        stmt = stmt.where(Transaction.date <= f.date_to)
    if f.q:
        stmt = stmt.where(Transaction.notes.ilike(f"%{f.q}%"))
    if f.tag:
        # tags is a JSON array; match the tag as a substring of the serialized
        # array. Good enough for SQLite without a JSON1 each() join.
        stmt = stmt.where(func.cast(Transaction.tags, String).ilike(f'%"{f.tag}"%'))
    return stmt


def filtered_select(user_id: uuid.UUID, f: TransactionFilters) -> Select:
    return _apply_filters(select(Transaction), user_id, f)


def count_select(user_id: uuid.UUID, f: TransactionFilters) -> Select:
    return _apply_filters(select(func.count()).select_from(Transaction), user_id, f)


def apply_sort_page(
    stmt: Select, sort: str, order: str, limit: int, offset: int
) -> Select:
    column = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "created_at": Transaction.created_at,
    }.get(sort, Transaction.date)
    column = column.desc() if order == "desc" else column.asc()
    # Stable tiebreaker so pagination is deterministic across equal sort keys.
    return stmt.order_by(column, Transaction.id).limit(limit).offset(offset)
