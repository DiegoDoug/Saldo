"""Receipt pipeline orchestrator.

**Stage 1 stub.** No OCR or AI provider exists yet — Stage 2 replaces the body
of `run_receipt_pipeline` with the real OCR -> DeepSeek -> merchant/category
matching sequence from docs/receipt-import/02-technical-design.md §2, running
in a background task. This stub proves the upload/status/confirm/discard
lifecycle end-to-end against a fixed, always-low-confidence draft before any
external API is involved.

`router.py` only ever calls this module's `run_receipt_pipeline` (plus
`storage.py` directly for the raw image) — it never imports OCR/AI code. That
stays true after Stage 2 lands; only this file's internals change.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.budgeting.models import utcnow
from app.modules.receipt_import.models import ReceiptImport
from app.modules.receipt_import.schemas import (
    CategoryMatch,
    DraftReceiptAnalysis,
    FieldValue,
    MerchantMatch,
)


async def run_receipt_pipeline(session: AsyncSession, receipt_id: uuid.UUID) -> None:
    """Process one `ReceiptImport` row in place: uploaded -> processing -> ready|failed."""
    receipt = await session.get(ReceiptImport, receipt_id)
    if receipt is None:
        return

    receipt.status = "processing"
    receipt.updated_at = utcnow()
    session.add(receipt)
    await session.commit()

    draft = _stub_draft()
    receipt.draft_json = draft.model_dump_json()
    receipt.status = "ready"
    receipt.updated_at = utcnow()
    session.add(receipt)
    await session.commit()


def _stub_draft() -> DraftReceiptAnalysis:
    """Fixed placeholder draft, replaced in Stage 2 by real extraction + matching."""
    return DraftReceiptAnalysis(
        merchant=MerchantMatch(match_type="none", confidence=0.0),
        category=CategoryMatch(match_type="suggest_new", confidence=0.0),
        amount=FieldValue(value=None, confidence=0.0),
        currency=FieldValue(value=None, confidence=0.0),
        date=FieldValue(value=None, confidence=0.0),
        warnings=["El pipeline de OCR/IA aún no está implementado (Stage 1)."],
        missing_fields=["merchant", "amount", "currency", "date"],
        overall_confidence=0.0,
    )
