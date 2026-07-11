"""Bank-import HTTP endpoints.

Every route depends on `CurrentUser` and scopes queries by `user.id`, same
convention as every other module. The AI provider is resolved through normal
FastAPI `Depends` (so tests can substitute a fake via `app.dependency_overrides`)
and handed to `pipeline.run_bank_pipeline` — this router never imports AI
*implementation* code itself.

Upload schedules the pipeline via `BackgroundTasks` rather than awaiting it
inline: an LLM call over a whole statement takes real time and the request
shouldn't block on it. The client learns the outcome by polling
`GET /bank-imports/{id}` (which is what drives the progress bar in the UI).

The pipeline never writes a Transaction/Account/Category/Merchant/Tag. `confirm`
only records how many transactions the import produced — the actual ledger
writes happen client-side in Dexie, the same way every manual entry is created.
"""

import json
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.modules.bank_import import storage
from app.modules.bank_import.ai.base import BankExtractionProvider
from app.modules.bank_import.ai.dependency import get_bank_ai_provider
from app.modules.bank_import.models import BankImport
from app.modules.bank_import.pipeline import run_bank_pipeline
from app.modules.bank_import.schemas import (
    BankImportPage,
    BankImportRead,
    ConfirmBankRequest,
    DraftBankAnalysis,
    DraftPatch,
)
from app.modules.bank_import.service import (
    find_by_content_hash,
    get_owned_import,
    list_imports,
)
from app.modules.budgeting.models import utcnow
from app.modules.identity.dependencies import CurrentUser

router = APIRouter(prefix="/bank-imports", tags=["bank-imports"])

Session = Annotated[AsyncSession, Depends(get_session)]
AiDep = Annotated[BankExtractionProvider, Depends(get_bank_ai_provider)]


def _to_read(row: BankImport, *, duplicate_of: uuid.UUID | None = None) -> BankImportRead:
    draft = (
        DraftBankAnalysis.model_validate_json(row.draft_json) if row.draft_json else None
    )
    return BankImportRead(
        id=row.id,
        status=row.status,
        file_name=row.file_name,
        draft=draft,
        error_message=row.error_message,
        duplicate_of=duplicate_of,
        created_transaction_count=row.created_transaction_count,
        created_at=row.created_at,
    )


@router.post("", response_model=BankImportRead, status_code=status.HTTP_202_ACCEPTED)
async def upload_bank_file(
    user: CurrentUser,
    session: Session,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    ai_provider: AiDep,
):
    if not settings.deepseek_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Bank import is not configured on this server"
        )
    if file.content_type not in storage.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Unsupported file type: {file.content_type}"
        )

    data = await file.read()
    max_bytes = settings.bank_max_upload_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"File exceeds the {settings.bank_max_upload_mb}MB upload limit",
        )
    if not data.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The file is empty")

    content_hash = storage.hash_bytes(data)
    existing = await find_by_content_hash(session, user.id, content_hash)
    if existing is not None:
        return _to_read(existing, duplicate_of=existing.id)

    relative_path, content_hash = storage.save_file(user.id, data, file.content_type)
    row = BankImport(
        user_id=user.id,
        content_hash=content_hash,
        file_name=file.filename or "statement",
        file_path=relative_path,
        mime_type=file.content_type,
        status="processing",
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)

    background_tasks.add_task(run_bank_pipeline, row.id, ai_provider)
    return _to_read(row)


@router.get("", response_model=BankImportPage)
async def get_imports(
    user: CurrentUser,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    items, total = await list_imports(session, user.id, limit, offset)
    return BankImportPage(
        items=[_to_read(r) for r in items], total=total, limit=limit, offset=offset
    )


@router.get("/{import_id}", response_model=BankImportRead)
async def get_import(import_id: uuid.UUID, user: CurrentUser, session: Session):
    row = await get_owned_import(session, user.id, import_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank import not found")
    return _to_read(row)


@router.patch("/{import_id}/draft", response_model=BankImportRead)
async def patch_import_draft(
    import_id: uuid.UUID, payload: DraftPatch, user: CurrentUser, session: Session
):
    row = await get_owned_import(session, user.id, import_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank import not found")
    if row.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Draft can only be edited while ready")

    current = json.loads(row.draft_json) if row.draft_json else {}
    current["movements"] = [m.model_dump(mode="json") for m in payload.movements]
    row.draft_json = DraftBankAnalysis.model_validate(current).model_dump_json()
    row.updated_at = utcnow()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_read(row)


@router.post("/{import_id}/confirm", response_model=BankImportRead)
async def confirm_import(
    import_id: uuid.UUID, payload: ConfirmBankRequest, user: CurrentUser, session: Session
):
    row = await get_owned_import(session, user.id, import_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank import not found")
    if row.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a ready import can be confirmed")

    row.status = "confirmed"
    row.created_transaction_count = payload.transaction_count
    row.updated_at = utcnow()
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_read(row)


@router.delete("/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_import(import_id: uuid.UUID, user: CurrentUser, session: Session):
    row = await get_owned_import(session, user.id, import_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bank import not found")
    storage.delete_file(row.file_path)
    row.status = "discarded"
    row.updated_at = utcnow()
    session.add(row)
    await session.commit()
