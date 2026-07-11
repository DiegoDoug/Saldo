"""add bank_import table

Revision ID: a1b2c3d4e5f6
Revises: f5a6b7c8d9e0
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # SQLModel column types (e.g. AutoString) appear in migrations


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('bank_import',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('status', sqlmodel.sql.sqltypes.AutoString(length=16), nullable=False),
    sa.Column('content_hash', sqlmodel.sql.sqltypes.AutoString(length=64), nullable=False),
    sa.Column('file_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
    sa.Column('file_path', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
    sa.Column('mime_type', sqlmodel.sql.sqltypes.AutoString(length=100), nullable=False),
    sa.Column('ai_raw_response', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('draft_json', sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    sa.Column('error_message', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
    sa.Column('created_transaction_count', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('bank_import', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_bank_import_content_hash'), ['content_hash'], unique=False)
        batch_op.create_index(batch_op.f('ix_bank_import_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_bank_import_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('bank_import', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_bank_import_user_id'))
        batch_op.drop_index(batch_op.f('ix_bank_import_status'))
        batch_op.drop_index(batch_op.f('ix_bank_import_content_hash'))

    op.drop_table('bank_import')
