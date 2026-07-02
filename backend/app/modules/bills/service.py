"""Query + materialization helpers for recurring rules.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function takes a `user_id` and filters by it. All recurrence arithmetic is
delegated to the framework-free domain core (`app.shared.domain.recurring`).
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.bills.models import RecurringRule
from app.modules.bills.schemas import UpcomingBill
from app.modules.transactions.models import Transaction
from app.shared.domain.recurring import Frequency, advance, occurrence_id, occurrences_between


async def get_owned_rule(
    session: AsyncSession, user_id: uuid.UUID, rule_id: uuid.UUID
) -> RecurringRule | None:
    rule = await session.get(RecurringRule, rule_id)
    if rule is None or rule.user_id != user_id:
        return None
    return rule


async def list_rules(
    session: AsyncSession, user_id: uuid.UUID, include_deleted: bool = False
) -> list[RecurringRule]:
    stmt = select(RecurringRule).where(RecurringRule.user_id == user_id)
    if not include_deleted:
        stmt = stmt.where(RecurringRule.deleted == False)  # noqa: E712
    stmt = stmt.order_by(RecurringRule.next_run)
    return list((await session.execute(stmt)).scalars().all())


def _bill_for(rule: RecurringRule, occ_date: date) -> UpcomingBill:
    return UpcomingBill(
        rule_id=rule.id,
        occurrence_id=occurrence_id(rule.id, occ_date),
        name=rule.name,
        type=rule.type,
        amount=rule.amount,
        currency=rule.currency,
        account_id=rule.account_id,
        category_id=rule.category_id,
        merchant_id=rule.merchant_id,
        date=occ_date,
    )


async def upcoming_bills(
    session: AsyncSession, user_id: uuid.UUID, horizon_days: int, today: date | None = None
) -> list[UpcomingBill]:
    """Projected occurrences (not persisted) across all active rules."""
    start = today or date.today()
    end = date.fromordinal(start.toordinal() + horizon_days)
    bills: list[UpcomingBill] = []
    for rule in await list_rules(session, user_id):
        dates = occurrences_between(
            rule.next_run, rule.frequency, rule.interval, start, end, rule.end_date
        )
        bills.extend(_bill_for(rule, d) for d in dates)
    bills.sort(key=lambda b: b.date)
    return bills


async def materialize_rule(
    session: AsyncSession, rule: RecurringRule, until: date
) -> int:
    """Create transactions for every occurrence from `next_run` through `until`.

    Uses a deterministic id per occurrence so re-running (or another device
    running) doesn't duplicate. Advances `next_run` past the last occurrence.
    Returns the number of newly-created transactions.
    """
    freq: Frequency = rule.frequency  # type: ignore[assignment]
    dates = occurrences_between(
        rule.next_run, freq, rule.interval, rule.next_run, until, rule.end_date
    )
    created = 0
    for occ_date in dates:
        tx_id = occurrence_id(rule.id, occ_date)
        if await session.get(Transaction, tx_id) is not None:
            continue  # already materialized (idempotent)
        session.add(
            Transaction(
                id=tx_id,
                user_id=rule.user_id,
                type=rule.type,
                amount=rule.amount,
                currency=rule.currency,
                account_id=rule.account_id,
                transfer_account_id=rule.transfer_account_id,
                merchant_id=rule.merchant_id,
                recurring_id=rule.id,
                category_id=rule.category_id,
                date=occ_date,
                notes=rule.notes,
                tags=[],
            )
        )
        created += 1

    if dates:
        rule.next_run = advance(dates[-1], freq, rule.interval)
    return created
