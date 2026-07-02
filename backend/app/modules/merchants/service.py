"""Query helpers for the merchants module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.merchants.models import Merchant
from app.modules.merchants.schemas import MerchantStats
from app.modules.transactions.models import Transaction


async def get_owned_merchant(
    session: AsyncSession, user_id: uuid.UUID, merchant_id: uuid.UUID
) -> Merchant | None:
    merchant = await session.get(Merchant, merchant_id)
    if merchant is None or merchant.user_id != user_id:
        return None
    return merchant


async def list_merchants(
    session: AsyncSession, user_id: uuid.UUID, include_deleted: bool = False
) -> list[Merchant]:
    stmt = select(Merchant).where(Merchant.user_id == user_id)
    if not include_deleted:
        stmt = stmt.where(Merchant.deleted == False)  # noqa: E712
    stmt = stmt.order_by(Merchant.name)
    return list((await session.execute(stmt)).scalars().all())


async def merchant_stats(
    session: AsyncSession, user_id: uuid.UUID, merchant_id: uuid.UUID
) -> MerchantStats:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.merchant_id == merchant_id,
        Transaction.deleted == False,  # noqa: E712
    )
    txs = list((await session.execute(stmt)).scalars().all())
    spent = sum(t.amount for t in txs if t.type == "expense")
    received = sum(t.amount for t in txs if t.type == "income")
    return MerchantStats(
        merchant_id=merchant_id,
        transaction_count=len(txs),
        total_spent=spent,
        total_received=received,
    )
