"""Content-addressed on-disk storage for uploaded receipt images.

Images are stored under `{receipt_storage_dir}/{user_id}/{sha256}.{ext}` —
content-addressed so identical uploads by the same user collapse to one file
automatically (and, paired with `content_hash` on `ReceiptImport`, gives
duplicate-receipt detection for free — see
docs/receipt-import/02-technical-design.md §7), and namespaced by `user_id` so
a bug elsewhere can't serve one user's image under another's path. This
mirrors the `attachment` storage model already scoped out in
`docs/transformation/04-data-model-system-architecture.md` for receipt blobs:
server-only, not synced to Dexie.

File I/O here is synchronous (plain `pathlib`), not `aiofiles`. Uploads are
capped at a few megabytes (`SALDO_RECEIPT_MAX_UPLOAD_MB`) and this project
prefers fewer dependencies over marginal async purity for small, infrequent
writes (see `TECH_STACK.md`'s rejected-alternatives discipline).
"""

import hashlib
import uuid
from pathlib import Path

from app.core.config import settings

_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}

ALLOWED_MIME_TYPES = tuple(_EXTENSIONS)


class UnsupportedImageType(ValueError):
    pass


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_path_for(user_id: uuid.UUID, content_hash: str, mime_type: str) -> str:
    """Relative path (from `receipt_storage_dir`) for a user + content hash."""
    ext = _EXTENSIONS.get(mime_type)
    if ext is None:
        raise UnsupportedImageType(f"Unsupported image type: {mime_type}")
    return f"{user_id}/{content_hash}.{ext}"


def save_image(user_id: uuid.UUID, data: bytes, mime_type: str) -> tuple[str, str]:
    """Write `data` to disk if not already present.

    Returns (relative_path, content_hash). Idempotent: re-uploading identical
    bytes for the same user is a no-op write.
    """
    content_hash = hash_bytes(data)
    relative_path = image_path_for(user_id, content_hash, mime_type)
    full_path = Path(settings.receipt_storage_dir) / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    if not full_path.exists():
        full_path.write_bytes(data)
    return relative_path, content_hash


def load_image(relative_path: str) -> bytes:
    return (Path(settings.receipt_storage_dir) / relative_path).read_bytes()


def delete_image(relative_path: str) -> None:
    Path(settings.receipt_storage_dir, relative_path).unlink(missing_ok=True)
