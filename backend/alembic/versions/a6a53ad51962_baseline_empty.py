"""baseline (empty)

Revision ID: a6a53ad51962
Revises: 
Create Date: 2026-07-01 12:11:07.208866

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # SQLModel column types (e.g. AutoString) appear in migrations


# revision identifiers, used by Alembic.
revision: str = 'a6a53ad51962'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
