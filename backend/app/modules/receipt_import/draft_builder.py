"""Builds the `DraftReceiptAnalysis` the frontend renders, from a raw extraction.

Stage 2 has no merchant/category *matching* yet — `merchant_matching.py` and
`category_matching.py` (Stage 3) add the exact/fuzzy/merchant-default/
existing-similarity tiers from docs/receipt-import/02-technical-design.md
§5-6. Until then, every draft's merchant/category reflect only what the AI
call itself proposed (an `ai_semantic`/`suggest_new` match against the
context it was given, or nothing). Wiring the real matchers in later is a
change to this file's inputs, not to the `DraftReceiptAnalysis` shape the
frontend already depends on.
"""

from app.modules.receipt_import.ai.base import RawExtraction
from app.modules.receipt_import.schemas import (
    CategoryMatch,
    DraftReceiptAnalysis,
    FieldValue,
    MerchantMatch,
)


def build(raw: RawExtraction) -> DraftReceiptAnalysis:
    confidence = raw.confidence

    def field(name: str, value: object) -> FieldValue:
        return FieldValue(value=value, confidence=confidence.get(name))

    category = _build_category(raw, confidence)
    merchant = _build_merchant(raw, confidence)

    populated = [v for v in confidence.values() if v is not None]
    overall_confidence = round(sum(populated) / len(populated), 2) if populated else 0.0

    return DraftReceiptAnalysis(
        merchant=merchant,
        category=category,
        amount=field("total", raw.total),
        currency=field("currency", raw.currency),
        date=field("date", raw.date),
        tax=field("tax", raw.tax),
        payment_method=field("payment_method", raw.payment_method),
        receipt_number=field("receipt_number", raw.receipt_number),
        address=field("address", raw.address),
        notes=field("notes", raw.notes),
        warnings=raw.warnings,
        missing_fields=raw.missing_fields,
        overall_confidence=overall_confidence,
    )


def _build_category(raw: RawExtraction, confidence: dict[str, float]) -> CategoryMatch:
    if raw.possible_category_id is not None:
        return CategoryMatch(
            matched_category_id=raw.possible_category_id,
            match_type="ai_semantic",
            confidence=confidence.get("possible_category_id", 0.5),
        )
    if raw.possible_category_name:
        return CategoryMatch(
            suggested_name=raw.possible_category_name,
            match_type="suggest_new",
            confidence=confidence.get("possible_category_name", 0.3),
        )
    return CategoryMatch(match_type="suggest_new", confidence=0.0)


def _build_merchant(raw: RawExtraction, confidence: dict[str, float]) -> MerchantMatch:
    if raw.possible_merchant_id is not None:
        return MerchantMatch(
            raw_text=raw.merchant_name,
            matched_merchant_id=raw.possible_merchant_id,
            match_type="semantic",
            confidence=confidence.get("possible_merchant_id", 0.5),
        )
    return MerchantMatch(
        raw_text=raw.merchant_name,
        suggested_name=raw.merchant_name,
        match_type="none",
        confidence=confidence.get("merchant_name", 0.0),
    )
