"""Query helpers for the tags module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.tags.models import Tag


async def get_owned_tag(
    session: AsyncSession, user_id: uuid.UUID, tag_id: uuid.UUID
) -> Tag | None:
    tag = await session.get(Tag, tag_id)
    if tag is None or tag.user_id != user_id:
        return None
    return tag


async def list_tags(
    session: AsyncSession, user_id: uuid.UUID, include_deleted: bool = False
) -> list[Tag]:
    stmt = select(Tag).where(Tag.user_id == user_id)
    if not include_deleted:
        stmt = stmt.where(Tag.deleted == False)  # noqa: E712
    stmt = stmt.order_by(Tag.name)
    return list((await session.execute(stmt)).scalars().all())
