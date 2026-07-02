"""Query + projection helpers for the goals module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function takes a `user_id` and filters by it. Projection math is delegated
to the framework-free core (`app.shared.domain.goals`).
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.goals.models import Goal
from app.modules.goals.schemas import GoalProjection
from app.shared.domain.goals import completion_date, months_remaining, progress, remaining_amount


async def get_owned_goal(
    session: AsyncSession, user_id: uuid.UUID, goal_id: uuid.UUID
) -> Goal | None:
    goal = await session.get(Goal, goal_id)
    if goal is None or goal.user_id != user_id:
        return None
    return goal


async def list_goals(
    session: AsyncSession, user_id: uuid.UUID, include_deleted: bool = False
) -> list[Goal]:
    stmt = select(Goal).where(Goal.user_id == user_id)
    if not include_deleted:
        stmt = stmt.where(Goal.deleted == False)  # noqa: E712
    stmt = stmt.order_by(Goal.created_at)
    return list((await session.execute(stmt)).scalars().all())


def project(goal: Goal, today: date | None = None) -> GoalProjection:
    now = today or date.today()
    return GoalProjection(
        goal_id=goal.id,
        progress=progress(goal.current_amount, goal.target_amount),
        remaining_amount=remaining_amount(goal.current_amount, goal.target_amount),
        months_remaining=months_remaining(
            goal.current_amount, goal.target_amount, goal.monthly_contribution
        ),
        estimated_completion_date=completion_date(
            now, goal.current_amount, goal.target_amount, goal.monthly_contribution
        ),
    )
