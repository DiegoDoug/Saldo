"""Merchant intelligence (Phase 4 of the brief).

Priority order, scoped to the authenticated user's own merchants only:

1. Exact normalized match — never creates a duplicate merchant when
   confidence is high.
2. Fuzzy match (`rapidfuzz`) — returned above `FUZZY_SUGGEST_THRESHOLD`, with
   confidence scaled directly from the match score. A middling score lands
   below the review screen's confidence threshold (Document 2 §7) and is
   presented there as "did you mean X?" rather than a fait accompli
   (Document 6 §2) — there's no separate backend-side "auto" band, the
   existing confidence system already does that job.
3. Semantic match — not computed here. DeepSeek is given the user's recent
   merchants in the same extraction call (`ai/prompts.py`) and may return
   `possible_merchant_id` directly; this tier just reads that field when
   tiers 1-2 found nothing.
4. No match — the draft proposes creating a new merchant from the raw
   extracted name; nothing is ever created here.

See docs/receipt-import/02-technical-design.md §5.
"""

import re
import unicodedata
import uuid

from rapidfuzz import fuzz
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.merchants.service import list_merchants
from app.modules.receipt_import.ai.base import RawExtraction
from app.modules.receipt_import.schemas import MerchantMatch

FUZZY_SUGGEST_THRESHOLD = 65

_STORE_NUMBER = re.compile(r"#\s*\d+\b")
_LEGAL_SUFFIX = re.compile(
    r"\b(s\.?a\.?(\s+de\s+c\.?v\.?)?|s\.?l\.?|s\.?a\.?p\.?i\.?|llc|inc|ltd|corp)\.?\b"
)
_NON_WORD = re.compile(r"[^\w\s]")
_WHITESPACE = re.compile(r"\s+")


def normalize_merchant_name(name: str) -> str:
    """Lowercase, strip diacritics/punctuation/store numbers/legal suffixes."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    text = _STORE_NUMBER.sub("", text)
    text = _LEGAL_SUFFIX.sub("", text)
    text = _NON_WORD.sub(" ", text)
    return _WHITESPACE.sub(" ", text).strip()


async def match(session: AsyncSession, user_id: uuid.UUID, raw: RawExtraction) -> MerchantMatch:
    if not raw.merchant_name:
        return MerchantMatch(match_type="none", confidence=0.0)

    target = normalize_merchant_name(raw.merchant_name)
    merchants = await list_merchants(session, user_id)

    for merchant in merchants:
        if normalize_merchant_name(merchant.name) == target:
            return MerchantMatch(
                raw_text=raw.merchant_name,
                matched_merchant_id=merchant.id,
                match_type="exact",
                confidence=0.97,
            )

    best_id: uuid.UUID | None = None
    best_score = 0.0
    for merchant in merchants:
        score = fuzz.WRatio(normalize_merchant_name(merchant.name), target)
        if score > best_score:
            best_id, best_score = merchant.id, score
    if best_id is not None and best_score >= FUZZY_SUGGEST_THRESHOLD:
        return MerchantMatch(
            raw_text=raw.merchant_name,
            matched_merchant_id=best_id,
            match_type="fuzzy",
            confidence=round(min(best_score / 100, 0.95), 2),
        )

    if raw.possible_merchant_id is not None:
        return MerchantMatch(
            raw_text=raw.merchant_name,
            matched_merchant_id=raw.possible_merchant_id,
            match_type="semantic",
            confidence=raw.confidence.get("possible_merchant_id", 0.5),
        )

    return MerchantMatch(
        raw_text=raw.merchant_name,
        suggested_name=raw.merchant_name,
        match_type="none",
        confidence=raw.confidence.get("merchant_name", 0.0),
    )
