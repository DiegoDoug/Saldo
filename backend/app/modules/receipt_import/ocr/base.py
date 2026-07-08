"""OCR provider interface.

The receipt pipeline needs raw text out of a photo before any AI extraction
can run — DeepSeek's chat models are text-only, so this step isn't a design
nicety, it's the only way there's anything to send the LLM. Business logic
(`extraction_service.py`, `pipeline.py`) depends only on this Protocol, never
on a specific OCR engine, so a cloud provider (Google Vision, Azure Document
Intelligence) can be added later as a sibling implementation with zero changes
above this file. See docs/receipt-import/05-ai-integration-design.md §3.
"""

from collections.abc import Sequence
from typing import Protocol


class OcrProvider(Protocol):
    async def extract_text(self, images: Sequence[bytes], mime_type: str) -> str:
        """Return the raw text recognized across one or more page images.

        `images` is a sequence (not a single image) from day one so a future
        multi-page receipt can reuse this interface unchanged — v1 callers
        always pass exactly one image.
        """
        ...
