"""Environment-based application settings.

All configuration comes from the environment (or a local `.env` file), prefixed
with `SALDO_`. There is exactly one place to look for "what is configurable" —
this module — and one instance, `settings`, imported everywhere else.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SALDO_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Database -------------------------------------------------------
    # Sync-style SQLAlchemy URL. Alembic uses this as-is; the app runtime
    # derives an async variant from it (see `async_database_url`).
    database_url: str = "sqlite:///./data/saldo.db"

    # --- Auth (used from Stage 2) --------------------------------------
    jwt_secret: str = "change-me-in-production"
    jwt_lifetime_seconds: int = 60 * 60 * 24 * 7  # 7 days

    # --- Email / Resend (password reset) -------------------------------
    # Saldo sends the one recovery email through Resend (https://resend.com)
    # over its HTTPS API. Leaving `resend_api_key` blank disables real sending:
    # emails are logged instead, which keeps local dev, tests, and the
    # offline-first `docker compose up` free of any mail infrastructure.
    resend_api_key: str = ""
    # Sender address. Must be on a Resend-verified domain in production; the
    # `onboarding@resend.dev` sandbox sender works for first tests.
    email_from: str = "Saldo <onboarding@resend.dev>"

    # Public base URL of the frontend, used to build the reset-password link
    # that goes into recovery emails (e.g. `{url}/reset-password?token=...`).
    frontend_base_url: str = "http://localhost:5173"

    @property
    def email_enabled(self) -> bool:
        """True when a Resend API key is configured; else emails are logged."""
        return bool(self.resend_api_key.strip())

    # --- Receipt import (AI receipt-to-transaction pipeline) ------------
    # Images are stored content-addressed on local disk; the drafts they
    # produce are server-only state, never synced to Dexie (see
    # docs/receipt-import/04-database-changes.md).
    receipt_storage_dir: str = "./data/receipts"
    receipt_max_upload_mb: int = 10

    # --- Bank import (AI bank-statement-to-transactions pipeline) -------
    # Uploaded CSV/Markdown statements are stored content-addressed on local
    # disk; the drafts they produce are server-only state, never synced to
    # Dexie (same posture as receipt import). Reuses the same DeepSeek
    # provider config below — leaving `deepseek_api_key` blank disables both.
    bank_storage_dir: str = "./data/bank_imports"
    bank_max_upload_mb: int = 10

    # Tesseract language packs to run, "+"-joined (see Dockerfile). Spanish +
    # English cover this app's primary audience by default.
    ocr_languages: str = "spa+eng"

    # DeepSeek does the structured extraction (docs/receipt-import/05-ai-integration-design.md).
    # Leaving `deepseek_api_key` blank disables the whole feature — the upload
    # endpoint returns 503 rather than degrading silently — same "off by
    # default, no data leaves the host unless configured" posture as
    # `resend_api_key`, and consistent with this project's own stated stance
    # on optional LLM features (docs/transformation/05-technical-roadmap.md).
    deepseek_api_key: str = ""
    deepseek_model: str = "deepseek-chat"
    deepseek_base_url: str = "https://api.deepseek.com"

    @property
    def deepseek_enabled(self) -> bool:
        return bool(self.deepseek_api_key.strip())

    # --- CORS -----------------------------------------------------------
    # Comma-separated in the environment (SALDO_CORS_ORIGINS); exposed as a
    # parsed list via `cors_origins_list`.
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def async_database_url(self) -> str:
        """The runtime (async) DB URL.

        SQLite needs the `aiosqlite` driver for async SQLAlchemy. We accept the
        plain `sqlite://` form in config (what Alembic and most tooling expect)
        and inject the async driver here so there is a single source of truth
        for the database location.
        """
        if self.database_url.startswith("sqlite:///"):
            return self.database_url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        return self.database_url


@lru_cache
def get_settings() -> Settings:
    """Cached accessor so the `.env` file is read once per process."""
    return Settings()


settings = get_settings()
