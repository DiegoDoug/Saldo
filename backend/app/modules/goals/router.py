"""Goals HTTP endpoints — CRUD, projection, and contributions.

Every route depends on `CurrentUser` and scopes queries by `user.id`. A lookup
that finds a row owned by another user is treated as "not found" (404).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.goals.models import Goal
from app.modules.goals.schemas import (
    ContributeRequest,
    GoalCreate,
    GoalProjection,
    GoalRead,
    GoalUpdate,
)
from app.modules.goals.service import get_owned_goal, list_goals, project
from app.modules.identity.dependencies import CurrentUser

router = APIRouter(prefix="/goals", tags=["goals"])

Session = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=GoalRead, status_code=status.HTTP_201_CREATED)
async def create_goal(payload: GoalCreate, user: CurrentUser, session: Session):
    goal = Goal(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        target_amount=payload.target_amount,
        current_amount=payload.current_amount,
        monthly_contribution=payload.monthly_contribution,
        currency=payload.currency.upper(),
        target_date=payload.target_date,
    )
    if await session.get(Goal, goal.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A goal with this id already exists")
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


@router.get("", response_model=list[GoalRead])
async def get_goals(user: CurrentUser, session: Session, include_deleted: bool = False):
    return await list_goals(session, user.id, include_deleted)


@router.get("/{goal_id}", response_model=GoalRead)
async def get_goal(goal_id: uuid.UUID, user: CurrentUser, session: Session):
    goal = await get_owned_goal(session, user.id, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    return goal


@router.get("/{goal_id}/projection", response_model=GoalProjection)
async def get_projection(goal_id: uuid.UUID, user: CurrentUser, session: Session):
    goal = await get_owned_goal(session, user.id, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    return project(goal)


@router.patch("/{goal_id}", response_model=GoalRead)
async def update_goal(
    goal_id: uuid.UUID, payload: GoalUpdate, user: CurrentUser, session: Session
):
    goal = await get_owned_goal(session, user.id, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    data = payload.model_dump(exclude_unset=True)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(goal, key, value)
    goal.updated_at = utcnow()
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


@router.post("/{goal_id}/contribute", response_model=GoalRead)
async def contribute(
    goal_id: uuid.UUID, payload: ContributeRequest, user: CurrentUser, session: Session
):
    goal = await get_owned_goal(session, user.id, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    goal.current_amount += payload.amount
    goal.updated_at = utcnow()
    session.add(goal)
    await session.commit()
    await session.refresh(goal)
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: uuid.UUID, user: CurrentUser, session: Session):
    goal = await get_owned_goal(session, user.id, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    goal.deleted = True
    goal.updated_at = utcnow()
    session.add(goal)
    await session.commit()
