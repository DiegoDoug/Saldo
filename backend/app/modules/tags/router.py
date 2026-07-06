"""Tags HTTP endpoints — CRUD for the per-user tag registry.

Every route depends on `CurrentUser` and scopes queries by `user.id`. A lookup
that finds a row owned by another user is treated as "not found" (404). Deletes
are soft (tombstones) so offline clients reconcile them like everything else.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser
from app.modules.tags.models import Tag
from app.modules.tags.schemas import TagCreate, TagRead, TagUpdate
from app.modules.tags.service import get_owned_tag, list_tags

router = APIRouter(prefix="/tags", tags=["tags"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(payload: TagCreate, user: CurrentUser, session: Session):
    tag = Tag(
        id=payload.id or uuid.uuid4(), user_id=user.id, name=payload.name, color=payload.color
    )
    if await session.get(Tag, tag.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A tag with this id already exists")
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.get("", response_model=list[TagRead])
async def get_tags(user: CurrentUser, session: Session, include_deleted: bool = False):
    return await list_tags(session, user.id, include_deleted)


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(tag_id: uuid.UUID, payload: TagUpdate, user: CurrentUser, session: Session):
    tag = await get_owned_tag(session, user.id, tag_id)
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    tag.updated_at = utcnow()
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, user: CurrentUser, session: Session):
    tag = await get_owned_tag(session, user.id, tag_id)
    if tag is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    tag.deleted = True
    tag.updated_at = utcnow()
    session.add(tag)
    await session.commit()
