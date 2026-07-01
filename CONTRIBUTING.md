# Contributing to Saldo

Thanks for your interest in Saldo. It's built to be forked and improved by people
who have only read the two reference docs — so the bar is "clear to a newcomer",
not "clever".

Please read [`TECH_STACK.md`](TECH_STACK.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md)
first. Most obvious stack swaps were already considered and rejected there, with
reasons.

## Ground rules

- **Follow the documented stack and design.** Don't substitute a library (e.g.
  Postgres for SQLite, Flask for FastAPI) without opening an issue to discuss it
  first. Don't reintroduce full-DDD ceremony (repository interfaces, domain
  events, app-service passthrough layers) — see ARCHITECTURE.md.
- **Keep the domain core pure.** `backend/app/shared/domain` and
  `frontend/src/shared/domain` must not import a framework (FastAPI, SQLModel,
  React) or do I/O. They're the actual product; test them hard. The Python and
  TypeScript cores must agree — mirror any change and its tests on both sides.
- **User isolation is a security boundary.** Every backend query touching
  `Entry`, `Category`, or `WidgetLayout` data must be scoped by the authenticated
  user's id. An unscoped query on user data is a bug, full stop.
- **Offline-first is load-bearing.** Frontend writes go to Dexie first; syncing is
  a background concern that must never block the UI.
- **Keep the Spanish domain vocabulary** (`nomina`, `otros`, `gastos fijos`,
  `ahorro`) consistent across the API, the code, and the UI.

## Project layout

Code is organized **by feature, not by layer**. A change to categories lives in
`modules/budgeting/` on both sides — routes, models, and logic together. When you
add a backend table, import its model in `backend/app/core/metadata.py` so Alembic
autogenerate sees it.

## Development setup

See the "Local development" section of the [README](README.md#local-development-without-docker).

## Before you open a pull request

Run the checks locally — CI runs the same:

```bash
# Backend
cd backend && ruff check . && pytest

# Frontend
cd frontend && npm run typecheck && npm test
```

If you changed a compute formula, update the mirrored tests on both sides with the
same expected numbers. If you added a table, include the Alembic migration. If you
changed behavior, add a test that would have failed before.

## Commits & pull requests

- Use clear, conventional-commit-style messages (`feat:`, `fix:`, `docs:`,
  `chore:`), one logical change per commit.
- Describe what changed and why in the PR. Link any related issue.
- Update [`docs/PROGRESS.md`](docs/PROGRESS.md) if your change completes or alters
  a stage's scope.

## Reporting bugs / proposing features

Open an issue. For a bug, include steps to reproduce and what you expected. For a
feature, note whether it fits v1 or is one of the deliberately-deferred v2 items
(household/shared budgets, passkeys, automatic bank sync, a Postgres migration) —
those are out of scope for now by design.
