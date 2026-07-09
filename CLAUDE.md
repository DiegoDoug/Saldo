# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What Saldo is

Offline-first, self-hosted personal finance: manual entry, multi-user, multi-currency, built to run on a Raspberry Pi and be forked. The domain speaks Spanish by design — `nomina` (payroll), `otros` (other income), `gastos fijos` / `gastos variables` (fixed / variable expenses), `ahorro` (savings). Keep that vocabulary consistent across API, code, and UI.

`reference/Presupuesto.tsx` is the original single-file prototype and the source of truth for the arithmetic. Some docs still call the project "Cuentas" (its former name).

## Commands

Backend (`cd backend`, Python ≥ 3.11):
```bash
pip install -r requirements-dev.txt
export SALDO_DATABASE_URL="sqlite:///./data/saldo.db" && mkdir -p data
alembic upgrade head                        # apply migrations
uvicorn app.main:app --reload               # http://localhost:8000/docs
pytest                                       # all tests
pytest tests/test_budgeting_domain.py        # one file
pytest tests/test_sync.py::test_name         # one test
ruff check .                                 # lint
alembic revision --autogenerate -m "msg"     # after editing models (see metadata note below)
```

Frontend (`cd frontend`):
```bash
npm install
VITE_API_BASE_URL="http://localhost:8000" npm run dev   # http://localhost:5173
npm run typecheck                            # tsc --noEmit
npm test                                      # vitest run
npm test -- src/shared/domain/money.test.ts   # one file
npm run test:watch
npm run build                                  # tsc --noEmit && vite build
```

Full stack: `docker compose up --build` (frontend :8080, backend :8000). Copy `.env.example` to `.env` first; all backend config is env-driven with the `SALDO_` prefix (see `backend/app/core/config.py`).

## Architecture

Modular monolith, **DDD-lite** (not full DDD — see `ARCHITECTURE.md` for why aggregates, repositories, domain events, and app-service layers were deliberately rejected). Code is organized **by feature, not by layer**: both `backend/app/modules/` and `frontend/src/modules/` split into `budgeting`, `identity`, `layout`, `sync` — each a vertical slice (routes + models + logic together). There is no shared `models.py` dumping ground.

### The domain core is the product

`backend/app/shared/domain/` and `frontend/src/shared/domain/` hold the pure, framework-free rules (`compute_month`/`compute_year` in Python, `computeMonth`/`computeYear` in TS) plus the `Money` value object. Rules:
- **No framework imports and no I/O** in these files (no FastAPI, SQLModel, React).
- **The Python and TS cores must agree.** Any change to a formula must be mirrored on both sides, and the mirrored tests must assert the *same expected numbers*. These have the highest test coverage on purpose.
- Rounding is faithful to the prototype's quirks — e.g. `extras_total` is left unrounded until it folds into `income_total`. Don't "clean up" rounding without checking `reference/Presupuesto.tsx`.
- `Money { amount, currency }` enforces the one real invariant: never add amounts across currencies. Multi-currency is resolved to a single currency *before* it reaches the compute core; conversion happens only for display.

### Offline-first data flow

Dexie (IndexedDB) is the on-device source of truth; every UI write lands there first and must never block on the network. SQLite is the cross-device source of truth, reconciled via `/sync/push` and `/sync/pull`. TanStack Query owns the background sync loop; Zustand holds session/theme.

- **Conflict resolution is last-write-wins on `updated_at`** on both sides (`frontend/src/modules/sync/syncEngine.ts` and `backend/app/modules/sync/router.py`). No CRDTs.
- **Timestamp gotcha:** the backend emits naive-UTC ISO (no `Z`); the client writes `toISOString()` (with `Z`). Always compare via `toEpoch()`, which normalizes a missing zone to UTC. Never compare these timestamps as strings.
- Pull includes tombstones (`deleted` rows) so clients can drop locally-deleted records. Dexie can't index booleans, so `deleted` is stored as `0 | 1`.
- Push is idempotent. Ids owned by another user are never applied: they're skipped and reported back in `rejected_ids` so the client can purge them locally (a hard failure would poison the whole batch and permanently brick that device's sync).

### Security boundary

Every backend query touching `Entry`, `Category`, or `WidgetLayout` **must be scoped by the authenticated user's id** (`user_id` filter). An unscoped query on user data is a bug, full stop. Auth is fastapi-users (email + password, argon2, JWT).

## Conventions & gotchas

- **New backend table?** Import its model in `backend/app/core/metadata.py` or Alembic autogenerate won't see it, and include the generated migration in your change.
- Runtime uses async SQLAlchemy (`sqlite+aiosqlite`); `config.py` derives the async URL from the plain sync URL that Alembic and tooling expect. Keep one source of truth for the DB location.
- `backend/app/main.py` is a thin app factory — wire cross-cutting concerns and mount routers there; real logic lives in modules.
- Don't swap documented stack choices (SQLite→Postgres, FastAPI→Flask, add full-DDD ceremony) without discussing first — the rejected alternatives are argued in `TECH_STACK.md` / `ARCHITECTURE.md`. v2 items (shared households, passkeys, bank sync, Postgres) are intentionally out of scope.

## Code Review Standards
After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.
