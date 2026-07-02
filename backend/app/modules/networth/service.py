"""Query + aggregation helpers for the net-worth module.

Plain functions over a session (no repository interfaces — see ARCHITECTURE.md).
Every function takes a `user_id` and filters by it. The net-worth arithmetic is
delegated to the framework-free core (`app.shared.domain.networth`).

Currency note: totals sum raw amounts (single-currency assumption, matching the
offline budgeting core). Multi-currency net worth would resolve via the FX
provider first; that is deliberately out of scope here.
"""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.modules.accounts.service import list_accounts
from app.modules.networth.models import Asset, Liability, NetWorthSnapshot
from app.modules.networth.schemas import NetWorthSummary
from app.modules.transactions.service import account_deltas
from app.shared.domain.networth import allocation, growth, net_worth


async def get_owned_asset(
    session: AsyncSession, user_id: uuid.UUID, asset_id: uuid.UUID
) -> Asset | None:
    asset = await session.get(Asset, asset_id)
    if asset is None or asset.user_id != user_id:
        return None
    return asset


async def get_owned_liability(
    session: AsyncSession, user_id: uuid.UUID, liability_id: uuid.UUID
) -> Liability | None:
    liability = await session.get(Liability, liability_id)
    if liability is None or liability.user_id != user_id:
        return None
    return liability


async def list_assets(session: AsyncSession, user_id: uuid.UUID) -> list[Asset]:
    stmt = select(Asset).where(Asset.user_id == user_id, Asset.deleted == False)  # noqa: E712
    return list((await session.execute(stmt.order_by(Asset.name))).scalars().all())


async def list_liabilities(session: AsyncSession, user_id: uuid.UUID) -> list[Liability]:
    stmt = select(Liability).where(
        Liability.user_id == user_id, Liability.deleted == False  # noqa: E712
    )
    return list((await session.execute(stmt.order_by(Liability.name))).scalars().all())


async def _latest_snapshot_before(
    session: AsyncSession, user_id: uuid.UUID, day: date
) -> NetWorthSnapshot | None:
    stmt = (
        select(NetWorthSnapshot)
        .where(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.deleted == False,  # noqa: E712
            NetWorthSnapshot.date < day,
        )
        .order_by(NetWorthSnapshot.date.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalars().first()


async def compute_net_worth(
    session: AsyncSession, user_id: uuid.UUID, today: date | None = None
) -> NetWorthSummary:
    """Aggregate account balances + manual assets − liabilities into net worth.

    A positive account balance counts as an asset (bucketed by account type); a
    negative one (e.g. a credit card in the red) counts as a liability. Manual
    assets add to their kind bucket; manual liabilities add to the debt total.
    """
    now = today or date.today()
    buckets: dict[str, float] = {}
    assets_total = 0.0
    liabilities_total = 0.0

    accounts = await list_accounts(session, user_id, include_archived=True)
    deltas = await account_deltas(session, user_id)
    for account in accounts:
        balance = account.opening_balance + deltas.get(account.id, 0.0)
        if balance >= 0:
            assets_total += balance
            buckets[account.type] = buckets.get(account.type, 0.0) + balance
        else:
            liabilities_total += -balance

    for asset in await list_assets(session, user_id):
        assets_total += asset.value
        buckets[asset.kind] = buckets.get(asset.kind, 0.0) + asset.value

    for liability in await list_liabilities(session, user_id):
        liabilities_total += liability.balance

    total = net_worth(assets_total, liabilities_total)
    previous = await _latest_snapshot_before(session, user_id, now)
    return NetWorthSummary(
        assets_total=assets_total,
        liabilities_total=liabilities_total,
        net_worth=total,
        allocation=allocation(buckets),
        monthly_growth=growth(total, previous.net_worth) if previous else None,
    )


async def list_snapshots(
    session: AsyncSession, user_id: uuid.UUID
) -> list[NetWorthSnapshot]:
    stmt = select(NetWorthSnapshot).where(
        NetWorthSnapshot.user_id == user_id, NetWorthSnapshot.deleted == False  # noqa: E712
    )
    return list((await session.execute(stmt.order_by(NetWorthSnapshot.date))).scalars().all())


async def upsert_today_snapshot(
    session: AsyncSession, user_id: uuid.UUID, currency: str, today: date | None = None
) -> NetWorthSnapshot:
    """Record (or refresh) today's net-worth snapshot — one row per day."""
    now = today or date.today()
    summary = await compute_net_worth(session, user_id, now)
    stmt = select(NetWorthSnapshot).where(
        NetWorthSnapshot.user_id == user_id,
        NetWorthSnapshot.date == now,
        NetWorthSnapshot.deleted == False,  # noqa: E712
    )
    existing = (await session.execute(stmt)).scalars().first()
    if existing is None:
        existing = NetWorthSnapshot(user_id=user_id, date=now, currency=currency)
    existing.assets_total = summary.assets_total
    existing.liabilities_total = summary.liabilities_total
    existing.net_worth = summary.net_worth
    session.add(existing)
    return existing
