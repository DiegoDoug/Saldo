# Saldo Transformation — Document 1: Architecture Review

**Status:** Complete — awaiting confirmation before Document 2 (Product Vision)
**Scope:** Full-repository review of Saldo as inherited: every module, migration, test, workflow, and document.
**Verified against a live run:** backend `pytest` → 102 passed; frontend `tsc --noEmit` clean, `vitest` → 89 passed (24 files). The repo is green as delivered.

---

## 1. What we inherited

Saldo is an offline-first, self-hosted personal finance app: React/Vite/TS PWA + FastAPI/SQLModel/SQLite, built in 12 documented stages (`docs/PROGRESS.md`) from a single-file prototype (`reference/Presupuesto.tsx`), then expanded in two large follow-on efforts:

1. **The original product** — Spanish-vocabulary envelope budgeting (`nomina`, `otros`, `gastos fijos/variables`, `ahorro`) over `Category` + `Entry`, with a pure, mirrored Python/TS compute core (`compute_month`/`compute_year`), a customizable widget dashboard, and Dexie↔SQLite last-write-wins sync.
2. **The "finance platform" expansion** (PRs #9–#10) — Accounts, Transactions, Merchants, Recurring rules/Bills, Goals, Assets/Liabilities/Net worth, Reports, Forecast: eight new backend modules, eight new frontend modules, seven Dexie schema versions, nine Alembic migrations, all folded into the same sync envelope.
3. **Auth polish** (PRs #11–#12) — password reset over SMTP, with Stalwart/Mailpit reference setups.

Deployment is Docker Compose (nginx + uvicorn + cloudflared) targeted at a Raspberry Pi, with multi-arch GHCR images from CI and an S3 backup script.

### Architectural philosophy (as documented and as practiced)

`ARCHITECTURE.md` and `TECH_STACK.md` are genuine decision records, not aspirational docs: modular monolith, "DDD-lite" (pure domain core + `Money` value object + ubiquitous language; explicitly rejects aggregates/repositories/domain events, with reasoning), feature-sliced folders on both sides, SQLite on purpose, LWW sync on purpose. The code actually follows these documents — which is rarer than it should be.

---

## 2. Strengths — what deserves to exist

These should be preserved through any transformation:

1. **The mirrored, framework-free domain core.** `backend/app/shared/domain/` and `frontend/src/shared/domain/` implement identical arithmetic (budgeting, goals, net worth, recurring, reports, forecast, rounding, `Money`) and are tested against the *same expected numbers* on both sides, including deliberate reproduction of JS `Math.round` half-up semantics in Python. This cross-language contract is the most valuable engineering asset in the repo.
2. **Real offline-first, not aspirational.** Every write lands in Dexie first; the PWA shell is precached; sync is background-only, idempotent on replay, tombstone-aware, and never blocks the UI. The naive-UTC vs `Z` timestamp gotcha is understood and handled once (`toEpoch`).
3. **User-isolation discipline.** Every query on user data is `user_id`-scoped; cross-user reads 404 (existence never leaks); cross-user pushes 403; and there are explicit isolation tests per module. The security invariant is written down and enforced in tests.
4. **Consistent vertical slices.** Ten backend modules and their frontend mirrors all follow the same shape (`models/schemas/router/service`, `localRepo/mappers/hooks/Page`). A contributor can learn one module and navigate all of them.
5. **Operational sanity.** Alembic owns the schema (no runtime `create_all`), one revision per table, self-migrating container entrypoint, healthchecks, compose that degrades gracefully without a tunnel token, backup script using `sqlite3 .backup`, multi-arch CI images.
6. **Documentation culture.** `PROGRESS.md` records what was built, what deviated, and why — per stage, with verification notes. This is the standard the rest of the transformation should be held to.
7. **Green, honest test suites.** 191 tests across both halves, weighted toward the domain core and API security scoping, all passing on a fresh clone.

---

## 3. The central architectural problem: two products in one app

This is the single most important finding, and every other product decision downstream depends on resolving it.

Saldo currently contains **two parallel, disconnected financial models**:

| | Legacy budgeting model | New ledger model |
|---|---|---|
| Tables | `Category`, `Entry` (year/month buckets, kind ∈ income/fixed/variable/goal) | `Account`, `Transaction`, `Merchant`, `RecurringRule` |
| Powers | Dashboard hero/stats, Month view, Year view — the screens in the README screenshots | Transactions, Accounts, Bills, Reports, Forecast pages |
| Math | `compute_month` / `compute_year` | `reports.py` / `forecast.py` domain cores |

The two never meet. A user who logs their groceries as a transaction sees **zero effect** on their month budget; to keep the budget accurate they must enter the same expense twice, in two different mental models, on two different screens. Reports say one thing about a month; the Month view says another. `FINANCE_ARCHITECTURE.md` acknowledges this ("a later, optional slice can derive budget actuals from transactions") but the bridge was never built.

This is not a code-quality issue — both halves are individually well-built. It is a **product coherence failure**: the app as shipped is a budgeting app and a ledger app sharing a login. The transformation's first structural decision must be to unify on the transaction ledger as the single source of financial truth, with budgets *derived* from it (the industry-standard model: YNAB, Monarch, Copilot all budget against transactions). The prototype-faithful `Entry` model becomes a migration source, not a peer system.

---

## 4. Weaknesses and technical debt

### 4.1 Correctness

- **Money is stored as IEEE-754 floats.** `amount: float` on every table, every wire schema, every Dexie row. The `Money` value object exists precisely because currency math is the one real invariant — and then the entire persistence layer ignores it. Float accumulation across thousands of ledger rows *will* produce cent-level drift, the class of bug users of a finance app forgive least. The industry answer is integer minor units (cents) end-to-end, converting only at the display edge. This is a breaking schema + wire + Dexie migration and gets more expensive every month it waits. **Highest-severity correctness item in the repo.**
- **LWW on client-generated wall-clock timestamps.** A device with a skewed clock silently and permanently clobbers good data on every sync, or has its own writes silently discarded. There is no versioning, no hybrid logical clock, no server authority. Conflicts are *counted* ("N cambios se actualizaron desde otro dispositivo") but not inspectable or recoverable. Acceptable for the original one-household scope; not acceptable for a product carrying years of financial history.
- **Sync is not atomic anywhere.** The server-side push commits all tables in one session (good), but the client merges pushed/pulled records table-by-table with individual `put`s and only then advances the watermark. A crash or tab close mid-merge leaves Dexie partially merged with an unadvanced watermark — recoverable by re-pull, but only by accident of idempotency, and `useLiveQuery` consumers render half-merged states meanwhile. Dexie transactions exist and are already used for seeding; the merge should run inside one.
- **Recurring rules don't run themselves.** Materialization is an explicit endpoint (`POST /recurring/{id}/materialize`); there is no scheduler, no background job infrastructure at all. "Bills" is therefore a list of intentions, not automation — rent never posts unless the user comes and pushes the button, which is the opposite of what recurring rules are for.

### 4.2 Security

The stated posture ("it's financial data") outruns the implementation:

- **Shared-device data leak (confirmed, high severity).** Logout clears only the Zustand auth store (`hooks.ts:37`); the Dexie database — the user's *entire financial history* — and the sync watermark survive. Consequences: (a) anyone with the browser afterwards can read the data straight out of IndexedDB; (b) if a **different** user logs in on the same browser, they see the previous user's data rendered as their own, and `bootstrap()` pushes the previous user's records to *their* account — the server's 403 then wedges sync permanently for that device. The per-user scoping so carefully enforced on the server does not exist on the client. Fix requires per-user local databases (or wipe-on-logout) and is not optional.
- **JWTs: 7-day lifetime, no revocation, stored in localStorage.** `/auth/jwt/logout` on a stateless JWTStrategy revokes nothing; a leaked token is valid for a week. localStorage persistence (Zustand `persist`) means any XSS exfiltrates a week-long credential. No refresh-token rotation, no session listing.
- **No brute-force defense.** No rate limiting on login/register/reset-password, no account lockout, no CAPTCHA-equivalent, no 2FA/passkeys (passkeys are documented as deferred; rate limiting shouldn't have been).
- **Weak-secret footgun.** `SALDO_JWT_SECRET` defaults to `change-me-in-production` and the app starts happily with it. One `if secret == default and not debug: refuse to boot` would eliminate the most likely real-world compromise of a self-hosted instance.
- **No security headers.** nginx serves the SPA with no CSP, no `X-Content-Type-Options`, no `Referrer-Policy`, no HSTS (partially mitigated behind Cloudflare, but the compose file also publishes :8080 and :8000 directly).
- **No audit trail** of logins or destructive actions; no structured logging at all on the backend beyond uvicorn defaults — a self-hoster who suspects compromise has nothing to inspect.

None of these are exotic; all are table stakes for the "suitable for sensitive financial information" bar the transformation targets.

### 4.3 Scalability (within the product's own ambitions)

The stated scope is one household on a Pi, but the *new* feature set (a full transaction ledger accumulating for years) breaks the original assumptions:

- **Full-table sync.** Every 30-second sync pass calls `.toArray()` on all ten Dexie tables to find dirty rows, and a first pull (or `since=None`) streams the **entire account history** in one unpaginated JSON response. At 10k transactions this is noticeable; at 50k it is a multi-second, memory-hungry stall on a phone — on every fresh device login.
- **Per-row upserts.** `/sync/push` does a `session.get` + update per record — N round-trips per batch instead of bulk operations.
- **Balances computed in Python.** `account_deltas` loads *every non-deleted transaction* into Python objects and sums in a loop, on each balances request. This is one `GROUP BY` away from being O(accounts) instead of O(all history).
- **Tag search by serialized-JSON `LIKE`.** `cast(tags AS TEXT) LIKE '%"tag"%'` — fragile (quote/escape collisions) and unindexable. SQLite's JSON1 exists.
- **FX cache is per-process, per-day, in-memory** — fine for one Pi worker, documented as such; becomes a correctness issue the moment anyone runs >1 worker.

None of this needs Postgres or microservices. It needs pagination, dirty-flags (or a per-row `synced` marker) instead of full scans, SQL aggregation, and bulk upserts — SQLite-compatible fixes that preserve the deployment story.

### 4.4 Code quality & duplication

- **The sync layer is the same code ten times.** `sync/router.py` (473 lines) contains a generic `_upsert_generic` used for exactly three tables, alongside five hand-rolled copies of the identical LWW upsert; `syncEngine.ts` (360 lines) has ten copy-pasted `mergeX` functions and a ten-way `changedSince`/`countConflicts` fan-out. Adding table #11 means touching ~8 places on each side. This should be one registry-driven mechanism per side; the envelope convention (`id/user_id/created_at/updated_at/deleted`) already makes every table shape-identical for sync purposes.
- **CRUD routers repeat the same ownership/404/soft-delete choreography per module** — tolerable at 3 modules, noise at 10.
- **Frontend pages are monolithic** (`NetWorthPage` 337 lines, `MonthView` 326, `TransactionsPage` 293) — page + forms + list + dialogs in one file, contrary to the repo's own 30-line-function review standard.
- **No ESLint/Prettier.** The lint script was removed in Stage 6 as a "Stage 11 polish item" and never returned; CI's frontend lint step is a silent no-op (`--if-present`). Type-checking is the only style gate.
- **`any` discipline is good** (no gratuitous `any` found); typing overall is strong.

### 4.5 Testing gaps

Strong: domain cores (mirrored tables), API security scoping, sync LWW semantics, mappers. Missing:

- **Zero end-to-end tests.** Playwright is installed and driven — but only by the screenshot script. The flagship claim ("airplane mode: edit, reconnect, sync") has never been executed by CI; PROGRESS.md itself repeatedly defers "the manual click-through". The most differentiating behavior of the product is its least-tested.
- **No component tests beyond auth pages** — the eight finance pages have no render/interaction tests.
- **No migration round-trip test, no coverage reporting, no load/volume test** for the sync path (the scalability issues above would have surfaced immediately).

### 4.6 Product maturity gaps

Measured against the commercial bar (Monarch, Copilot, YNAB — full analysis in Document 2):

- **No onboarding** — a new user lands on an empty dashboard with seeded Spanish categories and no guidance.
- **No CSV/OFX import and no export of any kind.** For a *manual-entry* product this is existential: nobody re-types five years of bank history, and self-hosters specifically demand data egress. Also a GDPR-readiness gap (no export, no account deletion flow).
- **No `/settings` page** (route is documented as planned; users can't change currency, email, password-while-logged-in, or delete their account from the UI).
- **Hardcoded Spanish UI with no i18n layer.** The *domain* vocabulary being Spanish is a documented identity decision; the entire *UI* being untranslatable is not — it caps the addressable audience of an open-source product whose README courts forks, and conflates two different decisions.
- **Search, notifications, budgets-per-category (as limits with progress), subscription detection, debt paydown planning: absent** — several are cheap given data already in the schema.
- **Accessibility** is better than typical (dnd-kit keyboard reordering, semantic buttons) but unaudited: no skip links, unverified contrast on the three themes, no reduced-motion handling, charts have no text alternatives.

### 4.7 Repository health & DX

- **Docs have drifted from the code.** README/ARCHITECTURE/CLAUDE.md still describe the four-module app (`identity, budgeting, layout, sync`); the codebase has ten modules. `ARCHITECTURE.md` still titles the project "Cuentas". Worst: `FINANCE_ARCHITECTURE.md` ends with literal `</content></invoke>` tags — an AI-tooling paste artifact committed to `main`, in the doc that defines the platform's data model. Small thing, bad signal.
- **DX is otherwise good**: one-command setup on each side, fast suites (backend ~40s, frontend ~10s), `.env.example` is exemplary, compose degrades gracefully. Missing: seed-data command, pre-commit hooks, ESLint, a `make`/task runner unifying the two halves, and any contributor-visible roadmap now that PROGRESS.md declares "all stages complete".

---

## 5. Assessment summary

| Dimension | Grade | One-line justification |
|---|---|---|
| Domain core & correctness of formulas | A− | Mirrored, tested, faithful; undermined only by float storage |
| Offline-first architecture | B+ | Real and working; sync scaling + atomicity + clock-LWW are debt |
| Server-side security boundary | A− | Scoped and tested everywhere |
| Client-side security | D | Shared-device leak, localStorage JWTs, no revocation |
| Auth hardening | C− | No rate limit, weak-secret default, week-long tokens |
| Product coherence | C− | Two disconnected financial models |
| Code quality | B− | Consistent and typed, but heavy sync duplication, no linter |
| Testing | B− | Excellent unit/API layers; zero E2E for an offline-first product |
| Scalability (own ambitions) | C | Full-table sync and in-Python aggregation won't survive a real ledger |
| Docs & decision records | B+ | Outstanding culture, now stale |
| Product maturity vs. market | C− | No import/export, onboarding, settings, notifications, i18n |

**Overall: a genuinely well-engineered foundation (top-decile for a project of this age) carrying one product-level fork it must resolve, one data-representation landmine, and a client-side security model that hasn't caught up with the "financial data" ambition.** Nothing here argues for a rewrite; almost everything argues for a deliberate consolidation.

---

## 6. The most important architectural issues (ranked)

1. **Unify the two financial models.** Make the transaction ledger the single source of truth; derive budgets from it; migrate `Entry` data in; retire dual entry. Every other product decision blocks on this.
2. **Move money off floats** to integer minor units across DB, wire, Dexie, and both domain cores — while the dataset is still small enough to migrate cheaply.
3. **Fix the client-side security model:** per-user local databases (or wipe on logout), move tokens out of localStorage, short-lived access + refresh rotation, real logout.
4. **Re-architect sync for scale and safety:** dirty-tracking instead of full-table scans, paginated pull, bulk upserts, atomic client merge, server-authoritative or hybrid-logical-clock conflict resolution with a user-visible conflict log — and collapse the 10× duplicated upsert/merge code into one registry-driven mechanism per side.
5. **Add the missing automation substrate:** a background scheduler (in-process is fine on a Pi) so recurring rules post themselves; this is also the hook for notifications, snapshot generation, and FX refresh.
6. **Harden auth to financial-app baseline:** rate limiting, refuse-to-boot on default secret, security headers, audit log, 2FA/passkeys on the roadmap.
7. **Close the existential product gaps:** CSV import/export first (it unlocks adoption *and* GDPR posture), then onboarding, settings, and an i18n layer that keeps the Spanish domain identity while unlocking the UI.
8. **Make the flagship promise testable:** a Playwright E2E suite that actually runs the offline → edit → reconnect → reconcile loop in CI, plus ESLint and coverage gates.
9. **Restore documentation truth:** update README/ARCHITECTURE/CLAUDE.md to the ten-module reality, remove the paste artifact, and re-establish PROGRESS.md discipline for the transformation itself.

Items 1–3 are the load-bearing decisions; they should be settled before any new feature work. Items 4–5 are the platform investments that make everything after them cheaper. Items 6–9 can proceed in parallel slices.

---

**STOP.** This concludes Document 1. On confirmation, Document 2 — Product Vision — will define mission, personas, competitive positioning against Monarch/Copilot/YNAB/Lunch Money, differentiators (the offline-first + self-hosted + data-sovereignty wedge none of the commercial products can copy), North Star Metric, and the staged product roadmap, building directly on the consolidation decisions above.
