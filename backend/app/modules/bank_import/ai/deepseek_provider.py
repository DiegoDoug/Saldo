"""DeepSeek bank-statement parsing provider.

The only file in this module that knows DeepSeek's request/response shape —
everything above it depends on `BankExtractionProvider`/`RawBankExtraction`
(`base.py`). Uses DeepSeek's OpenAI-compatible chat completions endpoint with
JSON mode (`response_format: json_object`) and a low temperature, exactly like
`receipt_import/ai/deepseek_provider.py`. Reads `settings.deepseek_*` at call
time (not cached in `__init__`) so tests can monkeypatch `settings` directly.

The timeout is larger than receipt import's: a statement can carry hundreds of
rows, so the completion takes longer than a single receipt.
"""

import json

import httpx

from app.core.config import settings
from app.modules.bank_import.ai.base import BankExtractionContext, RawBankExtraction
from app.modules.bank_import.ai.prompts import SYSTEM_PROMPT, build_user_prompt


class BankExtractionError(RuntimeError):
    """DeepSeek returned something that isn't a usable extraction."""


class DeepSeekBankProvider:
    async def extract(
        self, file_text: str, context: BankExtractionContext
    ) -> RawBankExtraction:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.deepseek_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
                json={
                    "model": settings.deepseek_model,
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": build_user_prompt(file_text, context)},
                    ],
                },
            )
            response.raise_for_status()

        payload = response.json()
        try:
            content = payload["choices"][0]["message"]["content"]
            data = json.loads(content)
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            raise BankExtractionError(f"Unexpected DeepSeek response shape: {payload}") from exc
        return RawBankExtraction.model_validate(data)
