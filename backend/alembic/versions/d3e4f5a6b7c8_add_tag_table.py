"""add tag table

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-06 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # SQLModel column types (e.g. AutoString) appear in migrations


# revision identifiers, used by Alembic.
revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tag',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=60), nullable=False),
        sa.Column('color', sqlmodel.sql.sqltypes.AutoString(length=9), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tag_deleted'), ['deleted'], unique=False)
        batch_op.create_index(batch_op.f('ix_tag_name'), ['name'], unique=False)
        batch_op.create_index(batch_op.f('ix_tag_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('tag', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tag_user_id'))
        batch_op.drop_index(batch_op.f('ix_tag_name'))
        batch_op.drop_index(batch_op.f('ix_tag_deleted'))
    op.drop_table('tag')
