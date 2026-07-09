"""Identity routers, assembled from fastapi-users plus one custom route.

Mounted by the app factory:
  - /auth/jwt/login, /auth/jwt/logout   (auth_router)
  - /auth/register                       (register_router)
  - /auth/forgot-password, /auth/reset-password  (reset_password_router)
  - /users/me, /users/{id}               (users_router)
  - /users/me/change-password            (account_router)
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_users.exceptions import InvalidPasswordException
from pydantic import BaseModel

from app.modules.identity.backend import auth_backend
from app.modules.identity.dependencies import CurrentUser, fastapi_users, get_user_manager
from app.modules.identity.manager import UserManager
from app.modules.identity.schemas import UserCreate, UserRead, UserUpdate

auth_router = fastapi_users.get_auth_router(auth_backend)
register_router = fastapi_users.get_register_router(UserRead, UserCreate)
reset_password_router = fastapi_users.get_reset_password_router()
users_router = fastapi_users.get_users_router(UserRead, UserUpdate)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


account_router = APIRouter()


@account_router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    user: CurrentUser,
    user_manager: Annotated[UserManager, Depends(get_user_manager)],
) -> None:
    """Change the signed-in user's password, verifying the current one.

    fastapi-users' PATCH /users/me changes the password on a bare JWT; for an
    app holding financial data the current password must be re-proven, and that
    check has to live server-side — a client-side guard protects nothing.
    """
    verified, _ = user_manager.password_helper.verify_and_update(
        payload.current_password, user.hashed_password
    )
    if not verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "CURRENT_PASSWORD_INCORRECT")
    try:
        await user_manager.update(UserUpdate(password=payload.new_password), user, safe=True)
    except InvalidPasswordException as err:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            {"code": "UPDATE_INVALID_PASSWORD", "reason": str(err.reason)},
        ) from err
