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

    # --- Email / SMTP (password reset) ---------------------------------
    # Saldo speaks plain SMTP to whatever mail server you point it at (Stalwart
    # in the reference deploy — see `stalwart/README.md`). Leaving `smtp_host`
    # blank disables real sending: emails are logged instead, which keeps
    # local dev, tests, and the offline-first `docker compose up` free of any
    # mail infrastructure.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@saldo.local"
    smtp_starttls: bool = True

    # Resend (https://resend.com) — an HTTP email API, an alternative to SMTP
    # for hosts where outbound SMTP ports are blocked (most clouds / home ISPs),
    # which is the usual reason to reach for a hosted sender. Set the API key to
    # send via Resend; the "From" address is still `smtp_from` and must be a
    # verified sender on your Resend domain (or `onboarding@resend.dev` in test).
    resend_api_key: str = ""
    resend_api_url: str = "https://api.resend.com/emails"

    # Which transport `send_email` uses:
    #   "auto"   — Resend if an API key is set, else SMTP if a host is set, else log
    #   "resend" — force Resend (requires resend_api_key)
    #   "smtp"   — force SMTP (e.g. the Mailpit sink in Docker, even with a key set)
    #   "log"    — never send; just log the message
    email_provider: str = "auto"

    # Public base URL of the frontend, used to build the reset-password link
    # that goes into recovery emails (e.g. `{url}/reset-password?token=...`).
    frontend_base_url: str = "http://localhost:5173"

    @property
    def resolved_email_provider(self) -> str:
        """The concrete transport to use — resolves "auto" against what's set."""
        choice = self.email_provider.strip().lower()
        if choice in {"resend", "smtp", "log"}:
            return choice
        # "auto" (or any unknown value): prefer Resend, then SMTP, then log.
        if self.resend_api_key.strip():
            return "resend"
        if self.smtp_host.strip():
            return "smtp"
        return "log"

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
