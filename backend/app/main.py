"""Saldo backend — FastAPI application factory.

Keep this thin. It wires cross-cutting concerns (CORS, meta endpoints) and
mounts feature-module routers. All real logic lives in `app/modules/*` and the
framework-free domain core in `app/shared/domain/`.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="Saldo API",
        version="0.1.0",
        description="Offline-first, self-hosted personal finance.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", tags=["meta"])
    async def root() -> dict[str, str]:
        return {"app": "saldo", "version": app.version}

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # --- Identity (auth) ------------------------------------------------
    from app.modules.identity.router import (
        auth_router,
        register_router,
        users_router,
    )

    app.include_router(auth_router, prefix="/auth/jwt", tags=["auth"])
    app.include_router(register_router, prefix="/auth", tags=["auth"])
    app.include_router(users_router, prefix="/users", tags=["users"])

    # --- Budgeting ------------------------------------------------------
    from app.modules.budgeting.router import router as budgeting_router

    app.include_router(budgeting_router)

    # --- Sync -----------------------------------------------------------
    from app.modules.sync.router import router as sync_router

    app.include_router(sync_router)

    return app


app = create_app()
