"""DeepSeek receipt-extraction provider.

The only file in the codebase that knows DeepSeek's request/response shape —
everything above it depends on `ReceiptExtractionProvider`/`RawExtraction`
(`base.py`) instead. Uses DeepSeek's OpenAI-compatible chat completions
endpoint with JSON mode (`response_format: json_object`) and a low
temperature, so the output is enforced-valid JSON and reasonably
deterministic. See docs/receipt-import/05-ai-integration-design.md §1, §4.

Reads `settings.deepseek_*` at call time (not cached in `__init__`), same
convention `identity/email.py` uses for `resend_api_key` — tests monkeypatch
`settings` directly rather than needing to rebuild a provider instance.
"""

import json

import httpx

from app.core.config import settings
from app.modules.receipt_import.ai.base import ExtractionContext, RawExtraction
from app.modules.receipt_import.ai.prompts import SYSTEM_PROMPT, build_user_prompt


class ReceiptExtractionError(RuntimeError):
    """DeepSeek returned something that isn't a usable extraction."""


class DeepSeekProvider:
    async def extract(self, ocr_text: str, context: ExtractionContext) -> RawExtraction:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.deepseek_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
                json={
                    "model": settings.deepseek_model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": build_user_prompt(ocr_text, context)},
                    ],
                },
            )
            response.raise_for_status()

        payload = response.json()
        try:
            content = payload["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise ReceiptExtractionError(
                f"Unexpected DeepSeek response shape: {payload}"
            ) from exc
        return RawExtraction.model_validate(data)
