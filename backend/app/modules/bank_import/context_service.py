"""Prepares what the AI provider needs beyond the raw file text.

Building the `BankExtractionContext` (the user's own accounts, categories,
merchants and tags) is inherent prep for the extraction call, not a pipeline
stage in its own right — same reasoning as `receipt_import/extraction_service.py`.
The actual call to the AI provider happens in `pipeline.py`.
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.accounts.models import Account
from app.modules.bank_import.ai.base import (
    AccountHint,
    BankExtractionContext,
    CategoryHint,
    MerchantHint,
    TagHint,
)
from app.modules.budgeting.models import Category
from app.modules.merchants.models import Merchant
from app.modules.tags.models import Tag

RECENT_MERCHANTS_LIMIT = 60


async def build_context(
    session: AsyncSession, user_id: uuid.UUID, default_currency: str
) -> BankExtractionContext:
    accounts = (
        await session.execute(
            select(Account).where(Account.user_id == user_id, Account.deleted == False)  # noqa: E712
        )
    ).scalars().all()
    categories = (
        await session.execute(
            select(Category).where(
                Category.user_id == user_id, Category.deleted == False  # noqa: E712
            )
        )
    ).scalars().all()
    merchants = (
        await session.execute(
            select(Merchant)
            .where(Merchant.user_id == user_id, Merchant.deleted == False)  # noqa: E712
            .order_by(Merchant.updated_at.desc())
            .limit(RECENT_MERCHANTS_LIMIT)
        )
    ).scalars().all()
    tags = (
        await session.execute(
            select(Tag).where(Tag.user_id == user_id, Tag.deleted == False)  # noqa: E712
        )
    ).scalars().all()

    return BankExtractionContext(
        today=date.today(),
        default_currency=default_currency,
        accounts=[
            AccountHint(id=a.id, name=a.name, currency=a.currency, type=a.type) for a in accounts
        ],
        categories=[CategoryHint(id=c.id, name=c.name, kind=c.kind) for c in categories],
        merchants=[MerchantHint(id=m.id, name=m.name) for m in merchants],
        tags=[TagHint(name=t.name) for t in tags],
    )
