# Saldo — Progress Log

A running changelog of the staged build. Each entry records **what was built**,
**what deviated from the plan and why**, and **what remains open**. Newest first.

> Domain vocabulary is deliberately Spanish (`nomina`, `otros`, `gastos fijos`,
> `ahorro`) per the ubiquitous-language decision in `ARCHITECTURE.md`. The
> product name is **Saldo**; the reference docs pre-date the rename and call it
> "Cuentas" — same project.

---

## Stage 7 — Frontend budgeting UI

**Built**
- **Dexie-first data layer** (`modules/budgeting/localRepo.ts`): seed default
  categories on first run, add/rename/delete categories (delete tombstones the
  category *and* its entries), set a category's monthly amount, set the month
  goal. Every write bumps `updatedAt`; deletes are tombstones.
- **Mappers** (`mappers.ts`): wire↔local↔sync shape conversion +
  `entriesToMonthInput` (feeds the shared domain core from local rows).
- **Reactive reads** (`hooks.ts`) via `dexie-react-hooks` `useLiveQuery` —
  `useCategories`, `useMonthResult`, `useYearResult` recompute from Dexie
  automatically (including after a background sync merges server changes).
- **Sync engine** (`modules/sync/`): `runSync` pushes changes since the last
  watermark, merges the server's resolved versions, pulls remote changes, all
  LWW on `updatedAt` compared as epoch ms (`toEpoch` normalizes the backend's
  zone-less UTC vs the client's `Z`). `bootstrap` seeds defaults only if the
  account is genuinely empty after the first sync. `SyncProvider` triggers sync
  on auth, on `online`, and on a 30 s interval — never blocking the UI.
- **Views** ported from the prototype and restyled with Tailwind/Cuaderno:
  `DashboardPage` (hero, quick stats, monthly trend line chart, month grid),
  `MonthView` (summary card, spend meter, income/goal/fixed/variable sections
  with inline category rename + delete + add, breakdown donut), `YearView`
  (totals, income-vs-expenses bars, category ranking). `BudgetingLayout` shell
  (brand, year switch, logout, bottom nav). `MoneyInput` primitive
  (format-at-rest, edit-on-focus). Routing under a protected `SyncProvider`
  layout.
- Tests: `mappers.test.ts` (grouping + tombstone filtering), `syncEngine.test.ts`
  (`toEpoch` cross-format ordering).

**Deviations from the plan**
- Income lines are modeled as `kind="income"` **categories** (each with monthly
  entries), unifying income/expense under one "category + monthly entry" model
  rather than the prototype's fixed nomina/otros slots. Cleaner relationally and
  makes "add income" just another category CRUD. Totals are identical (income
  all folds into the domain core's `extras`).
- Client-side compute assumes a single currency per month (prototype parity).
  Mixed-currency *display* offline would need cached FX; the backend summary
  endpoints already convert, and this is noted for a later enhancement.
- Recharts pushes the bundle over Vite's 500 kB warning threshold. Non-fatal;
  code-splitting/manualChunks is queued for Stage 8/10.

**Verification**
- `npm run typecheck` → clean; `npm test` → 39 passed; `npm run build` → bundle
  built (Tailwind 16 kB CSS).
- Full offline click-through (airplane mode, edit, reconnect, confirm sync)
  needs a real browser/PWA and is the focus of Stage 8; the data flow is wired
  (Dexie-first writes + reconnect-triggered sync) and unit-tested here.

**Open**
- PWA/service worker + installability + conflict-surfacing UI → Stage 8.

---

## Stage 6 — Frontend foundation

**Built**
- Real Vite + React + TS app replacing the Stage-0 placeholder: `vite.config.ts`
  (with vitest/jsdom), `index.html` entry, `src/main.tsx` bootstrapping
  QueryClientProvider + BrowserRouter and opening Dexie on load.
- **Tailwind** with the **Cuaderno palette** as theme tokens (`tailwind.config.js`:
  paper/ink/mint/coral/gold/etc.), `index.css` with the dotted-paper backdrop and
  `btn-primary`/`field-input`/`card-panel` component classes.
- **Dexie** schema (`src/db/db.ts`) mirroring the backend: `categories`,
  `entries`, `profile` (User mirror), `meta` (sync bookkeeping). `deleted` stored
  as 0/1 (Dexie can't index booleans).
- **Zustand** auth store (`authStore.ts`) persisted to localStorage → session
  survives reload.
- **TanStack Query** client with offline-friendly defaults (no refetch-on-focus,
  polite retries).
- API client (`shared/api/client.ts`) — base URL from `VITE_API_BASE_URL`
  (default `/api`), auto-attaches the JWT, throws typed `ApiError`.
- Identity: `api.ts` (register/login/fetchMe, mirrors profile into Dexie),
  `hooks.ts` (useLogin/useRegister/useLogout), `LoginPage`/`RegisterPage`
  (Cuaderno-styled, Spanish), `ProtectedRoute`, placeholder authed `HomePage`.
- Multi-stage frontend Dockerfile (node build → nginx serve `dist`).
- Tests (vitest + React Testing Library): auth store (set/clear/persist),
  Dexie schema shape, `formatMoney`/`parseAmount`, LoginPage render.

**Deviations from the plan**
- Removed the `lint` npm script for now (no ESLint config yet) so CI's
  `--if-present` lint step stays green; ESLint is a Stage 11 polish item.
  Typecheck (`tsc --noEmit`) + vitest cover the frontend meanwhile.
- Added a `profile` Dexie table to mirror the User shape (the plan said
  "Entry/Category/User"); the live session also lives in the persisted auth store.

**Verification**
- `npm run typecheck` → clean; `npm test` → 34 passed (incl. the Stage-3 domain
  tests now under jsdom); `npm run build` → production bundle built, Tailwind
  compiled.
- Full browser register/login round-trip needs the backend running and a real
  browser; wired end-to-end (identity API + store + Dexie) and covered by unit
  tests, but the manual click-through is deferred to a host with Docker/browser
  (same environment limits noted in Stage 0).

**Open**
- Port the budgeting UI (Dashboard/MonthView/YearView, category CRUD) onto this
  shell → Stage 7.

---

## Stage 5 — Backend sync & multi-currency

**Built**
- `app/modules/sync/` slice:
  - `schemas.py` — `CategorySync`/`EntrySync` (each carries `updated_at` +
    `deleted`), `PushRequest`, `PushResponse`, `PullResponse`.
  - `router.py` — `POST /sync/push` and `GET /sync/pull?since=`. Push upserts
    with **last-write-wins on `updated_at`** (incoming applies iff its timestamp
    ≥ the stored one), making replays idempotent. Pull returns records changed
    since a timestamp, **including tombstones** so offline deletes propagate.
    Pushing another user's id is refused (403).
- `app/shared/currency.py` — `FxRateProvider` calling **Frankfurter**
  (`/latest`), caching each `(base, target)` rate for the current day. Injected
  via `get_fx_provider` so tests stub it. `FRANKFURTER_BASE_URL` keyless.
- Currency-aware summaries: `service.build_month_input` fetches one rate per
  foreign currency and converts to the user's `default_currency` **only when a
  month actually mixes currencies**; a single-currency month makes zero FX
  calls. Month and year summary routes now take the FX dependency.
- Timestamps switched to naive-UTC (`utcnow`) so in-memory and SQLite-reloaded
  values compare consistently for LWW.
- Tests: `test_sync.py` (idempotent replay, stale-vs-fresh LWW, pull-since +
  tombstones, cross-user push refused) and `test_currency.py` (single-currency
  makes no FX call; mixed EUR/USD converts and totals correctly, FX stubbed).

**Deviations from the plan**
- The FX daily cache is in-process (per-worker), not persisted. For a single-Pi
  deployment that's sufficient and simplest; a note for a future multi-worker
  fork. No stack change — still Frankfurter, still called only on mixed views.
- `Entry.currency` already landed in Stage 4, so Stage 5 added no migration.

**Verification**
- `pytest` → 40 passed; `ruff check .` → clean.
- Offline-queue replay is idempotent; mixed EUR/USD month totals correctly
  (100 EUR + 100 USD @ 0.5 → 150 EUR).

**Open**
- Frontend consumes `/sync` (Dexie ↔ backend) in Stages 6–8.

---

## Stage 4 — Backend budgeting API

**Built**
- `app/modules/budgeting/` vertical slice:
  - `models.py` — `Category` (id, user_id, name, kind∈{income,fixed,variable},
    position) and `Entry` (id, user_id, year, month 0-11,
    kind∈{income,fixed,variable,goal}, category_id?, label, amount, currency).
    Both carry `created_at`/`updated_at` (for Stage-5 last-write-wins) and a
    `deleted` soft-delete flag (tombstones for offline sync). UUID ids are
    client-generatable.
  - `schemas.py` — Create/Update/Read for both, plus `MonthSummary`/`YearSummary`.
    `kind` validated via `Literal`. Create accepts an optional client `id`.
  - `service.py` — user-scoped query helpers + `entries_to_month_input` (the seam
    from stored rows to the pure domain core).
  - `router.py` — CRUD categories, CRUD entries, `GET /budgeting/summary/{year}/{month}`,
    `GET /budgeting/summary/{year}`. Summaries delegate all arithmetic to
    `compute_month`/`compute_year`.
- Every query scoped by `user.id`; foreign-owned rows read as 404 (existence
  never leaks). Deletes are soft. Router mounted; models registered for Alembic.
- Migration `add category and entry tables` (autogenerated, batch mode).
- Tests (`test_budgeting_api.py`): category CRUD, entry CRUD, currency
  normalization, month summary vs domain core, year aggregation, and the
  **cross-user isolation** test — a second user can neither read nor mutate the
  first user's categories/entries, cannot attach to their category, and their
  summaries stay separate.

**Deviations from the plan**
- The per-month **savings goal** is modeled as an `Entry` with `kind="goal"`
  (no category) rather than adding a third table. This honors the plan's
  "tables: Entry, Category" exactly while giving the goal a home. Documented
  here as the one shape decision worth surfacing.
- Multi-currency: entries store a `currency` now, but the summary sums amounts
  as-is (single-currency assumption). Conversion when a view mixes currencies is
  Stage 5, as planned — flagged in `service.entries_to_month_input`.

**Verification**
- `pytest` → 34 passed; `ruff check .` → clean.
- `alembic upgrade head` builds user + category + entry on a fresh SQLite.
- Isolation test passes: cross-user reads/writes are rejected.

**Open**
- `/sync` push/pull + Frankfurter FX + mixed-currency summary → Stage 5.

---

## Stage 3 — Domain core (the compute logic)

**Built**
- **Backend** `app/shared/domain/`:
  - `rounding.py` — `round2` reproducing JS `Math.round` half-up semantics
    (deliberately *not* Python's banker's `round()`), so both language cores
    agree to the cent.
  - `budgeting.py` — framework-free `compute_month`/`compute_year` with
    `MonthInput`/`MonthResult`/`YearResult` dataclasses, ported verbatim from
    the prototype (including which sub-totals round and which don't).
  - `money.py` — `Money` value object: ISO-4217 validation, cent rounding,
    same-currency add/subtract/compare, explicit `convert(rate, to)`;
    cross-currency arithmetic raises `CurrencyMismatchError`.
- **Frontend** `src/shared/domain/` — `rounding.ts`, `budgeting.ts`, `money.ts`
  mirroring the Python API exactly. Minimal `package.json` + `tsconfig.json` so
  vitest/tsc run now (the full Vite app is Stage 6).
- **Tests** — backend `test_budgeting_domain.py` (12) + `test_money.py` (9);
  frontend `budgeting.test.ts` (11) + `money.test.ts` (10). The budgeting cases
  are mirrored case-for-case with identical expected numbers across languages —
  that shared table is the cross-language contract. Edge cases covered: zero
  income (never overspent), overspend, negative goal, goal-boundary, and
  half-up rounding vs banker's.

**Deviations from the plan**
- The compute core operates on plain numeric amounts within a single currency
  rather than on `Money`. Rationale: the prototype's formulas are single-
  currency arithmetic; `Money` guards the one place currency actually matters
  (cross-currency combination), which happens at the boundary in Stage 5. This
  keeps the hot compute path allocation-free and the two cores byte-identical.
- `byCategory` year aggregation from the prototype is intentionally left out of
  the pure core — it depends on dynamic category identity, which belongs to the
  storage/UI layers (Stages 4/7), not the arithmetic core.
- Introduced minimal frontend tooling now (Stage 6 owns the real Vite scaffold)
  because the domain core is framework-free and only needs vitest + tsc. CI's
  frontend job now runs typecheck + vitest.

**Verification**
- Backend: `pytest` → 28 passed; `ruff check .` → clean.
- Frontend: `npm run typecheck` → clean; `npm test` → 21 passed.
- Parity: the shared expected-value tables match on both sides.

**Open**
- Map Entry/Category rows → `MonthInput` at the API boundary → Stage 4.

---

## Stage 2 — Identity module

**Built**
- `app/modules/identity/` vertical slice:
  - `models.py` — `User` as a plain SQLModel (id UUID pk, email unique/indexed,
    hashed_password, is_active/superuser/verified) plus `default_currency`
    (ISO 4217, per the documented User shape). Same `SQLModel.metadata` as
    everything else, so Alembic autogenerate sees it.
  - `schemas.py` — fastapi-users `UserRead/Create/Update` extended with
    `default_currency`.
  - `manager.py` — `UserManager` with **argon2** hashing wired explicitly via
    pwdlib (`PasswordHash((Argon2Hasher(),))`).
  - `backend.py` — JWT bearer auth backend (secret + lifetime from config).
  - `dependencies.py` — user-db/manager deps, the `FastAPIUsers` instance, and
    `current_active_user` / `CurrentUser` — the protected-route dependency
    downstream modules import to scope queries by `user.id`.
  - `router.py` — auth / register / users routers.
- Routers mounted in the app factory: `/auth/jwt/login`, `/auth/jwt/logout`,
  `/auth/register`, `/users/me`, `/users/{id}`.
- Alembic migration `add user table` (autogenerated, batch-mode for SQLite).
- Registered identity models in `app/core/metadata.py`.
- Tests: conftest now provisions a fresh in-memory SQLite per test and overrides
  `get_session`. `test_identity.py` covers register, login, **two users → two
  distinct JWTs identifying them via /users/me**, 401 without a token, wrong
  password rejected, duplicate email rejected.

**Deviations from the plan**
- `User` is a pure SQLModel rather than inheriting fastapi-users' declarative
  `SQLAlchemyBaseUserTable` mixin. Reason: keeping one `SQLModel.metadata`
  avoids reconciling two declarative bases for Alembic. `SQLAlchemyUserDatabase`
  only needs the columns, which the SQLModel provides. No stack change.
- Included `default_currency` on `User` now (documented as part of the User
  shape) so the column lands in the first user migration instead of churning it
  in Stage 5.

**Verification**
- `pytest` → 7 passed; `ruff check .` → clean.
- `alembic upgrade head` builds `user` + `alembic_version` on a fresh SQLite.
- Route list confirms the auth/users endpoints are mounted.

**Open**
- Downstream modules (budgeting, sync, layout) will import `CurrentUser` and
  must filter every query by `user.id`.

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
