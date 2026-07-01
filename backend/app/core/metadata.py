"""Aggregates SQLModel table metadata for Alembic autogenerate.

This module imports each feature module's table definitions so that
`SQLModel.metadata` is fully populated when Alembic introspects the schema to
generate migrations. It holds **no** model definitions of its own — those live
in their feature modules (`app/modules/*/models.py`), per ARCHITECTURE.md. This
is an import aggregator for migrations, not a shared models dumping ground.
"""

from sqlmodel import SQLModel

from app.modules.budgeting import models as _budgeting  # noqa: F401

# Feature-module tables are imported here as they are introduced:
from app.modules.identity import models as _identity  # noqa: F401
from app.modules.layout import models as _layout  # noqa: F401

metadata = SQLModel.metadata
