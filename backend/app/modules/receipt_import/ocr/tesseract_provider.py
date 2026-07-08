"""Tesseract OCR provider — the v1 default (docs/receipt-import/05 §3).

Wraps the local `tesseract` binary via `pytesseract` (a thin subprocess
wrapper, not an OCR engine of its own — see the Dockerfile / README for the
system package this depends on). `pytesseract` is blocking, so each page runs
in a worker thread (`asyncio.to_thread`) to keep it off the event loop; this
is a narrow, local concession, not a reason to reach for an async OCR library.
"""

import asyncio
import io
from collections.abc import Sequence

import pytesseract
from PIL import Image

from app.core.config import settings


class TesseractOcrProvider:
    async def extract_text(self, images: Sequence[bytes], mime_type: str) -> str:
        pages = [await asyncio.to_thread(self._extract_page, data) for data in images]
        return "\n\n".join(page for page in pages if page)

    def _extract_page(self, data: bytes) -> str:
        image = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(image, lang=settings.ocr_languages)
