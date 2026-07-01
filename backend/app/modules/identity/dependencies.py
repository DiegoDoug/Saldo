"""FastAPI dependencies for identity — the wiring seam other modules use.

`CurrentUser` is the protected-route dependency downstream slices depend on:
annotate a route argument with it and the request is rejected (401) unless it
carries a valid JWT for an active user. Every query touching Entry, Category, or
WidgetLayout data must scope by `user.id` obtained here — that is the app's one
security invariant (see ARCHITECTURE.md).
"""

import uuid
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from fastapi_users import FastAPIUsers
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.modules.identity.backend import auth_backend
from app.modules.identity.manager import UserManager, password_helper
from app.modules.identity.models import User


async def get_user_db(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(
    user_db: Annotated[SQLAlchemyUserDatabase, Depends(get_user_db)],
) -> AsyncGenerator[UserManager, None]:
    yield UserManager(user_db, password_helper)


fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# The dependency downstream modules import. `active=True` rejects disabled users.
current_active_user = fastapi_users.current_user(active=True)

# Convenience alias for route signatures: `user: CurrentUser`.
CurrentUser = Annotated[User, Depends(current_active_user)]
