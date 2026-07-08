"""Receipt-import HTTP endpoints.

Every route depends on `CurrentUser` and scopes queries by `user.id`, same
convention as every other module. This router resolves the OCR/AI providers
through normal FastAPI `Depends` (so tests can substitute fakes via
`app.dependency_overrides`, same as `shared/currency.py`'s `get_fx_provider`)
and hands the already-resolved instances to `pipeline.run_receipt_pipeline` —
it never imports OCR/AI *implementation* code itself (see
docs/receipt-import/02-technical-design.md §1).

Upload schedules the pipeline via `BackgroundTasks` rather than awaiting it
inline: OCR + an LLM call take real time, and the request shouldn't block on
either. `pipeline.py`'s own docstring explains why it opens its own DB session
rather than reusing this request's.

The AI pipeline never writes a Transaction/Merchant/Category. `confirm` only
records that a receipt produced a given (client-generated) transaction id for
history/linking — the actual ledger write happens client-side in Dexie, the
same way every manually entered transaction is created. See
docs/receipt-import/03-backend-api-design.md.
"""

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser
from app.modules.receipt_import import storage
from app.modules.receipt_import.ai.base import ReceiptExtractionProvider
from app.modules.receipt_import.ai.dependency import get_ai_provider
from app.modules.receipt_import.models import ReceiptImport
from app.modules.receipt_import.ocr.base import OcrProvider
from app.modules.receipt_import.ocr.dependency import get_ocr_provider
from app.modules.receipt_import.pipeline import run_receipt_pipeline
from app.modules.receipt_import.schemas import (
    ConfirmReceiptRequest,
    DraftPatch,
    DraftReceiptAnalysis,
    ReceiptImportPage,
    ReceiptImportRead,
)
from app.modules.receipt_import.service import (
    find_by_content_hash,
    get_owned_receipt,
    list_receipts,
)

router = APIRouter(prefix="/receipt-imports", tags=["receipt-imports"])

Session = Annotated[AsyncSession, Depends(get_session)]
OcrDep = Annotated[OcrProvider, Depends(get_ocr_provider)]
AiDep = Annotated[ReceiptExtractionProvider, Depends(get_ai_provider)]


def _to_read(
    receipt: ReceiptImport, *, duplicate_of: uuid.UUID | None = None
) -> ReceiptImportRead:
    draft = (
        DraftReceiptAnalysis.model_validate_json(receipt.draft_json)
        if receipt.draft_json
        else None
    )
    return ReceiptImportRead(
        id=receipt.id,
        status=receipt.status,
        draft=draft,
        error_message=receipt.error_message,
        duplicate_of=duplicate_of,
        linked_transaction_id=receipt.linked_transaction_id,
        created_at=receipt.created_at,
    )


@router.post("", response_model=ReceiptImportRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_receipt(
    user: CurrentUser,
    session: Session,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    ocr_provider: OcrDep,
    ai_provider: AiDep,
):
    if not settings.deepseek_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Receipt import is not configured on this server"
        )

    if file.content_type not in storage.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unsupported image type: {file.content_type}"
        )

    data = await file.read()
    max_bytes = settings.receipt_max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Image exceeds the {settings.receipt_max_upload_mb}MB upload limit",
        )

    content_hash = storage.hash_bytes(data)
    existing = await find_by_content_hash(session, user.id, content_hash)
    if existing is not None:
        return _to_read(existing, duplicate_of=existing.id)

    relative_path, content_hash = storage.save_image(user.id, data, file.content_type)
    receipt = ReceiptImport(
        user_id=user.id,
        content_hash=content_hash,
        image_path=relative_path,
        mime_type=file.content_type,
        status="processing",
    )
    session.add(receipt)
    await session.commit()
    await session.refresh(receipt)

    # Runs after this response has already been sent (see `pipeline.py`'s
    # docstring) — the client learns the outcome via GET /receipt-imports/{id}
    # polling, not from this response body.
    background_tasks.add_task(run_receipt_pipeline, receipt.id, ocr_provider, ai_provider)
    return _to_read(receipt)


@router.get("", response_model=ReceiptImportPage)
async def get_receipts(
    user: CurrentUser,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = await list_receipts(session, user.id, limit, offset)
    return ReceiptImportPage(
        items=[_to_read(r) for r in items], total=total, limit=limit, offset=offset
    )


@router.get("/{receipt_id}", response_model=ReceiptImportRead)
async def get_receipt(receipt_id: uuid.UUID, user: CurrentUser, session: Session):
    receipt = await get_owned_receipt(session, user.id, receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt import not found")
    return _to_read(receipt)


@router.get("/{receipt_id}/image")
async def get_receipt_image(receipt_id: uuid.UUID, user: CurrentUser, session: Session):
    receipt = await get_owned_receipt(session, user.id, receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt import not found")
    try:
        data = storage.load_image(receipt.image_path)
    except FileNotFoundError as exc:
        # Discarded receipts have their image deleted from disk (see
        # `discard_receipt`) but keep the row for history — treat a missing
        # file the same as a missing receipt rather than a server error.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt image not found") from exc
    return Response(content=data, media_type=receipt.mime_type)


@router.patch("/{receipt_id}/draft", response_model=ReceiptImportRead)
async def patch_receipt_draft(
    receipt_id: uuid.UUID, payload: DraftPatch, user: CurrentUser, session: Session
):
    receipt = await get_owned_receipt(session, user.id, receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt import not found")
    if receipt.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Draft can only be edited while ready")

    current = json.loads(receipt.draft_json) if receipt.draft_json else {}
    updates = payload.model_dump(exclude_unset=True, exclude_none=True)
    current.update(updates)
    receipt.draft_json = DraftReceiptAnalysis.model_validate(current).model_dump_json()
    receipt.updated_at = utcnow()
    session.add(receipt)
    await session.commit()
    await session.refresh(receipt)
    return _to_read(receipt)


@router.post("/{receipt_id}/confirm", response_model=ReceiptImportRead)
async def confirm_receipt(
    receipt_id: uuid.UUID, payload: ConfirmReceiptRequest, user: CurrentUser, session: Session
):
    receipt = await get_owned_receipt(session, user.id, receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt import not found")
    if receipt.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a ready receipt can be confirmed")

    receipt.status = "confirmed"
    receipt.linked_transaction_id = payload.transaction_id
    receipt.updated_at = utcnow()
    session.add(receipt)
    await session.commit()
    await session.refresh(receipt)
    return _to_read(receipt)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_receipt(receipt_id: uuid.UUID, user: CurrentUser, session: Session):
    receipt = await get_owned_receipt(session, user.id, receipt_id)
    if receipt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Receipt import not found")
    storage.delete_image(receipt.image_path)
    receipt.status = "discarded"
    receipt.updated_at = utcnow()
    session.add(receipt)
    await session.commit()
