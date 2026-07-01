"""Layout endpoints: GET the current dashboard layout, PUT to replace it.

Both are scoped to the authenticated user (the layout's primary key is the user
id, so cross-user access is structurally impossible). PUT uses last-write-wins
on `updated_at` so an offline client's save doesn't clobber a newer one.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser
from app.modules.layout.models import WidgetLayout
from app.modules.layout.schemas import LayoutRead, LayoutWrite

router = APIRouter(prefix="/layout", tags=["layout"])

Session = Annotated[AsyncSession, Depends(get_session)]


def _to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


@router.get("", response_model=LayoutRead)
async def get_layout(user: CurrentUser, session: Session):
    row = await session.get(WidgetLayout, user.id)
    if row is None:
        # No saved layout yet: return an empty one so the client applies defaults.
        return LayoutRead(data={}, updated_at=utcnow())
    return LayoutRead(data=row.data, updated_at=row.updated_at)


@router.put("", response_model=LayoutRead)
async def put_layout(payload: LayoutWrite, user: CurrentUser, session: Session):
    incoming_ts = _to_naive_utc(payload.updated_at) if payload.updated_at else utcnow()
    row = await session.get(WidgetLayout, user.id)
    if row is None:
        row = WidgetLayout(user_id=user.id, data=payload.data, updated_at=incoming_ts)
        session.add(row)
    elif incoming_ts >= row.updated_at:
        row.data = payload.data
        row.updated_at = incoming_ts
        session.add(row)
    await session.commit()
    await session.refresh(row)
    return LayoutRead(data=row.data, updated_at=row.updated_at)
