"""add transaction splits (split_parent, parent_id)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-06 00:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # `split_parent` marks a split container (excluded from every money sum);
    # `parent_id` links each child leaf to its parent. Batch mode because SQLite
    # recreates the table to add the self-FK. Existing rows are non-splits, so
    # split_parent defaults to false via a server_default that is then dropped.
    with op.batch_alter_table('transaction', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('split_parent', sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column('parent_id', sa.Uuid(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_transaction_split_parent'), ['split_parent'], unique=False
        )
        batch_op.create_index(batch_op.f('ix_transaction_parent_id'), ['parent_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_transaction_parent_id_transaction', 'transaction', ['parent_id'], ['id']
        )
    with op.batch_alter_table('transaction', schema=None) as batch_op:
        batch_op.alter_column('split_parent', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('transaction', schema=None) as batch_op:
        batch_op.drop_constraint('fk_transaction_parent_id_transaction', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_transaction_parent_id'))
        batch_op.drop_index(batch_op.f('ix_transaction_split_parent'))
        batch_op.drop_column('parent_id')
        batch_op.drop_column('split_parent')
