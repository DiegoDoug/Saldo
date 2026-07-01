"""Identity routers, assembled from fastapi-users.

Mounted by the app factory:
  - /auth/jwt/login, /auth/jwt/logout   (auth_router)
  - /auth/register                       (register_router)
  - /users/me, /users/{id}               (users_router)
"""

from app.modules.identity.backend import auth_backend
from app.modules.identity.dependencies import fastapi_users
from app.modules.identity.schemas import UserCreate, UserRead, UserUpdate

auth_router = fastapi_users.get_auth_router(auth_backend)
register_router = fastapi_users.get_register_router(UserRead, UserCreate)
users_router = fastapi_users.get_users_router(UserRead, UserUpdate)
