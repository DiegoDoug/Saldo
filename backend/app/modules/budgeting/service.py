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
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.budgeting.models import Category, Entry
from app.modules.budgeting.schemas import CategoryTreeNode
from app.modules.transactions.models import Transaction
from app.shared.domain.budgeting import MonthInput

# A defensive cap so a pre-existing corrupt parent chain can't spin forever.
_MAX_CATEGORY_DEPTH = 64


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


async def validate_category_parent(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    category_id: uuid.UUID,
    parent_id: uuid.UUID | None,
    kind: str,
) -> None:
    """Reject an invalid parent link before it is written.

    Rules: the parent must belong to this user, share the child's `kind` (a child
    inherits its root's kind), and never form a cycle. Raises HTTPException(400)
    on any violation; a valid or absent parent returns quietly.
    """
    if parent_id is None:
        return
    if parent_id == category_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A category cannot be its own parent")

    parent = await get_owned_category(session, user_id, parent_id)
    if parent is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown parent category for this user")
    if parent.kind != kind:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "A subcategory must share its parent's kind"
        )

    # Walk up from the parent; reaching this category would close a cycle.
    cursor: uuid.UUID | None = parent.parent_id
    for _ in range(_MAX_CATEGORY_DEPTH):
        if cursor is None:
            return
        if cursor == category_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Category parenting would form a cycle"
            )
        ancestor = await session.get(Category, cursor)
        cursor = ancestor.parent_id if ancestor is not None else None
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category nesting is too deep")


def build_category_tree(categories: Sequence[Category]) -> list[CategoryTreeNode]:
    """Assemble flat categories into a nested forest, ordered by kind/position.

    Orphans (a `parent_id` pointing outside the given set) surface as roots so no
    category is ever hidden from the tree.
    """
    nodes = {c.id: CategoryTreeNode.model_validate(c) for c in categories}
    roots: list[CategoryTreeNode] = []
    for category in categories:
        node = nodes[category.id]
        parent = nodes.get(category.parent_id) if category.parent_id else None
        (parent.children if parent is not None else roots).append(node)

    def _sort(items: list[CategoryTreeNode]) -> None:
        items.sort(key=lambda n: (n.kind, n.position))
        for item in items:
            _sort(item.children)

    _sort(roots)
    return roots


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


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    """Half-open [start, end) date range for a (year, month 0-11) pair."""
    start = date(year, month + 1, 1)
    end = date(year + 1, 1, 1) if month == 11 else date(year, month + 2, 1)
    return start, end


async def month_budget_actuals(
    session: AsyncSession, user_id: uuid.UUID, year: int, month: int
) -> tuple[dict[str, float], dict[str, float]]:
    """Per-category budgets (from entries) and actuals (from transactions).

    Budgets are the month's categorized entry amounts (goal entries carry no
    category and are excluded). Actuals are the month's categorized transactions,
    transfers excluded (they move money between accounts rather than spend it).
    Single-currency amounts, matching the domain core's assumption.
    """
    entry_rows = (
        await session.execute(
            select(Entry).where(
                Entry.user_id == user_id,
                Entry.year == year,
                Entry.month == month,
                Entry.deleted == False,  # noqa: E712
                Entry.category_id != None,  # noqa: E711
                Entry.kind != "goal",
            )
        )
    ).scalars().all()

    start, end = _month_bounds(year, month)
    tx_rows = (
        await session.execute(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.deleted == False,  # noqa: E712
                # Count leaves only — split parents are excluded, their children
                # carry the categorized amounts.
                Transaction.split_parent == False,  # noqa: E712
                Transaction.category_id != None,  # noqa: E711
                Transaction.type != "transfer",
                Transaction.date >= start,
                Transaction.date < end,
            )
        )
    ).scalars().all()

    budgets: dict[str, float] = {}
    for e in entry_rows:
        budgets[str(e.category_id)] = budgets.get(str(e.category_id), 0.0) + e.amount
    actuals: dict[str, float] = {}
    for t in tx_rows:
        actuals[str(t.category_id)] = actuals.get(str(t.category_id), 0.0) + t.amount
    return budgets, actuals


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
