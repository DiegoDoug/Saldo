"""Recurring rules / bills HTTP endpoints.

CRUD under `/recurring`, the projection feed under `/bills/upcoming`, and
`/recurring/{id}/materialize` to generate due transactions. Every route depends
on `CurrentUser` and scopes queries by `user.id`; referenced accounts/categories/
merchants must belong to the caller.
"""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.accounts.service import get_owned_account
from app.modules.bills.models import RecurringRule
from app.modules.bills.schemas import (
    MaterializeResponse,
    RecurringRuleCreate,
    RecurringRuleRead,
    RecurringRuleUpdate,
    UpcomingBill,
)
from app.modules.bills.service import (
    get_owned_rule,
    list_rules,
    materialize_rule,
    upcoming_bills,
)
from app.modules.budgeting.models import utcnow
from app.modules.budgeting.service import get_owned_category
from app.modules.identity.dependencies import CurrentUser
from app.modules.merchants.service import get_owned_merchant

router = APIRouter(tags=["bills"])

Session = Annotated[AsyncSession, Depends(get_session)]


async def _validate_refs(session: AsyncSession, user_id: uuid.UUID, data: dict) -> None:
    for field in ("account_id", "transfer_account_id"):
        aid = data.get(field)
        if aid is not None and await get_owned_account(session, user_id, aid) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown account for {field}")
    cid = data.get("category_id")
    if cid is not None and await get_owned_category(session, user_id, cid) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category for this user")
    mid = data.get("merchant_id")
    if mid is not None and await get_owned_merchant(session, user_id, mid) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown merchant for this user")


@router.post("/recurring", response_model=RecurringRuleRead, status_code=status.HTTP_201_CREATED)
async def create_rule(payload: RecurringRuleCreate, user: CurrentUser, session: Session):
    await _validate_refs(session, user.id, payload.model_dump())
    rule = RecurringRule(
        id=payload.id or uuid.uuid4(),
        user_id=user.id,
        name=payload.name,
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency.upper(),
        account_id=payload.account_id,
        transfer_account_id=payload.transfer_account_id,
        merchant_id=payload.merchant_id,
        category_id=payload.category_id,
        notes=payload.notes,
        frequency=payload.frequency,
        interval=payload.interval,
        start_date=payload.start_date,
        end_date=payload.end_date,
        next_run=payload.next_run or payload.start_date,
        auto_generate=payload.auto_generate,
    )
    if await session.get(RecurringRule, rule.id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A rule with this id already exists")
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.get("/recurring", response_model=list[RecurringRuleRead])
async def get_rules(user: CurrentUser, session: Session, include_deleted: bool = False):
    return await list_rules(session, user.id, include_deleted)


@router.get("/bills/upcoming", response_model=list[UpcomingBill])
async def get_upcoming(
    user: CurrentUser,
    session: Session,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    return await upcoming_bills(session, user.id, days)


@router.get("/recurring/{rule_id}", response_model=RecurringRuleRead)
async def get_rule(rule_id: uuid.UUID, user: CurrentUser, session: Session):
    rule = await get_owned_rule(session, user.id, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    return rule


@router.patch("/recurring/{rule_id}", response_model=RecurringRuleRead)
async def update_rule(
    rule_id: uuid.UUID, payload: RecurringRuleUpdate, user: CurrentUser, session: Session
):
    rule = await get_owned_rule(session, user.id, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    data = payload.model_dump(exclude_unset=True)
    await _validate_refs(session, user.id, data)
    if "currency" in data and data["currency"] is not None:
        data["currency"] = data["currency"].upper()
    for key, value in data.items():
        setattr(rule, key, value)
    rule.updated_at = utcnow()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@router.delete("/recurring/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, user: CurrentUser, session: Session):
    rule = await get_owned_rule(session, user.id, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    rule.deleted = True
    rule.updated_at = utcnow()
    session.add(rule)
    await session.commit()


@router.post("/recurring/{rule_id}/materialize", response_model=MaterializeResponse)
async def materialize(
    rule_id: uuid.UUID,
    user: CurrentUser,
    session: Session,
    until: str | None = None,
):
    rule = await get_owned_rule(session, user.id, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    until_date = date.fromisoformat(until) if until else date.today()
    created = await materialize_rule(session, rule, until_date)
    rule.updated_at = utcnow()
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return MaterializeResponse(created=created, next_run=rule.next_run)
