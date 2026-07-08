"""Unit-level coverage for the receipt-import pipeline's internals: draft
assembly, the DeepSeek request/response contract, the extraction context
query, and a real (not mocked) Tesseract smoke test.

`test_receipt_import_api.py` covers the HTTP/orchestration layer with fake
providers; this file covers the pieces those fakes stand in for.
"""

import io
import uuid

import httpx
import pytest
from PIL import Image, ImageDraw
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

import app.core.metadata  # noqa: F401 - registers every module's tables
from app.core.config import settings
from app.modules.budgeting.models import Category
from app.modules.merchants.models import Merchant
from app.modules.receipt_import import draft_builder, extraction_service
from app.modules.receipt_import.ai.base import (
    CategoryHint,
    ExtractionContext,
    MerchantHint,
    RawExtraction,
)
from app.modules.receipt_import.ai.deepseek_provider import DeepSeekProvider, ReceiptExtractionError
from app.modules.receipt_import.ai.prompts import build_user_prompt
from app.modules.receipt_import.ocr.tesseract_provider import TesseractOcrProvider

# --- draft_builder -------------------------------------------------------


def test_draft_builder_maps_semantic_matches() -> None:
    category_id = uuid.uuid4()
    merchant_id = uuid.uuid4()
    raw = RawExtraction(
        merchant_name="MERCADONA #12",
        possible_merchant_id=merchant_id,
        possible_category_id=category_id,
        total=20.0,
        currency="EUR",
        confidence={"possible_merchant_id": 0.8, "possible_category_id": 0.75, "total": 0.9},
    )
    draft = draft_builder.build(raw)

    assert draft.merchant.matched_merchant_id == merchant_id
    assert draft.merchant.match_type == "semantic"
    assert draft.category.matched_category_id == category_id
    assert draft.category.match_type == "ai_semantic"
    assert draft.amount.value == 20.0
    assert draft.amount.confidence == 0.9


def test_draft_builder_suggests_new_category_without_a_match() -> None:
    raw = RawExtraction(possible_category_name="Cafeterias", confidence={})
    draft = draft_builder.build(raw)

    assert draft.category.matched_category_id is None
    assert draft.category.suggested_name == "Cafeterias"
    assert draft.category.match_type == "suggest_new"


def test_draft_builder_reports_no_merchant_match_and_passes_through_warnings() -> None:
    raw = RawExtraction(
        merchant_name="Some Shop",
        warnings=["OCR text looked truncated"],
        missing_fields=["date"],
        confidence={"merchant_name": 0.4},
    )
    draft = draft_builder.build(raw)

    assert draft.merchant.match_type == "none"
    assert draft.merchant.suggested_name == "Some Shop"
    assert draft.warnings == ["OCR text looked truncated"]
    assert draft.missing_fields == ["date"]


def test_draft_builder_overall_confidence_averages_populated_fields() -> None:
    raw = RawExtraction(confidence={"total": 1.0, "currency": 0.5})
    draft = draft_builder.build(raw)
    assert draft.overall_confidence == 0.75


def test_draft_builder_zero_confidence_when_nothing_extracted() -> None:
    draft = draft_builder.build(RawExtraction())
    assert draft.overall_confidence == 0.0


# --- ai/prompts ------------------------------------------------------------


def test_build_user_prompt_includes_context_and_ocr_text() -> None:
    context = ExtractionContext(
        today="2026-07-08",
        default_currency="EUR",
        categories=[CategoryHint(id=uuid.uuid4(), name="Comida", kind="variable")],
        recent_merchants=[MerchantHint(id=uuid.uuid4(), name="Mercadona")],
    )
    prompt = build_user_prompt("SOME OCR TEXT", context)

    assert "SOME OCR TEXT" in prompt
    assert "Comida" in prompt
    assert "Mercadona" in prompt
    assert "2026-07-08" in prompt


# --- ai/deepseek_provider ----------------------------------------------------


async def test_deepseek_provider_parses_a_successful_response(monkeypatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(settings, "deepseek_model", "deepseek-chat")

    captured: dict = {}

    async def fake_post(self, url, headers=None, json=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        content = '{"merchant_name": "Test", "total": 9.5, "confidence": {"total": 0.9}}'
        body = {"choices": [{"message": {"content": content}}]}
        return httpx.Response(200, request=httpx.Request("POST", url), json=body)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    context = ExtractionContext(today="2026-07-08", default_currency="EUR")
    result = await DeepSeekProvider().extract("some ocr text", context)

    assert result.merchant_name == "Test"
    assert result.total == 9.5
    assert captured["url"] == f"{settings.deepseek_base_url}/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "deepseek-chat"
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert "some ocr text" in captured["json"]["messages"][1]["content"]


async def test_deepseek_provider_raises_on_unparseable_content(monkeypatch) -> None:
    async def fake_post(self, url, headers=None, json=None):
        body = {"choices": [{"message": {"content": "not json"}}]}
        return httpx.Response(200, request=httpx.Request("POST", url), json=body)

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    context = ExtractionContext(today="2026-07-08", default_currency="EUR")
    with pytest.raises(ReceiptExtractionError):
        await DeepSeekProvider().extract("some ocr text", context)


# --- ocr/tesseract_provider (real binary, no mocking) -----------------------


def _render_text_image(text: str) -> bytes:
    image = Image.new("RGB", (300, 60), color="white")
    ImageDraw.Draw(image).text((10, 20), text, fill="black")
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


async def test_tesseract_provider_reads_rendered_text() -> None:
    image_bytes = _render_text_image("MERCADONA TOTAL")
    text = await TesseractOcrProvider().extract_text([image_bytes], "image/png")
    assert "MERCADONA" in text.upper()


# --- extraction_service.build_context ---------------------------------------


@pytest.fixture
async def session():
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


async def test_build_context_scopes_categories_and_merchants_by_user(session) -> None:
    user_id = uuid.uuid4()
    other_user_id = uuid.uuid4()
    session.add(Category(user_id=user_id, name="Comida", kind="variable"))
    session.add(Category(user_id=user_id, name="Borrada", kind="variable", deleted=True))
    session.add(Category(user_id=other_user_id, name="Ajena", kind="variable"))
    session.add(Merchant(user_id=user_id, name="Mercadona"))
    session.add(Merchant(user_id=other_user_id, name="Otro"))
    await session.commit()

    context = await extraction_service.build_context(session, user_id, "EUR")

    assert [c.name for c in context.categories] == ["Comida"]
    assert [m.name for m in context.recent_merchants] == ["Mercadona"]
    assert context.default_currency == "EUR"
