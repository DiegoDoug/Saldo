# Receipt Import — Document 5: AI Integration Design

**Status:** Complete — builds on Document 4. **Contains one open decision for sign-off before implementation (§3).**

---

## 1. Provider abstraction — LLM

`backend/app/modules/receipt_import/ai/base.py`:

```python
class RawExtraction(BaseModel):
    merchant_name: str | None
    date: str | None            # ISO 8601, model resolves relative/ambiguous dates
    currency: str | None        # ISO 4217
    total: float | None
    tax: float | None
    payment_method: str | None
    address: str | None
    receipt_number: str | None
    possible_category_id: uuid.UUID | None   # if the model picked one of the offered existing categories
    possible_category_name: str | None        # if it's suggesting a new one instead
    possible_merchant_id: uuid.UUID | None    # semantic match against offered existing merchants
    notes: str | None
    confidence: dict[str, float]              # per source field name above, 0..1
    warnings: list[str]
    missing_fields: list[str]

class ReceiptExtractionProvider(Protocol):
    async def extract(self, ocr_text: str, context: ExtractionContext) -> RawExtraction: ...

class ExtractionContext(BaseModel):
    today: date
    default_currency: str
    categories: list[CategoryHint]   # id, name, kind — top N, or all if the user has few
    recent_merchants: list[MerchantHint]  # id, name — most frequent/recent N
```

`business logic (extraction_service.py, merchant_matching.py, category_matching.py) depends only on `ReceiptExtractionProvider` and `RawExtraction` — never on DeepSeek's request/response shape.** Adding OpenAI/Gemini/Claude/a local model later is a new file implementing the same `Protocol`, plus one line in `get_ai_provider()`'s dispatch — no changes to any file above it in the pipeline.

`ai/deepseek_provider.py` implements it via `httpx.AsyncClient` against DeepSeek's OpenAI-compatible chat completions endpoint, `response_format={"type": "json_object"}`, `temperature=0.1`. This is the only file in the codebase that knows DeepSeek's API shape.

`ai/dependency.py`:

```python
def get_ai_provider(settings: Settings = Depends(get_settings)) -> ReceiptExtractionProvider:
    match settings.ai_provider:  # SALDO_AI_PROVIDER, default "deepseek"
        case "deepseek":
            return DeepSeekProvider(api_key=settings.deepseek_api_key, ...)
        case other:
            raise ValueError(f"Unknown AI provider: {other}")
```

Same `get_*_provider()` DI shape as `shared/currency.py`'s `get_fx_provider()`, overridable in tests with a fake provider that returns a fixed `RawExtraction` — the entire pipeline is testable with zero real API calls (important, since CI shouldn't spend DeepSeek credits per run).

## 2. Config, and honoring the project's own "off by default" stance

`core/config.py`, mirroring `resend_api_key`/`email_enabled` exactly:

```python
deepseek_api_key: str = ""
deepseek_model: str = "deepseek-chat"
deepseek_base_url: str = "https://api.deepseek.com"
ai_provider: str = "deepseek"

@property
def deepseek_enabled(self) -> bool:
    return bool(self.deepseek_api_key)
```

If `deepseek_enabled` is `False`, `POST /receipt-imports` returns `503` with a clear message, and the frontend hides the "Escanear recibo" entry point entirely (surfaced via the existing pattern of feature-flag-by-config, checked once at app load — no new "feature flags" system needed for one flag). This is not optional polish: `docs/transformation/05-technical-roadmap.md:78` already commits this project to LLM features being "off by default; no data leaves the host unless the user points it somewhere." Shipping this feature pre-configured-off by default is how the brief's explicit DeepSeek requirement and the project's own privacy stance both hold at once — a self-hoster who never sets `SALDO_DEEPSEEK_API_KEY` runs an app that never makes an external AI call, full stop.

## 3. Provider abstraction — OCR, and the one open decision

`backend/app/modules/receipt_import/ocr/base.py`:

```python
class OcrProvider(Protocol):
    async def extract_text(self, images: Sequence[bytes], mime_type: str) -> str: ...
```

(`Sequence[bytes]`, not a single image, from day one — Document 2 §7's multi-page hook, at zero extra cost now.)

DeepSeek's chat models are text-only, so a real OCR step is not a design nicety here — without it there is no text to send the LLM. Two real candidates, genuinely in tension with each other:

| | Local (Tesseract via `pytesseract`) | Cloud (Google Cloud Vision `DOCUMENT_TEXT_DETECTION`) |
|---|---|---|
| Receipt quality | Mediocre on crumpled thermal paper / small fonts — the actual failure mode this feature exists to handle well | Materially better on low-quality photos; this is what "best receipt extraction quality" in the brief points to |
| Cost / keys | Free, no API key, works fully offline | Per-image cost (small, but nonzero), needs `SALDO_GOOGLE_VISION_API_KEY` |
| Fits self-hosted/Pi philosophy | Yes — no second external dependency once DeepSeek is already an accepted exception | No — a second cloud call for every receipt, on top of DeepSeek |
| Implementation cost behind the interface | Same either way — one file, ~40 lines |

**Recommendation:** ship `GoogleVisionOcrProvider` as the default v1 implementation, since the brief explicitly asks for the best-quality provider and OCR fidelity is the ceiling on everything downstream (a bad OCR pass no prompt engineering can fully recover from). Gate it the same way as DeepSeek (`SALDO_GOOGLE_VISION_API_KEY`, empty ⇒ feature disabled) so it fails the same closed-by-default way. Implement `TesseractOcrProvider` in the same PR as a documented, selectable (`SALDO_OCR_PROVIDER=tesseract`) zero-cost/zero-external-dependency alternative for self-hosters who'd rather accept lower accuracy than a second cloud API — this costs one extra small file and directly serves the fork-friendly promise in `CLAUDE.md`, but is not the default.

This is the one place in this design series where I'm flagging a call rather than making it unilaterally: it trades off accuracy against the project's stated preference for minimizing external dependencies, and reasonable people could default the other way. **Please confirm the default (Google Vision) before Document 7's roadmap is executed** — swapping the default later is a one-line config change, not a rework, but I'd rather ask than assume on a decision with real recurring cost implications for self-hosters.

## 4. Prompt design (Phase 8)

System prompt (paraphrased structure — full text lives in `ai/prompts.py`, not duplicated here since it will be iterated on against real receipts):

- **Output contract:** "Return ONLY a single JSON object matching this schema. No prose, no markdown fences, no explanation." Enforced twice: instruction text + DeepSeek's `response_format: json_object` mode, which rejects non-JSON completions at the API level.
- **Input:** the raw OCR text verbatim, today's date (for resolving "01/07" without a year, or a receipt printed just after midnight), the caller's default currency, and the `ExtractionContext` (existing categories, recent merchants) so category/merchant semantic matching (Document 2 §5–6) happens in this single call instead of a second round-trip.
- **Priority order instruction**, mirroring the brief exactly: merchant, date, currency, total, tax, payment method, address, receipt number, possible category, notes.
- **OCR-error resilience instructions**, explicit and specific rather than generic: common OCR confusions (`O`/`0`, `l`/`1`/`I`, `S`/`5`) should be resolved using numeric-context clues; the total is usually the largest number near a line containing "TOTAL"/"AMOUNT DUE"/"BALANCE"; if OCR text looks truncated or garbled, say so in `warnings` rather than guessing.
- **Confidence honesty instruction:** "If you are not reasonably certain of a field, set its confidence below 0.5 and add it to `missing_fields` rather than fabricating a plausible-looking value." This is the load-bearing instruction for the whole confidence system (Document 2 §4) — a model that always reports 0.95 makes the confidence UI worthless, so the prompt asks explicitly for calibrated uncertainty and the review screen treats sub-threshold fields as needing a human look regardless of what value is present.
- **Few-shot example**: one worked example (garbled OCR in, clean JSON out including a couple of intentionally low-confidence fields) — concrete evidence beats abstract instruction for JSON-shape compliance with smaller/cheaper models.

`extraction_service.py` parses the response into `RawExtraction`, and if JSON parsing fails despite `response_format` (defensive, not expected) or required keys are missing, that's a pipeline failure (`status="failed"`), not a best-effort partial draft — matches the brief's "never fabricate."

## 5. Where each Phase 4/5 matching result actually comes from

To be explicit about which matches are pure backend logic vs. AI-assisted, since Document 2 describes both together:

| Match tier | Computed by | AI call involved? |
|---|---|---|
| Exact/fuzzy merchant | `merchant_matching.py`, pure Python (`rapidfuzz`) | No |
| Semantic merchant | Same DeepSeek call as extraction, via `possible_merchant_id` in `RawExtraction` | Yes, no extra call |
| Merchant-default / fuzzy category | `category_matching.py`, pure Python | No |
| AI-semantic category | Same DeepSeek call, via `possible_category_id`/`possible_category_name` | Yes, no extra call |

One LLM call per receipt, total — not one for extraction plus separate calls for merchant/category classification. This keeps cost and latency predictable and is the reason `ExtractionContext` carries category/merchant hints into the extraction call rather than category_matching.py making its own API call.
