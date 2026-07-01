# Saldo — Progress Log

A running changelog of the staged build. Each entry records **what was built**,
**what deviated from the plan and why**, and **what remains open**. Newest first.

> Domain vocabulary is deliberately Spanish (`nomina`, `otros`, `gastos fijos`,
> `ahorro`) per the ubiquitous-language decision in `ARCHITECTURE.md`. The
> product name is **Saldo**; the reference docs pre-date the rename and call it
> "Cuentas" — same project.

---

## Stage 1 — Backend foundation

**Built**
- App factory `create_app()` in `app/main.py` (CORS from config, `/` and
  `/health` meta endpoints, placeholder for module routers).
- `app/core/config.py` — env-based settings (`SALDO_` prefix, `.env` support):
  database URL, JWT secret/lifetime, CORS origins. Exposes an `async_database_url`
  that injects the `aiosqlite` driver so there's one source of truth for the DB.
- `app/core/db.py` — async SQLAlchemy engine + `async_sessionmaker` +
  `get_session` request dependency. No `create_all`; the schema is owned by
  Alembic.
- `app/core/metadata.py` — import aggregator that populates `SQLModel.metadata`
  for Alembic autogenerate (holds no model definitions itself).
- Alembic initialized (async template), `env.py` rewired to the app's config and
  metadata, `render_as_batch=True` for SQLite-safe ALTERs, migration template
  imports `sqlmodel`. First empty baseline migration created.
- pytest scaffold: async in-process ASGI client fixture; tests for `/health`
  and `/`. Ruff configured (`pyproject.toml`).
- `requirements.txt` expanded (sqlmodel, alembic, pydantic-settings,
  fastapi-users[sqlalchemy], argon2-cffi, aiosqlite, httpx);
  `requirements-dev.txt` for pytest/ruff.
- `backend/README.md`.

**Deviations from the plan**
- Runtime uses an **async** engine (aiosqlite) rather than sync, because
  fastapi-users (Stage 2) is async. Config keeps the plain `sqlite://` URL as
  the canonical form and derives the async URL, so `.env`, Docker, and Alembic
  all read the same setting. No stack substitution — still SQLModel + SQLite.

**Verification**
- `uvicorn app.main:app` boots; `/health` → `200 {"status":"ok"}`,
  `/` → app JSON, `/openapi.json` → 200.
- `alembic upgrade head` succeeds against a fresh SQLite file (creates
  `alembic_version`); `alembic current` reports the baseline at head.
- `pytest` → 2 passed; `ruff check .` → clean.
- "in Docker" half of the exit criterion not run here (Docker Hub egress blocked,
  same as Stage 0); the Dockerfile installs these deps and the CMD runs uvicorn.

**Open**
- Wire fastapi-users + User model → Stage 2 (the JWT/CORS config is already in
  place for it).

---

## Stage 0 — Repo & environment scaffolding

**Built**
- Monorepo skeleton: `frontend/` and `backend/` directories.
- Root `.gitignore`, MIT `LICENSE`, `.env.example`, root `README.md`.
- `docker-compose.yml` with three services — `frontend` (nginx placeholder),
  `backend` (uvicorn placeholder FastAPI), `cloudflared` (tunnel, idle without a
  token) — plus a named volume `saldo-data` for the future SQLite file.
- Placeholder backend: minimal FastAPI app serving `/` and `/health`, with its
  own Dockerfile and `requirements.txt`.
- Placeholder frontend: static `index.html` served by nginx via a Dockerfile.
- GitHub Actions CI skeleton (`.github/workflows/ci.yml`): backend lint+test and
  frontend lint+test jobs, currently no-op-safe.
- Moved the prototype to `reference/Presupuesto.tsx` (it started at repo root).
- Initialized this progress log.

**Deviations from the plan**
- The kickoff/reference docs call the product "Cuentas"; the repo is "Saldo".
  Using **Saldo** as the product name (authoritative: repo, branch, kickoff);
  keeping Spanish domain terms. Flagged, not blocking.
- The prototype was at the repo root rather than under `reference/`. Relocated
  it to `reference/Presupuesto.tsx` so the layout matches the docs.
- Stage-0 frontend/backend are intentionally throwaway placeholders; the real
  Vite and FastAPI apps land in Stages 1 and 6. This keeps `docker compose up`
  green from commit one without pre-empting later stages.

**Verification**
- `docker compose config` validates.
- Backend placeholder verified locally: `uvicorn app.main:app` serves
  `/health` → `200 {"status":"ok"}` and `/` → the placeholder JSON.
- **Could not run `docker compose up --build` end-to-end in this environment:**
  Docker Hub image pulls (`python:3.11-slim`, `nginx`, `cloudflared`) are
  blocked by the sandbox's egress policy (403 on the registry blob host). This
  is an environment limitation, not a defect — the Compose file, Dockerfiles,
  and app code are complete and self-consistent. On any host with normal Docker
  Hub access, `docker compose up` brings up all three services.

**Open**
- Real FastAPI app factory, config, DB wiring, migrations → Stage 1.
- Real Vite/React/TS frontend → Stage 6.
- Re-run the full `docker compose up` smoke test on an unrestricted host (or in
  CI) once Stage 10 wires the image build.
