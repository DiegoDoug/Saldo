"""DI accessor for the OCR provider.

Same `get_*_provider()` shape as `shared/currency.py`'s `get_fx_provider` —
a process-wide singleton, resolved through FastAPI's `Depends` in `router.py`
so tests can substitute a fake via `app.dependency_overrides` instead of
running real OCR. Only one implementation exists today (Tesseract, the
decided v1 default); a second provider is a new file plus a small selector
here, not a change to anything that calls this function.
"""

from app.modules.receipt_import.ocr.base import OcrProvider
from app.modules.receipt_import.ocr.tesseract_provider import TesseractOcrProvider

_provider: OcrProvider = TesseractOcrProvider()


def get_ocr_provider() -> OcrProvider:
    return _provider
