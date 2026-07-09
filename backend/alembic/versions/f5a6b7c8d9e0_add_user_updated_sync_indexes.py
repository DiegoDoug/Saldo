"""add composite (user_id, updated_at) indexes for sync pulls

Every /sync/pull filters by user_id AND updated_at; with only the single-column
user_id index, SQLite scans all of a user's rows on every incremental pull.

Revision ID: f5a6b7c8d9e0
Revises: b4caf8d99b62
Create Date: 2026-07-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'b4caf8d99b62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# All tables that flow through /sync/pull.
_SYNC_TABLES = (
    'account',
    'category',
    'entry',
    'goal',
    'liability',
    'asset',
    'merchant',
    'net_worth_snapshot',
    'recurring_rule',
    'tag',
    'transaction',
)


def upgrade() -> None:
    for table in _SYNC_TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.create_index(
                f'ix_{table}_user_updated', ['user_id', 'updated_at'], unique=False
            )


def downgrade() -> None:
    for table in _SYNC_TABLES:
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_index(f'ix_{table}_user_updated')
