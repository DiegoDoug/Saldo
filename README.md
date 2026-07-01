# Saldo

**Offline-first, self-hosted personal finance.** Manual entry, multi-user,
multi-currency. Built to run on a Raspberry Pi and be forked by anyone.

Saldo is a rebuild of a single-file budgeting prototype
(`reference/Presupuesto.tsx`) into a proper, contributable application. The
domain speaks Spanish by design — `nomina` (payroll), `otros` (other income),
`gastos fijos` / `gastos variables` (fixed / variable expenses), `ahorro`
(savings) — the vocabulary of the spreadsheet it grew from.

> **Status:** early staged build. See [`docs/PROGRESS.md`](docs/PROGRESS.md) for
> the current stage and changelog.

---

## Architecture at a glance

- **Frontend** — React + Vite + TypeScript, offline-first via a service worker
  (vite-plugin-pwa). Every write lands in **Dexie (IndexedDB)** first;
  **TanStack Query** reconciles with the backend in the background.
- **Backend** — **FastAPI** + **SQLModel** + **SQLite**, a modular monolith with
  a pure, framework-free domain core (`computeMonth` / `computeYear`) and a
  currency-aware `Money` value object.
- **Auth** — email + password (argon2, JWT) via fastapi-users. Every query
  touching user data is scoped by the authenticated user's id.
- **Infra** — Docker Compose (nginx + uvicorn + Cloudflare Tunnel), a named
  volume for the SQLite file, multi-arch images published to GHCR.

The full reasoning — including which alternatives were rejected and why — lives
in [`TECH_STACK.md`](TECH_STACK.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).
Read those two before proposing a stack change.

---

## Quick start (local, Docker)

```bash
cp .env.example .env        # then edit SALDO_JWT_SECRET at minimum
docker compose up --build
```

- Frontend: <http://localhost:8080>
- Backend API + docs: <http://localhost:8000> · <http://localhost:8000/docs>

The `cloudflared` service idles harmlessly until you set
`CLOUDFLARE_TUNNEL_TOKEN` — local dev needs no tunnel.

## Repository layout

```
saldo/
├── backend/        FastAPI app (modular monolith)
├── frontend/       Vite + React + TS app
├── reference/      Presupuesto.tsx — the original prototype (source of truth)
├── docs/           PROGRESS.md and other project docs
├── TECH_STACK.md   Stack decisions and rejected alternatives
├── ARCHITECTURE.md Modular-monolith / DDD-lite design record
└── docker-compose.yml
```

## Development

Backend and frontend each have their own toolchains; see the READMEs inside
`backend/` and `frontend/` (added as those stages land). CI runs lint + tests
for both on every push.

## License

[MIT](LICENSE).
