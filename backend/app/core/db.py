"""Database engine and session wiring.

The app runs on an async SQLAlchemy engine (fastapi-users and the request path
are async). Migrations are owned by Alembic, not by `create_all` — so there is
no schema-creation call here; the database shape is whatever the latest
migration produced.

DDD-lite note: we use SQLModel/SQLAlchemy directly as the persistence layer.
There are deliberately no repository interfaces wrapping this — see
ARCHITECTURE.md.
"""

from collections.abc import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

_IS_SQLITE = settings.async_database_url.startswith("sqlite")

# `check_same_thread=False` is the standard SQLite-under-async setting; the
# async driver marshals access so the single connection is used safely.
# `timeout` makes a writer wait for the lock instead of failing immediately.
engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30} if _IS_SQLITE else {},
)

if _IS_SQLITE:

    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record) -> None:
        # WAL lets readers proceed while one writer commits — without it,
        # concurrent syncs from several users hit "database is locked".
        # busy_timeout (ms) backs the driver-level timeout at the SQLite level.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a scoped async session per request."""
    async with async_session_maker() as session:
        yield session
