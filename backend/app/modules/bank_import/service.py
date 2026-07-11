"""Query helpers for the bank-import module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it, same
convention as every other module.
"""

import uuid

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.bank_import.models import BankImport


async def get_owned_import(
    session: AsyncSession, user_id: uuid.UUID, import_id: uuid.UUID
) -> BankImport | None:
    row = await session.get(BankImport, import_id)
    if row is None or row.user_id != user_id:
        return None
    return row


async def find_by_content_hash(
    session: AsyncSession, user_id: uuid.UUID, content_hash: str
) -> BankImport | None:
    stmt = (
        select(BankImport)
        .where(
            BankImport.user_id == user_id,
            BankImport.content_hash == content_hash,
            BankImport.status != "discarded",
        )
        .order_by(BankImport.created_at.desc())
    )
    return (await session.execute(stmt)).scalars().first()


async def list_imports(
    session: AsyncSession, user_id: uuid.UUID, limit: int, offset: int
) -> tuple[list[BankImport], int]:
    base = select(BankImport).where(BankImport.user_id == user_id)
    total = (
        await session.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    stmt = (
        base.order_by(BankImport.created_at.desc(), BankImport.id).limit(limit).offset(offset)
    )
    items = list((await session.execute(stmt)).scalars().all())
    return items, total
