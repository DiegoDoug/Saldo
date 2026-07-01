# Saldo backend

FastAPI + SQLModel + SQLite. A modular monolith with a pure, framework-free
domain core. See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the design.

## Layout

```
backend/
├── app/
│   ├── core/         config, async DB engine/session, migration metadata
│   ├── modules/      feature slices (identity, budgeting, sync, layout)
│   ├── shared/       Money value object, FX, common deps
│   └── main.py       app factory (create_app)
├── alembic/          migrations (env wired to app config + SQLModel metadata)
├── tests/            pytest (async, in-process ASGI client)
├── requirements.txt        runtime deps
└── requirements-dev.txt     + lint/test deps
```

## Local development

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt

# apply migrations to a fresh SQLite file
export SALDO_DATABASE_URL="sqlite:///./data/saldo.db"
mkdir -p data
alembic upgrade head

# run the API (docs at http://localhost:8000/docs)
uvicorn app.main:app --reload
```

## Migrations

The Alembic environment reads its URL and target metadata from
`app.core.config` and `app.core.metadata`, so there is one source of truth for
both the database location and the schema.

```bash
alembic revision --autogenerate -m "describe change"   # after editing models
alembic upgrade head
alembic downgrade -1
```

`app/core/metadata.py` imports each module's tables so autogenerate sees them —
add new modules there.

## Tests & lint

```bash
pytest
ruff check .
```
