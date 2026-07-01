"""Query + mapping helpers for the budgeting module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it; there
is no code path here that reads another user's rows.

The `*_to_month_input` mapping is the seam between stored `Entry` rows and the
pure domain core: it collapses a month's entries into the numeric `MonthInput`
the core understands.
"""

import uuid
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.budgeting.models import Category, Entry
from app.shared.domain.budgeting import MonthInput


async def get_owned_entry(
    session: AsyncSession, user_id: uuid.UUID, entry_id: uuid.UUID
) -> Entry | None:
    entry = await session.get(Entry, entry_id)
    if entry is None or entry.user_id != user_id:
        return None
    return entry


async def get_owned_category(
    session: AsyncSession, user_id: uuid.UUID, category_id: uuid.UUID
) -> Category | None:
    category = await session.get(Category, category_id)
    if category is None or category.user_id != user_id:
        return None
    return category


async def list_entries_for_year(
    session: AsyncSession, user_id: uuid.UUID, year: int
) -> list[Entry]:
    result = await session.execute(
        select(Entry).where(
            Entry.user_id == user_id,
            Entry.year == year,
            Entry.deleted == False,  # noqa: E712 (SQL boolean, not Python identity)
        )
    )
    return list(result.scalars().all())


def entries_to_month_input(entries: Sequence[Entry]) -> MonthInput:
    """Collapse a single month's entries into the domain core's MonthInput.

    Only the totals matter to the formulas, so every income line folds into
    `extras`; the distinct nomina/otros slots from the prototype are not needed
    here (they merely summed into incomeTotal).

    Note: amounts are summed as-is. Multi-currency conversion happens upstream in
    Stage 5 before entries reach this function; a single-currency month passes
    through unchanged.
    """
    return MonthInput(
        nomina=0.0,
        otros=0.0,
        savings_goal=sum(e.amount for e in entries if e.kind == "goal"),
        extras=[e.amount for e in entries if e.kind == "income"],
        fixed=[e.amount for e in entries if e.kind == "fixed"],
        variable=[e.amount for e in entries if e.kind == "variable"],
    )
