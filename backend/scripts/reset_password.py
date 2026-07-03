"""CLI to reset a user's password directly in the database.

For local/self-hosted use when you're locked out and don't want to wait on a
full email-based password-reset flow (not implemented yet). Passwords are
stored as argon2 hashes (one-way), so there's no way to recover the old
password from the database as text -- this sets a new one instead.

Usage (from `backend/`, with the venv active):
    python -m scripts.reset_password you@example.com
"""

import argparse
import asyncio
import getpass

from sqlmodel import select

from app.core.db import async_session_maker
from app.modules.identity.manager import password_helper
from app.modules.identity.models import User


async def reset_password(email: str, new_password: str) -> None:
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        if user is None:
            raise SystemExit(f"No user found with email {email!r}")

        user.hashed_password = password_helper.hash(new_password)
        session.add(user)
        await session.commit()
        print(f"Password updated for {email}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    args = parser.parse_args()

    new_password = getpass.getpass("New password: ")
    confirm = getpass.getpass("Confirm password: ")
    if new_password != confirm:
        raise SystemExit("Passwords did not match")
    if len(new_password) < 8:
        raise SystemExit("Password must be at least 8 characters")

    asyncio.run(reset_password(args.email, new_password))


if __name__ == "__main__":
    main()
