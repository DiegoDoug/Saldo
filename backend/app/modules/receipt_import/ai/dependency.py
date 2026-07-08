"""DI accessor for the receipt-extraction AI provider.

Same `get_*_provider()` shape as `shared/currency.py`'s `get_fx_provider` —
a process-wide singleton, resolved through FastAPI's `Depends` in `router.py`
so tests can substitute a fake via `app.dependency_overrides` instead of
calling DeepSeek for real. Only one implementation exists today; adding
OpenAI/Gemini/Claude/a local model later is a new file plus a small selector
here, not a change to anything that calls this function.
"""

from app.modules.receipt_import.ai.base import ReceiptExtractionProvider
from app.modules.receipt_import.ai.deepseek_provider import DeepSeekProvider

_provider: ReceiptExtractionProvider = DeepSeekProvider()


def get_ai_provider() -> ReceiptExtractionProvider:
    return _provider
