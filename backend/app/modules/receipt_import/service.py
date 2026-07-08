"""Query helpers for the receipt-import module.

Plain functions over a session (no repository interfaces — see
ARCHITECTURE.md). Every function that touches user data takes a `user_id` and
filters by it, same convention as every other module.
"""

import uuid

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.receipt_import.models import ReceiptImport


async def get_owned_receipt(
    session: AsyncSession, user_id: uuid.UUID, receipt_id: uuid.UUID
) -> ReceiptImport | None:
    receipt = await session.get(ReceiptImport, receipt_id)
    if receipt is None or receipt.user_id != user_id:
        return None
    return receipt


async def find_by_content_hash(
    session: AsyncSession, user_id: uuid.UUID, content_hash: str
) -> ReceiptImport | None:
    """Most recent non-discarded receipt for this user with the same content hash.

    Backs the v1 duplicate-upload warning (docs/receipt-import/03-backend-api-design.md).
    """
    stmt = (
        select(ReceiptImport)
        .where(
            ReceiptImport.user_id == user_id,
            ReceiptImport.content_hash == content_hash,
            ReceiptImport.status != "discarded",
        )
        .order_by(ReceiptImport.created_at.desc())
    )
    return (await session.execute(stmt)).scalars().first()


async def list_receipts(
    session: AsyncSession, user_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[ReceiptImport], int]:
    base = select(ReceiptImport).where(ReceiptImport.user_id == user_id)
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    stmt = base.order_by(ReceiptImport.created_at.desc(), ReceiptImport.id).limit(limit).offset(
        offset
    )
    items = list((await session.execute(stmt)).scalars().all())
    return items, total
