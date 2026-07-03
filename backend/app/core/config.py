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
    # Saldo speaks plain SMTP to whatever mail server you point it at (Mailu
    # in the reference deploy — see `mailu/README.md`). Leaving `smtp_host`
    # blank disables real sending: emails are logged instead, which keeps
    # local dev, tests, and the offline-first `docker compose up` free of any
    # mail infrastructure.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@saldo.local"
    smtp_starttls: bool = True

    # Public base URL of the frontend, used to build the reset-password link
    # that goes into recovery emails (e.g. `{url}/reset-password?token=...`).
    frontend_base_url: str = "http://localhost:5173"

    @property
    def email_enabled(self) -> bool:
        """True when a real SMTP host is configured; else emails are logged."""
        return bool(self.smtp_host.strip())

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
