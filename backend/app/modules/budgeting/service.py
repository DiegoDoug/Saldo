"""Query + mapping helpers for the budgeting module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it; there
is no code path here that reads another user's rows.

The `*_to_month_input` mapping is the seam between stored `Entry` rows and the
pure domain core: it collapses a month's entries into the numeric `MonthInput`
the core understands.
"""

import uuid
from collections.abc import Callable, Sequence

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


def entries_to_month_input(
    entries: Sequence[Entry],
    amount_of: Callable[[Entry], float] | None = None,
) -> MonthInput:
    """Collapse a single month's entries into the domain core's MonthInput.

    Only the totals matter to the formulas, so every income line folds into
    `extras`; the distinct nomina/otros slots from the prototype are not needed
    here (they merely summed into incomeTotal).

    `amount_of` maps an entry to the amount to use. It defaults to the raw
    `entry.amount` (single-currency months). When a month mixes currencies, the
    summary route passes a function that converts each amount to the user's
    target currency first (see the FX handling in the budgeting router).
    """
    amt = amount_of or (lambda e: e.amount)
    return MonthInput(
        nomina=0.0,
        otros=0.0,
        savings_goal=sum(amt(e) for e in entries if e.kind == "goal"),
        extras=[amt(e) for e in entries if e.kind == "income"],
        fixed=[amt(e) for e in entries if e.kind == "fixed"],
        variable=[amt(e) for e in entries if e.kind == "variable"],
    )


def _distinct_currencies(entries: Sequence[Entry]) -> set[str]:
    return {e.currency.upper() for e in entries}


async def build_month_input(
    entries: Sequence[Entry],
    target_currency: str,
    fx,
) -> MonthInput:
    """Build a MonthInput, converting to `target_currency` only if needed.

    A single-currency month (the common case) skips FX entirely. A mixed-currency
    month fetches one rate per foreign currency and converts each amount.
    """
    currencies = _distinct_currencies(entries)
    if len(currencies) <= 1:
        return entries_to_month_input(entries)

    target = target_currency.upper()
    rates = {c: await fx.get_rate(c, target) for c in currencies}
    return entries_to_month_input(entries, amount_of=lambda e: e.amount * rates[e.currency.upper()])
