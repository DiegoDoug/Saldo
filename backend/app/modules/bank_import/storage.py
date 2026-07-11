"""Content-addressed on-disk storage for uploaded bank-statement files.

Files are stored under `{bank_storage_dir}/{user_id}/{sha256}.{ext}` —
content-addressed so identical uploads by the same user collapse to one file
(and, paired with `content_hash` on `BankImport`, gives duplicate-upload
detection for free) and namespaced by `user_id` so a bug elsewhere can't serve
one user's file under another's path. Mirrors `receipt_import/storage.py`; the
only difference is the accepted types are text (CSV/Markdown) rather than
images. File I/O is synchronous — uploads are small and infrequent.
"""

import hashlib
import uuid
from pathlib import Path

from app.core.config import settings

_EXTENSIONS = {
    "text/csv": "csv",
    "application/csv": "csv",
    "application/vnd.ms-excel": "csv",
    "text/markdown": "md",
    "text/x-markdown": "md",
    "text/plain": "txt",
}

ALLOWED_MIME_TYPES = tuple(_EXTENSIONS)


class UnsupportedFileType(ValueError):
    pass


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_path_for(user_id: uuid.UUID, content_hash: str, mime_type: str) -> str:
    ext = _EXTENSIONS.get(mime_type)
    if ext is None:
        raise UnsupportedFileType(f"Unsupported file type: {mime_type}")
    return f"{user_id}/{content_hash}.{ext}"


def save_file(user_id: uuid.UUID, data: bytes, mime_type: str) -> tuple[str, str]:
    """Write `data` to disk if not already present.

    Returns (relative_path, content_hash). Idempotent: re-uploading identical
    bytes for the same user is a no-op write.
    """
    content_hash = hash_bytes(data)
    relative_path = file_path_for(user_id, content_hash, mime_type)
    full_path = Path(settings.bank_storage_dir) / relative_path
    full_path.parent.mkdir(parents=True, exist_ok=True)
    if not full_path.exists():
        full_path.write_bytes(data)
    return relative_path, content_hash


def load_text(relative_path: str) -> str:
    return (Path(settings.bank_storage_dir) / relative_path).read_text(
        encoding="utf-8", errors="replace"
    )


def delete_file(relative_path: str) -> None:
    Path(settings.bank_storage_dir, relative_path).unlink(missing_ok=True)
