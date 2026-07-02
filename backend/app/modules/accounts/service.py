"""Query + mapping helpers for the accounts module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function that touches user data takes a `user_id` and filters by it.

Balance derivation lives here: an account's current balance is its
`opening_balance` plus the signed sum of its transactions. The transactions
module (a later slice) provides that signed sum via `account_deltas`; until it
is present the deltas default to empty and balance == opening_balance. This keeps
the accounts slice runnable on its own.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.accounts.models import Account
from app.modules.accounts.schemas import AccountBalance, BalancesResponse


async def get_owned_account(
    session: AsyncSession, user_id: uuid.UUID, account_id: uuid.UUID
) -> Account | None:
    account = await session.get(Account, account_id)
    if account is None or account.user_id != user_id:
        return None
    return account


async def list_accounts(
    session: AsyncSession,
    user_id: uuid.UUID,
    include_archived: bool = False,
    include_deleted: bool = False,
) -> list[Account]:
    stmt = select(Account).where(Account.user_id == user_id)
    if not include_deleted:
        stmt = stmt.where(Account.deleted == False)  # noqa: E712
    if not include_archived:
        stmt = stmt.where(Account.archived == False)  # noqa: E712
    stmt = stmt.order_by(Account.position, Account.name)
    result = await session.execute(stmt)
    return list(result.scalars().all())


def build_balances(
    accounts: list[Account], deltas: dict[uuid.UUID, float]
) -> BalancesResponse:
    """Fold per-account signed transaction deltas onto opening balances.

    `deltas` maps account_id → signed transaction sum (income +, expense -,
    transfers already signed per leg). Missing accounts contribute 0.
    """
    rows: list[AccountBalance] = []
    totals: dict[str, float] = {}
    for account in accounts:
        balance = account.opening_balance + deltas.get(account.id, 0.0)
        rows.append(
            AccountBalance(
                account_id=account.id,
                currency=account.currency,
                opening_balance=account.opening_balance,
                balance=balance,
            )
        )
        totals[account.currency] = totals.get(account.currency, 0.0) + balance
    return BalancesResponse(accounts=rows, totals_by_currency=totals)
