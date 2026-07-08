"""Shared test fixtures.

Each test runs against a fresh, in-memory SQLite database (StaticPool keeps the
single in-memory connection alive for the whole app), with the request-scoped
`get_session` dependency overridden to point at it. No network, no files, no
shared state between tests.
"""

from collections.abc import AsyncGenerator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

import app.core.db as core_db

# Importing this registers every feature module's tables on SQLModel.metadata.
import app.core.metadata  # noqa: F401
from app.core.db import get_session
from app.main import app


@pytest_asyncio.fixture
async def client(monkeypatch) -> AsyncGenerator[AsyncClient, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    test_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        async with test_session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    # Background tasks (e.g. the receipt-import pipeline) can't reuse the
    # per-request session — FastAPI closes yield-dependencies *before* running
    # background tasks, not after — so they open their own session via
    # `app.core.db.async_session_maker`. Point that at this same ephemeral
    # test database, or any background-task test would silently hit the real
    # (unmigrated, in this test run) database instead.
    monkeypatch.setattr(core_db, "async_session_maker", test_session_maker)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()
