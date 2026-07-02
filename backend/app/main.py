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

    # --- Accounts -------------------------------------------------------
    from app.modules.accounts.router import router as accounts_router

    app.include_router(accounts_router)

    # --- Transactions ---------------------------------------------------
    from app.modules.transactions.router import router as transactions_router

    app.include_router(transactions_router)

    # --- Merchants ------------------------------------------------------
    from app.modules.merchants.router import router as merchants_router

    app.include_router(merchants_router)

    # --- Bills / recurring rules ----------------------------------------
    from app.modules.bills.router import router as bills_router

    app.include_router(bills_router)

    # --- Goals ----------------------------------------------------------
    from app.modules.goals.router import router as goals_router

    app.include_router(goals_router)

    # --- Net worth (assets, liabilities, snapshots) ---------------------
    from app.modules.networth.router import router as networth_router

    app.include_router(networth_router)

    # --- Reports (analytics over transactions) --------------------------
    from app.modules.reports.router import router as reports_router

    app.include_router(reports_router)

    # --- Sync -----------------------------------------------------------
    from app.modules.sync.router import router as sync_router

    app.include_router(sync_router)

    # --- Layout ---------------------------------------------------------
    from app.modules.layout.router import router as layout_router

    app.include_router(layout_router)

    return app


app = create_app()
