"""Alembic migration environment for Saldo.

Wired to the application's own configuration and SQLModel metadata so there is a
single source of truth for both the database location and the schema shape:
  - URL comes from `app.core.config.settings` (the async SQLite URL).
  - target metadata is `SQLModel.metadata`, populated by importing every feature
    module's tables via `app.core.metadata`.
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context
from app.core.config import settings

# Importing this populates SQLModel.metadata with all feature-module tables.
from app.core.metadata import metadata as target_metadata

config = context.config

# Feed the app's DB URL into Alembic's config (overrides the .ini placeholder).
config.set_main_option("sqlalchemy.url", settings.async_database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Run migrations without a live DBAPI connection (emit SQL)."""
    context.configure(
        url=settings.async_database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite can't ALTER most things in place; batch mode rewrites tables.
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
