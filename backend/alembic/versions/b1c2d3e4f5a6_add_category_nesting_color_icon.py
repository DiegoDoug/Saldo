"""add category nesting, color, icon

Revision ID: b1c2d3e4f5a6
Revises: 4dd37c30c894
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # SQLModel column types (e.g. AutoString) appear in migrations


# revision identifiers, used by Alembic.
revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '4dd37c30c894'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Additive columns on `category`: self-referential `parent_id` (nesting),
    # plus optional presentation fields `color`/`icon`. Batch mode because
    # SQLite recreates the table to add the self-FK.
    with op.batch_alter_table('category', schema=None) as batch_op:
        batch_op.add_column(sa.Column('parent_id', sa.Uuid(), nullable=True))
        batch_op.add_column(
            sa.Column('color', sqlmodel.sql.sqltypes.AutoString(length=9), nullable=True)
        )
        batch_op.add_column(
            sa.Column('icon', sqlmodel.sql.sqltypes.AutoString(length=40), nullable=True)
        )
        batch_op.create_index(batch_op.f('ix_category_parent_id'), ['parent_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_category_parent_id_category', 'category', ['parent_id'], ['id']
        )


def downgrade() -> None:
    with op.batch_alter_table('category', schema=None) as batch_op:
        batch_op.drop_constraint('fk_category_parent_id_category', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_category_parent_id'))
        batch_op.drop_column('icon')
        batch_op.drop_column('color')
        batch_op.drop_column('parent_id')
