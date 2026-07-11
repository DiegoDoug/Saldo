"""Bank-import pipeline orchestrator.

Loads the stored file text, calls the AI provider, reconciles the result
against the user's data, builds the draft and persists it. Runs via FastAPI
`BackgroundTasks` (scheduled in `router.py`), so it executes *after* the
request's own DB session has closed — it always opens its own session via
`app.core.db.async_session_maker`, exactly like `receipt_import/pipeline.py`
(whose docstring explains the ordering in detail).

It never resolves its own AI provider: `router.py` resolves it through
overridable FastAPI `Depends` and passes the instance in, so provider selection
stays testable through `app.dependency_overrides`.
"""

import uuid

from app.core import db as core_db
from app.modules.bank_import import context_service, draft_builder, storage
from app.modules.bank_import.ai.base import BankExtractionProvider
from app.modules.bank_import.models import BankImport
from app.modules.budgeting.models import utcnow
from app.modules.identity.models import User


async def run_bank_pipeline(
    import_id: uuid.UUID, ai_provider: BankExtractionProvider
) -> None:
    """Process one `BankImport` row: uploaded -> processing -> ready|failed."""
    async with core_db.async_session_maker() as session:
        row = await session.get(BankImport, import_id)
        if row is None:
            return

        row.status = "processing"
        row.updated_at = utcnow()
        session.add(row)
        await session.commit()

        try:
            file_text = storage.load_text(row.file_path)
            user = await session.get(User, row.user_id)
            default_currency = user.default_currency if user else "EUR"
            context = await context_service.build_context(session, row.user_id, default_currency)

            raw = await ai_provider.extract(file_text, context)
            draft = draft_builder.build(raw, context)

            row.ai_raw_response = raw.model_dump_json()
            row.draft_json = draft.model_dump_json()
            row.status = "ready"
        except Exception as exc:
            # Any failure lands the import in "failed" with a visible message —
            # never a half-built or fabricated draft.
            row.status = "failed"
            row.error_message = str(exc)[:500]

        row.updated_at = utcnow()
        session.add(row)
        await session.commit()
