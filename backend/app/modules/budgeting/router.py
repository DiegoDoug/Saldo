"""Budgeting HTTP endpoints — CRUD for categories and entries, plus month and
year summaries. Every route depends on `CurrentUser` and scopes its queries by
`user.id`. Cross-user access is impossible by construction: a lookup that finds
a row owned by another user is treated as "not found" (404), never returned.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.core.db import get_session
from app.modules.budgeting.models import Category, Entry, utcnow
from app.modules.budgeting.schemas import (
    BudgetVarianceSummary,
    CategoryCreate,
    CategoryRead,
    CategoryTreeNode,
    CategoryUpdate,
    CategoryVarianceRow,
    EntryCreate,
    EntryRead,
    EntryUpdate,
    MonthSummary,
    YearSummary,
)
from app.modules.budgeting.service import (
    build_category_tree,
    build_month_input,
    get_owned_category,
    get_owned_entry,
    list_entries_for_year,
    month_budget_actuals,
    validate_category_parent,
)
from app.modules.identity.dependencies import CurrentUser
from app.shared.currency import FxRateProvider, get_fx_provider
from app.shared.domain.budgeting import (
    compute_budget_variance,
    compute_month,
    compute_year,
)

router = APIRouter(prefix="/budgeting", tags=["budgeting"])

Session = Annotated[AsyncSession, Depends(get_session)]
Fx = Annotated[FxRateProvider, Depends(get_fx_provider)]


# ======================================================================
# Categories
# ======================================================================
@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category(payload: CategoryCreate, user: CurrentUser, session: Session):
    category = Category(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        position=payload.position,
        parent_id=payload.parent_id,
        color=payload.color,
        icon=payload.icon,
    )
    if await session.get(Category, category.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A category with this id already exists")
    await validate_category_parent(
        session, user.id, category_id=category.id, parent_id=category.parent_id, kind=category.kind
    )
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(user: CurrentUser, session: Session, include_deleted: bool = False):
    stmt = select(Category).where(Category.user_id == user.id)
    if not include_deleted:
        stmt = stmt.where(Category.deleted == False)  # noqa: E712
    stmt = stmt.order_by(Category.kind, Category.position)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/categories/tree", response_model=list[CategoryTreeNode])
async def category_tree(user: CurrentUser, session: Session):
    stmt = (
        select(Category)
        .where(Category.user_id == user.id, Category.deleted == False)  # noqa: E712
        .order_by(Category.kind, Category.position)
    )
    result = await session.execute(stmt)
    return build_category_tree(list(result.scalars().all()))


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: uuid.UUID, payload: CategoryUpdate, user: CurrentUser, session: Session
):
    category = await get_owned_category(session, user.id, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(category, key, value)
    # Validate the resulting parent link (kind must match the possibly-updated kind).
    if "parent_id" in data or "kind" in data:
        await validate_category_parent(
            session, user.id, category_id=category.id,
            parent_id=category.parent_id, kind=category.kind,
        )
    category.updated_at = utcnow()
    session.add(category)
    await session.commit()
    await session.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(category_id: uuid.UUID, user: CurrentUser, session: Session):
    category = await get_owned_category(session, user.id, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    # Soft-delete so offline clients can reconcile the tombstone (Stage 5).
    category.deleted = True
    category.updated_at = utcnow()
    session.add(category)
    await session.commit()


# ======================================================================
# Entries
# ======================================================================
@router.post("/entries", response_model=EntryRead, status_code=status.HTTP_201_CREATED)
async def create_entry(payload: EntryCreate, user: CurrentUser, session: Session):
    if payload.category_id is not None:
        # A referenced category must belong to this user.
        owned = await get_owned_category(session, user.id, payload.category_id)
        if owned is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")

    entry = Entry(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        year=payload.year,
        month=payload.month,
        kind=payload.kind,
        category_id=payload.category_id,
        label=payload.label,
        amount=payload.amount,
        currency=payload.currency.upper(),
    )
    if await session.get(Entry, entry.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An entry with this id already exists")
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.get("/entries", response_model=list[EntryRead])
async def list_entries(
    user: CurrentUser,
    session: Session,
    year: int | None = None,
    month: int | None = None,
    include_deleted: bool = False,
):
    stmt = select(Entry).where(Entry.user_id == user.id)
    if year is not None:
        stmt = stmt.where(Entry.year == year)
    if month is not None:
        stmt = stmt.where(Entry.month == month)
    if not include_deleted:
        stmt = stmt.where(Entry.deleted == False)  # noqa: E712
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.patch("/entries/{entry_id}", response_model=EntryRead)
async def update_entry(
    entry_id: uuid.UUID, payload: EntryUpdate, user: CurrentUser, session: Session
):
    entry = await get_owned_entry(session, user.id, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    data = payload.model_dump(exclude_unset=True)
    if data.get("category_id") is not None:
        owned = await get_owned_category(session, user.id, data["category_id"])
        if owned is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(entry, key, value)
    entry.updated_at = utcnow()
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: uuid.UUID, user: CurrentUser, session: Session):
    entry = await get_owned_entry(session, user.id, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    entry.deleted = True
    entry.updated_at = utcnow()
    session.add(entry)
    await session.commit()


# ======================================================================
# Summaries (delegate all arithmetic to the pure domain core)
# ======================================================================
def _month_summary(year: int, month: int, result) -> MonthSummary:
    return MonthSummary(
        year=year,
        month=month,
        income_total=result.income_total,
        extras_total=result.extras_total,
        fixed_total=result.fixed_total,
        variable_total=result.variable_total,
        expenses_total=result.expenses_total,
        goal=result.goal,
        can_spend=result.can_spend,
        end_of_month_savings=result.end_of_month_savings,
        remaining_to_spend=result.remaining_to_spend,
        met_goal=result.met_goal,
        overspend=result.overspend,
    )


@router.get("/summary/{year}/{month}", response_model=MonthSummary)
async def month_summary(year: int, month: int, user: CurrentUser, session: Session, fx: Fx):
    result = await session.execute(
        select(Entry).where(
            Entry.user_id == user.id,
            Entry.year == year,
            Entry.month == month,
            Entry.deleted == False,  # noqa: E712
        )
    )
    entries = list(result.scalars().all())
    month_input = await build_month_input(entries, user.default_currency, fx)
    computed = compute_month(month_input)
    return _month_summary(year, month, computed)


@router.get("/variance/{year}/{month}", response_model=BudgetVarianceSummary)
async def budget_variance(year: int, month: int, user: CurrentUser, session: Session):
    budgets, actuals = await month_budget_actuals(session, user.id, year, month)
    variance = compute_budget_variance(budgets, actuals)
    return BudgetVarianceSummary(
        year=year,
        month=month,
        budgeted_total=variance.budgeted_total,
        actual_total=variance.actual_total,
        remaining_total=variance.remaining_total,
        by_category=[
            CategoryVarianceRow(category_id=uuid.UUID(cid), **vars(row))
            for cid, row in variance.by_category.items()
        ],
    )


@router.get("/summary/{year}", response_model=YearSummary)
async def year_summary(year: int, user: CurrentUser, session: Session, fx: Fx):
    entries = await list_entries_for_year(session, user.id, year)
    by_month: list[list[Entry]] = [[] for _ in range(12)]
    for e in entries:
        if 0 <= e.month <= 11:
            by_month[e.month].append(e)

    month_inputs = [
        await build_month_input(m, user.default_currency, fx) for m in by_month
    ]
    computed = compute_year(month_inputs)
    return YearSummary(
        year=year,
        income_total=computed.income_total,
        goal_total=computed.goal_total,
        can_spend_total=computed.can_spend_total,
        expenses_total=computed.expenses_total,
        fixed_total=computed.fixed_total,
        variable_total=computed.variable_total,
        savings_total=computed.savings_total,
        nomina_total=computed.nomina_total,
        otros_total=computed.otros_total,
        per_month=[
            _month_summary(year, i, mr) for i, mr in enumerate(computed.per_month)
        ],
    )
