"""Prepares what the AI provider needs beyond the raw OCR text.

Building the `ExtractionContext` (the user's own categories and recently used
merchants) is inherent prep for the extraction call, not a pipeline stage in
its own right — see docs/receipt-import/02-technical-design.md §2. The actual
call to the AI provider happens in `pipeline.py`, directly against the
injected `ReceiptExtractionProvider`; there is no wrapper here for it, since a
one-line pass-through would only be indirection.
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.budgeting.models import Category
from app.modules.merchants.models import Merchant
from app.modules.receipt_import.ai.base import CategoryHint, ExtractionContext, MerchantHint

RECENT_MERCHANTS_LIMIT = 30


async def build_context(
    session: AsyncSession, user_id: uuid.UUID, default_currency: str
) -> ExtractionContext:
    categories = (
        await session.execute(
            select(Category).where(
                Category.user_id == user_id,
                Category.deleted == False,  # noqa: E712
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

    return ExtractionContext(
        today=date.today(),
        default_currency=default_currency,
        categories=[CategoryHint(id=c.id, name=c.name, kind=c.kind) for c in categories],
        recent_merchants=[MerchantHint(id=m.id, name=m.name) for m in merchants],
    )
