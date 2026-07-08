"""Builds the `DraftReceiptAnalysis` the frontend renders.

Merchant/category matching (Phases 4-5 of the brief) is owned by
`merchant_matching.py`/`category_matching.py`, not this file — this module
only assembles the primitive extracted fields (amount, date, currency, ...)
into `FieldValue`s and folds in the already-computed matches, per
docs/receipt-import/02-technical-design.md §4-6.
"""

from app.modules.receipt_import.ai.base import RawExtraction
from app.modules.receipt_import.schemas import (
    CategoryMatch,
    DraftReceiptAnalysis,
    FieldValue,
    MerchantMatch,
)


def build(
    raw: RawExtraction, merchant: MerchantMatch, category: CategoryMatch
) -> DraftReceiptAnalysis:
    confidence = raw.confidence

    def field(name: str, value: object) -> FieldValue:
        return FieldValue(value=value, confidence=confidence.get(name))

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
