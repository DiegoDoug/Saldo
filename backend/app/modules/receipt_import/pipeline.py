"""Receipt pipeline orchestrator.

Loads the stored image, runs OCR, calls the AI provider, matches a merchant
and category, builds the draft, and persists — each of those is its own
module (`storage`, `ocr/`, `ai/`, `merchant_matching`, `category_matching`,
`draft_builder`); this file only sequences them, per
docs/receipt-import/02-technical-design.md §1-2.

Runs via FastAPI `BackgroundTasks` (scheduled in `router.py`), which means it
executes *after* the request's own DB session has already been closed —
FastAPI closes yield-dependencies before running background tasks (verified
empirically against this project's pinned FastAPI version; the two run in the
opposite order to what the "0.106.0 changed this" folklore suggests). So this
function always opens its own session via `app.core.db.async_session_maker`
rather than reusing the request's.

It never resolves its own OCR/AI providers, either: `router.py` resolves them
through normal, overridable FastAPI `Depends` and passes the already-resolved
instances in, so provider selection stays testable through
`app.dependency_overrides` exactly like every other external-API dependency
in this codebase (see `shared/currency.py`'s `get_fx_provider`).

`router.py` only ever imports this module's `run_receipt_pipeline` plus
`storage.py` — never OCR/AI code directly.
"""

import uuid

from app.core import db as core_db
from app.modules.budgeting.models import utcnow
from app.modules.identity.models import User
from app.modules.receipt_import import (
    category_matching,
    draft_builder,
    extraction_service,
    merchant_matching,
    storage,
)
from app.modules.receipt_import.ai.base import ReceiptExtractionProvider
from app.modules.receipt_import.models import ReceiptImport
from app.modules.receipt_import.ocr.base import OcrProvider


async def run_receipt_pipeline(
    receipt_id: uuid.UUID,
    ocr_provider: OcrProvider,
    ai_provider: ReceiptExtractionProvider,
) -> None:
    """Process one `ReceiptImport` row: uploaded -> processing -> ready|failed."""
    async with core_db.async_session_maker() as session:
        receipt = await session.get(ReceiptImport, receipt_id)
        if receipt is None:
            return

        receipt.status = "processing"
        receipt.updated_at = utcnow()
        session.add(receipt)
        await session.commit()

        try:
            image_bytes = storage.load_image(receipt.image_path)
            ocr_text = await ocr_provider.extract_text([image_bytes], receipt.mime_type)

            user = await session.get(User, receipt.user_id)
            default_currency = user.default_currency if user else "EUR"
            context = await extraction_service.build_context(
                session, receipt.user_id, default_currency
            )
            raw = await ai_provider.extract(ocr_text, context)

            merchant_match = await merchant_matching.match(session, receipt.user_id, raw)
            category_match = await category_matching.match(
                session, receipt.user_id, raw, merchant_match
            )
            draft = draft_builder.build(raw, merchant_match, category_match)

            receipt.ocr_text = ocr_text
            receipt.ai_raw_response = raw.model_dump_json()
            receipt.draft_json = draft.model_dump_json()
            receipt.status = "ready"
        except Exception as exc:
            # Any pipeline failure lands the receipt in "failed" with a
            # message the user can see — never a half-built or fabricated
            # draft (the brief's "never fabricate" requirement, Document 5 §4).
            receipt.status = "failed"
            receipt.error_message = str(exc)[:500]

        receipt.updated_at = utcnow()
        session.add(receipt)
        await session.commit()
