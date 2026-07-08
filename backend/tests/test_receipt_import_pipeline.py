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
from app.modules.receipt_import import (
    category_matching,
    draft_builder,
    extraction_service,
    merchant_matching,
)
from app.modules.receipt_import.ai.base import (
    CategoryHint,
    ExtractionContext,
    MerchantHint,
    RawExtraction,
)
from app.modules.receipt_import.ai.deepseek_provider import DeepSeekProvider, ReceiptExtractionError
from app.modules.receipt_import.ai.prompts import build_user_prompt
from app.modules.receipt_import.ocr.tesseract_provider import TesseractOcrProvider
from app.modules.receipt_import.schemas import CategoryMatch, MerchantMatch

# --- draft_builder -----------------------------------------------------------
# Merchant/category matching itself is exercised below (merchant_matching /
# category_matching sections); these tests only cover assembling the rest of
# the draft around already-computed match objects.


NO_MERCHANT_MATCH = MerchantMatch(match_type="none", confidence=0.0)
NO_CATEGORY_MATCH = CategoryMatch(match_type="suggest_new", confidence=0.0)


def test_draft_builder_fills_fields_and_folds_in_matches() -> None:
    merchant_match = MerchantMatch(
        raw_text="Test", matched_merchant_id=uuid.uuid4(), match_type="exact", confidence=0.97
    )
    category_match = CategoryMatch(
        matched_category_id=uuid.uuid4(), match_type="merchant_default", confidence=0.9
    )
    raw = RawExtraction(total=20.0, currency="EUR", confidence={"total": 0.9, "currency": 0.8})

    draft = draft_builder.build(raw, merchant_match, category_match)

    assert draft.merchant is merchant_match
    assert draft.category is category_match
    assert draft.amount.value == 20.0
    assert draft.amount.confidence == 0.9


def test_draft_builder_passes_through_warnings_and_missing_fields() -> None:
    raw = RawExtraction(
        warnings=["OCR text looked truncated"], missing_fields=["date"], confidence={}
    )
    draft = draft_builder.build(raw, NO_MERCHANT_MATCH, NO_CATEGORY_MATCH)

    assert draft.warnings == ["OCR text looked truncated"]
    assert draft.missing_fields == ["date"]


def test_draft_builder_overall_confidence_averages_populated_fields() -> None:
    raw = RawExtraction(confidence={"total": 1.0, "currency": 0.5})
    draft = draft_builder.build(raw, NO_MERCHANT_MATCH, NO_CATEGORY_MATCH)
    assert draft.overall_confidence == 0.75


def test_draft_builder_zero_confidence_when_nothing_extracted() -> None:
    draft = draft_builder.build(RawExtraction(), NO_MERCHANT_MATCH, NO_CATEGORY_MATCH)
    assert draft.overall_confidence == 0.0


# --- merchant_matching --------------------------------------------------------


async def test_merchant_matching_exact_normalized_match(session) -> None:
    user_id = uuid.uuid4()
    merchant = Merchant(user_id=user_id, name="Mercadona")
    session.add(merchant)
    await session.commit()

    result = await merchant_matching.match(
        session, user_id, RawExtraction(merchant_name="MERCADONA #12")
    )

    assert result.matched_merchant_id == merchant.id
    assert result.match_type == "exact"
    assert result.confidence >= 0.9


async def test_merchant_matching_fuzzy_match(session) -> None:
    user_id = uuid.uuid4()
    merchant = Merchant(user_id=user_id, name="Mercadona")
    session.add(merchant)
    await session.commit()

    result = await merchant_matching.match(
        session, user_id, RawExtraction(merchant_name="Mercadana")  # one-letter typo
    )

    assert result.matched_merchant_id == merchant.id
    assert result.match_type == "fuzzy"
    assert 0.0 < result.confidence < 0.97


async def test_merchant_matching_falls_back_to_ai_semantic_match(session) -> None:
    user_id = uuid.uuid4()
    # An unrelated merchant exists, but doesn't fuzzy-match — tiers 1-2 must
    # fail before the AI's own semantic guess (tier 3) is used.
    session.add(Merchant(user_id=user_id, name="Netflix"))
    await session.commit()
    semantic_id = uuid.uuid4()

    result = await merchant_matching.match(
        session,
        user_id,
        RawExtraction(
            merchant_name="AMZN Mktp US",
            possible_merchant_id=semantic_id,
            confidence={"possible_merchant_id": 0.6},
        ),
    )

    assert result.matched_merchant_id == semantic_id
    assert result.match_type == "semantic"
    assert result.confidence == 0.6


async def test_merchant_matching_no_match_proposes_new(session) -> None:
    result = await merchant_matching.match(
        session, uuid.uuid4(), RawExtraction(merchant_name="Some New Shop")
    )

    assert result.matched_merchant_id is None
    assert result.suggested_name == "Some New Shop"
    assert result.match_type == "none"


async def test_merchant_matching_no_merchant_name_at_all(session) -> None:
    result = await merchant_matching.match(session, uuid.uuid4(), RawExtraction())
    assert result.match_type == "none"
    assert result.confidence == 0.0


# --- category_matching ---------------------------------------------------------


async def test_category_matching_prefers_merchant_default(session) -> None:
    user_id = uuid.uuid4()
    category = Category(user_id=user_id, name="Comida", kind="variable")
    session.add(category)
    await session.commit()
    merchant = Merchant(user_id=user_id, name="Mercadona", category_id=category.id)
    session.add(merchant)
    await session.commit()

    merchant_match = MerchantMatch(
        matched_merchant_id=merchant.id, match_type="exact", confidence=0.97
    )
    result = await category_matching.match(session, user_id, RawExtraction(), merchant_match)

    assert result.matched_category_id == category.id
    assert result.match_type == "merchant_default"
    assert result.confidence == 0.97


async def test_category_matching_existing_similarity_without_a_merchant(session) -> None:
    user_id = uuid.uuid4()
    category = Category(user_id=user_id, name="Cafeterias", kind="variable")
    session.add(category)
    await session.commit()

    result = await category_matching.match(
        session, user_id, RawExtraction(possible_category_name="Cafeteria"), NO_MERCHANT_MATCH
    )

    assert result.matched_category_id == category.id
    assert result.match_type == "existing_similarity"


async def test_category_matching_ignores_income_categories(session) -> None:
    user_id = uuid.uuid4()
    session.add(Category(user_id=user_id, name="Nomina", kind="income"))
    await session.commit()

    result = await category_matching.match(
        session, user_id, RawExtraction(possible_category_name="Nomina"), NO_MERCHANT_MATCH
    )

    assert result.matched_category_id is None


async def test_category_matching_falls_back_to_ai_semantic(session) -> None:
    category_id = uuid.uuid4()
    result = await category_matching.match(
        session,
        uuid.uuid4(),
        RawExtraction(possible_category_id=category_id, confidence={"possible_category_id": 0.6}),
        NO_MERCHANT_MATCH,
    )

    assert result.matched_category_id == category_id
    assert result.match_type == "ai_semantic"


async def test_category_matching_suggests_new_when_nothing_matches(session) -> None:
    result = await category_matching.match(
        session, uuid.uuid4(), RawExtraction(possible_category_name="Buceo"), NO_MERCHANT_MATCH
    )

    assert result.matched_category_id is None
    assert result.suggested_name == "Buceo"
    assert result.match_type == "suggest_new"


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
