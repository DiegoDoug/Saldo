"""Category intelligence (Phase 5 of the brief).

Priority order, mirroring the brief exactly:

1. Merchant default category — if `merchant_matching.py` found a merchant and
   it has a default `category_id`, use it directly. Confidence is tied to the
   merchant match's own confidence: a shaky merchant guess makes its inherited
   category just as shaky.
2. Existing category similarity — fuzzy match between the AI's free-text
   `possible_category_name` guess and the user's own expense categories
   (income categories are never a receipt's category).
3. AI semantic selection — DeepSeek was given the user's category list in the
   same extraction call (`ai/prompts.py`) and may return `possible_category_id`
   directly; this tier reads that field when 1-2 found nothing.
4. Suggest new category — only when nothing above matched. Never created
   here; the review screen requires an explicit "create category" action
   from the user (Document 6 §2).

See docs/receipt-import/02-technical-design.md §6.
"""

import uuid

from rapidfuzz import fuzz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.budgeting.models import Category
from app.modules.merchants.service import get_owned_merchant
from app.modules.receipt_import.ai.base import RawExtraction
from app.modules.receipt_import.schemas import CategoryMatch, MerchantMatch

FUZZY_SUGGEST_THRESHOLD = 70

# Receipts are always spending, so income categories are never a candidate.
EXPENSE_KINDS = ("fixed", "variable")


async def match(
    session: AsyncSession,
    user_id: uuid.UUID,
    raw: RawExtraction,
    merchant_match: MerchantMatch,
) -> CategoryMatch:
    if merchant_match.matched_merchant_id is not None:
        merchant = await get_owned_merchant(session, user_id, merchant_match.matched_merchant_id)
        if merchant is not None and merchant.category_id is not None:
            return CategoryMatch(
                matched_category_id=merchant.category_id,
                match_type="merchant_default",
                confidence=merchant_match.confidence,
            )

    if raw.possible_category_name:
        stmt = select(Category).where(
            Category.user_id == user_id,
            Category.deleted == False,  # noqa: E712
            Category.kind.in_(EXPENSE_KINDS),
        )
        categories = (await session.execute(stmt)).scalars().all()
        target = raw.possible_category_name.strip().lower()

        best_id: uuid.UUID | None = None
        best_score = 0.0
        for category in categories:
            score = fuzz.WRatio(category.name.lower(), target)
            if score > best_score:
                best_id, best_score = category.id, score
        if best_id is not None and best_score >= FUZZY_SUGGEST_THRESHOLD:
            return CategoryMatch(
                matched_category_id=best_id,
                match_type="existing_similarity",
                confidence=round(min(best_score / 100, 0.9), 2),
            )

    if raw.possible_category_id is not None:
        return CategoryMatch(
            matched_category_id=raw.possible_category_id,
            match_type="ai_semantic",
            confidence=raw.confidence.get("possible_category_id", 0.5),
        )

    if raw.possible_category_name:
        return CategoryMatch(
            suggested_name=raw.possible_category_name,
            match_type="suggest_new",
            confidence=raw.confidence.get("possible_category_name", 0.3),
        )

    return CategoryMatch(match_type="suggest_new", confidence=0.0)
