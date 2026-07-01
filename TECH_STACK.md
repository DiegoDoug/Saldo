# Tech Stack — Cuentas

An offline-first, self-hosted personal finance app. Manual entry, multi-user, multi-currency. Built to run on a Raspberry Pi and be forked by anyone.

This document lists what the app is built with and, more importantly, *why* — including the alternatives that got rejected. If you're contributing, read the "Rejected alternatives" section before proposing a swap; most of the obvious swaps were already considered.

---

## At a glance

| Layer | Choice |
|---|---|
| Frontend framework | React + Vite + TypeScript |
| Offline shell | vite-plugin-pwa (Workbox) |
| Local database | Dexie.js (IndexedDB) |
| Server-state sync | TanStack Query |
| Global UI state | Zustand |
| Drag-and-drop layout | dnd-kit |
| Styling | Tailwind CSS |
| Charts / icons | Recharts, lucide-react |
| Backend framework | FastAPI |
| ORM + migrations | SQLModel + Alembic |
| Database | SQLite |
| Auth | fastapi-users (email + password, argon2, JWT) |
| FX rates | Frankfurter API (daily, cached) |
| Remote access | Cloudflare Tunnel |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions → GHCR (arm64 + amd64) |
| Tests | Vitest + React Testing Library, pytest |

---

## Frontend

**React + Vite + TypeScript.** The existing `Presupuesto.tsx` is already React, and Vite gives fast builds plus a clean PWA story. TypeScript isn't optional for an app that does money math across currencies — a mistyped amount or a missing currency code is a real bug, not a style preference.

**vite-plugin-pwa (Workbox).** This is the piece that makes "offline-first" true rather than aspirational. It generates a service worker that caches the app shell, so the app *opens and runs* with no signal — not just "your data survives a refresh." Without it, offline means nothing.

**Dexie.js (IndexedDB).** Every write lands here first, instantly, regardless of connection. Dexie is the on-device source of truth. Plain IndexedDB works but its API is painful; Dexie is a thin, well-maintained wrapper that keeps queries readable.

**TanStack Query.** Owns the sync loop between Dexie and the backend: background refetch, retry-on-reconnect, stale handling. There's some conceptual overlap with Dexie (both "cache" data), and a smaller app could skip it — see the note in Rejected alternatives. Here it earns its place by handling the flaky-mobile-connection retries you'd otherwise hand-roll and get subtly wrong.

**Zustand.** Small global state: the auth session, the active theme. Redux would be overkill for two or three slices of state.

**dnd-kit.** Drag-to-reorder for the customizable dashboard. react-beautiful-dnd is deprecated; dnd-kit is the maintained choice with real accessibility support (keyboard reordering, screen-reader announcements).

**Tailwind CSS.** The current file ships one giant inline `<style>` block. That's fine for a single-file artifact and hostile to contributors. Tailwind moves styling into the markup where a new contributor can actually find and change it, and the palette in `Presupuesto.tsx` maps cleanly onto Tailwind theme tokens.

**Recharts + lucide-react.** Already in use, already good. No reason to churn them.

---

## Backend

**FastAPI.** Async, Pydantic validation on every request, and an auto-generated OpenAPI page for free — which matters for an open-source API people will want to poke at before they trust it with their finances. It also matches the JobRadar stack, so there's one less context switch.

**SQLModel + Alembic.** SQLModel puts Pydantic models and SQLAlchemy tables in one definition, which cuts the boilerplate. Alembic handles schema migrations so upgrading a running instance doesn't mean hand-editing the database.

**SQLite.** The right call, not a compromise. One household's manual budget entries is a tiny dataset; a Pi doesn't need a Postgres process eating RAM to serve it. SQLite is a single file — trivial to back up, trivial to move. If someone forks this to run a hundred households, they can point SQLModel at Postgres by changing a connection string, and the migration path is clean.

**fastapi-users.** Don't hand-roll auth for an app holding financial data. This gives registration, argon2 password hashing, and JWT sessions out of the box, audited by more eyes than a solo project can manage.

**Frankfurter (FX rates).** Free, no API key, sourced from European Central Bank reference rates. The app only calls it when a user actually mixes currencies in one view, and caches the daily rate — so most users never trigger a single request.

---

## Data model (shape, not schema)

- **User** — fully isolated. Own entries, own dashboard layout, own default currency. No shared state between users in v1.
- **Entry** — an income or expense line: amount, ISO 4217 currency code, category, month, year.
- **Category** — per-user, CRUD-able (the dynamic categories already in the app).
- **WidgetLayout** — one row per user: a JSON blob describing which dashboard widgets show, where, and at what size.

Multi-currency is stored at the entry level (amount + currency code), converted only for display when a user mixes currencies. A household grouping — several users sharing one budget — is a clean v2 addition and deliberately left out of v1.

---

## Infrastructure

**Cloudflare Tunnel.** Reaches the Pi from anywhere without port forwarding, without exposing your home IP, and without managing TLS certificates by hand. Runs as its own container next to the app. For a home-hosted service this is safer and simpler than opening a port on your router.

**Docker + Docker Compose.** Three services:

- `frontend` — nginx serving the built Vite bundle
- `backend` — uvicorn running FastAPI
- `cloudflared` — the tunnel

A named volume holds the SQLite file so it survives container rebuilds. `docker compose up` on a fresh Pi should be the entire install.

**GitHub Actions → GHCR.** Build and test on push. Multi-arch image builds via buildx: arm64 for your Pi, amd64 for everyone else self-hosting on a NAS or VPS. Publish to the GitHub Container Registry so a fork can pull a working image instead of building from source.

---

## Testing

- **Frontend:** Vitest + React Testing Library — component behavior and the money/currency utility functions, which are the highest-risk code in the app.
- **Backend:** pytest — auth flows, sync endpoints, and the aggregation math.

The compute functions (`computeMonth`, `computeYear`) are pure and framework-free. Test them hard; they're the actual product.

---

## Operational note: back up the SQLite file

A Pi's SD card is a single point of failure for a year of financial history. Add a cron job that copies the SQLite file off-device nightly — Backblaze B2 or any S3-compatible bucket is a few cents a month. This isn't optional for financial data; it's the difference between a corrupted card being an annoyance and being a disaster.

---

## Rejected alternatives

**Flask/Jinja server-rendered frontend.** Server-rendered HTML needs a live request to produce a page, which is the opposite of offline-first. The UI has to already be running client-side, reading IndexedDB with zero network. Flask as a *backend API* would have been fine; Flask as the *frontend* breaks the core requirement.

**Full DDD / heavy backend architecture.** The domain is arithmetic over a handful of entities. See `ARCHITECTURE.md` for the full argument — short version: the ceremony would raise the contribution barrier without protecting any real invariant.

**Postgres from day one.** Solves a scale problem this app doesn't have. SQLite covers single-household use completely, and the swap to Postgres is a connection-string change if a fork ever needs it.

**Dropping TanStack Query, syncing manually from Dexie.** Defensible, and a leaner app could do it. The retry-on-reconnect and background-refetch logic you'd write by hand is exactly the stuff that breaks quietly on mobile data. Keeping TanStack Query trades a dependency for not owning that bug class.

**Tailscale instead of Cloudflare Tunnel.** Tailscale is great, but it requires installing a client on every device you want access from. You asked for a plain public URL reachable from mobile data; Cloudflare Tunnel gives that with nothing to install on the phone.

**Passkeys/WebAuthn instead of email + password.** Better security, more setup friction for a first release and for anyone forking it. Email + password ships now; passkeys are a reasonable later addition once the app is stable.
