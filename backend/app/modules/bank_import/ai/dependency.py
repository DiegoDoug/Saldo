"""DI accessor for the bank-statement AI provider.

Same `get_*_provider()` shape as `receipt_import/ai/dependency.py` — a
process-wide singleton, resolved through FastAPI's `Depends` in `router.py` so
tests can substitute a fake via `app.dependency_overrides` instead of calling
DeepSeek for real. Adding another provider later is a new file plus a small
selector here, not a change to anything that calls this function.
"""

from app.modules.bank_import.ai.base import BankExtractionProvider
from app.modules.bank_import.ai.deepseek_provider import DeepSeekBankProvider

_provider: BankExtractionProvider = DeepSeekBankProvider()


def get_bank_ai_provider() -> BankExtractionProvider:
    return _provider
