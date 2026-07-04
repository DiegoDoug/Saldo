# Saldo Transformation — Document 4: Data Model & System Architecture

**Status:** Complete — awaiting confirmation before Document 5 (Technical Roadmap)
**Builds on:** Documents 1–3. This document specifies *what the system becomes*; sequencing and migration mechanics are Documents 5–6.

Standing decisions carried in from Document 1: modular monolith stays; SQLite stays (Postgres remains a fork's connection-string choice); FastAPI/SQLModel/React/Dexie stay; vertical slices stay; the mirrored domain core stays sacred. This document changes the **data representation, the sync protocol, the auth/session model, and adds the missing platform substrate** (scheduler, observability). It deliberately does not swap stack pieces — the rejected-alternatives discipline of `TECH_STACK.md` continues to hold.

---

## 1. Data model

### 1.1 Money representation (global change)

All monetary amounts become **integer minor units** (`amount_minor: int`, cents) with an ISO-4217 `currency` alongside, end-to-end: SQLite columns, wire schemas, Dexie rows, and both domain cores. The `Money` value object becomes the *only* constructor of display values; floats exist solely at the formatting edge. Rules:

- Currencies with non-2 exponents (JPY=0, BHD=3) resolved via a small exponent table in `shared/domain` (both languages, same table, same tests).
- The domain cores' rounding quirks (`round2`, half-up) are re-expressed over minor units; the cross-language expected-number test tables are regenerated once, reviewed against `reference/Presupuesto.tsx`, and frozen again.
- Percentages/rates (interest, FX) stay decimal-as-float in transit but are applied via banker-safe integer math in the cores.

### 1.2 The unified financial model

The `Transaction` ledger becomes the single source of financial truth. The legacy budgeting pair is repurposed, not deleted:

- **`Category` stays** (it already serves both systems) and gains `kind ∈ income | expense` (collapsing fixed/variable into a `group` label — "fijo"/"variable" become reporting groups, preserving the vocabulary without hardwiring it into arithmetic), plus `icon`, `color`, `archived`.
- **`Entry` is retired as a live table.** A one-time migration converts entries to transactions (income entries → income transactions on a designated default account; expense entries → expense transactions dated mid-month) and per-month goals → `budget_month.savings_goal_minor`. The table is kept read-only for one release as an audit trail, then dropped.
- **New: `budget_month`** — `(id, user_id, year, month, savings_goal_minor, currency, envelope)` where budgeting *plans* live.
- **New: `budget_envelope`** — `(id, user_id, category_id, year, month, limit_minor)` — per-category monthly limits. *Spent* is never stored; it is always `Σ transactions(category, month)` — the no-second-source-of-truth rule from Document 2, structurally enforced.
- `compute_month`/`compute_year` survive intact conceptually: their inputs are now assembled from transactions + envelopes instead of entries; `nomina`/`otros` map to income categories. The pure cores gain nothing framework-y; only the assembly seam (`service.build_month_input`) changes.

### 1.3 Full entity inventory (target state)

Every syncable table keeps the proven envelope: `id (UUIDv7 — see §2), user_id (indexed), created_at, updated_at, deleted`.

| Entity | Fate | Key fields / notes |
|---|---|---|
| `user` | extended | + `locale`, `is_totp_enabled` (v2), `deleted_at` (GDPR account deletion) |
| `account` | kept | amounts → minor units; + `include_in_networth: bool` |
| `transaction` | **spine** | minor units; + `splits` (child rows, below); FK `merchant_id`/`recurring_id` constraints added now that the tables exist (Document 1 noted they were deferred) |
| `transaction_split` | new (v2-ready, ships schema-only first) | `(transaction_id, category_id, amount_minor, notes)` — split transactions, the most-requested ledger feature everywhere |
| `category` | reshaped | see §1.2 |
| `budget_month` / `budget_envelope` | new | see §1.2 |
| `entry` | retired | migrated → transactions/budget_month, then dropped |
| `merchant` | kept | + `aliases: JSON` (import matching), auto-created on capture |
| `recurring_rule` | kept | + `last_posted`, `reminder_days`; posting moves to the scheduler (§5) |
| `goal` | kept | minor units; `current_amount` optionally linked to a savings `account_id` so progress can derive from the ledger |
| `asset` / `liability` | kept | minor units; + `valuation_date` (staleness prompts, Document 3 monthly-close journey) |
| `net_worth_snapshot` | kept | now **written by the scheduler** monthly + on demand |
| `attachment` | new (v2) | receipt images: content-addressed blobs on the server volume, metadata row in sync; explicitly *not* synced to Dexie by default (size) |
| `automation_rule` | new (v3 schema reserved) | "if merchant/amount/description matches → set category/tags" — the pre-AI categorization engine and later the AI-suggestion target |
| `audit_log` | new, **server-only** | append-only: auth events, destructive ops, sync anomalies; never synced down |
| `fx_rate` | new, server-side cache table | `(date, base, quote, rate)` — replaces the per-process dict; enables offline mixed-currency display via sync-down of recent rates |
| `widget_layout` | kept as-is | the JSON-blob LWW model is fine for what it is |

Indexes: composite `(user_id, updated_at)` on every syncable table (the sync scan), `(user_id, date)` and `(user_id, category_id, date)` on `transaction` (budget aggregation), partial-equivalent `deleted` indexes as today. Tags move from JSON-LIKE matching to a `transaction_tag (transaction_id, tag)` join table — indexable, escape-safe, still SQLite-trivial.

## 2. Sync protocol v2

The LWW-envelope concept is kept (it is well understood and tested); its four weaknesses — full-table scans, unpaginated pull, client wall-clocks, 10× duplication — are each fixed:

1. **Registry-driven, not copy-pasted.** One `SYNCABLE = {name → (model, sync_schema, fields)}` registry server-side drives a single generic upsert/pull loop (the existing `_upsert_generic` generalized to all tables); one `syncTables` registry client-side drives generic merge/collect. Adding a table becomes a one-line registration + migration on each side.
2. **Dirty-tracking instead of scans.** Dexie rows gain `syncedAt` (or a `_dirty` outbox flag); the push set is `where('_dirty').equals(1)` — O(changes), not O(history). The client merge runs in **one Dexie `rw` transaction across all stores**, and the watermark advances inside it (fixes the partial-merge window).
3. **Paginated, per-table pull.** `GET /sync/pull?table=&since=&cursor=&limit=500` with `(updated_at, id)` keyset cursors. First-device-login streams the history in pages with progress UI instead of one giant JSON body. Tombstones still included; a `tombstone GC` (server job, §5) purges tombstones older than N days and bumps a `full_resync_epoch` that forces stale clients to re-pull cleanly.
4. **Server-arbitrated time.** IDs become **UUIDv7** (client-generatable offline, time-ordered, index-friendly). Each record carries a `version: int` bumped on every edit plus `updated_at`. Conflict rule: higher version wins; equal versions → server timestamp wins; the *losing* payload is preserved in a server-side `sync_conflict` row (user-inspectable via Settings→Sync, Document 3) instead of being silently discarded. Client clock skew can no longer destroy data — worst case it loses a race it was in, and the loser is recoverable.
5. **Push becomes bulk + transactional per batch** (SQLAlchemy bulk upsert; one commit), and stays idempotent: replaying a batch with equal versions is a no-op.

Compatibility: v2 endpoints mount at `/sync/v2/*`; the v1 endpoints remain for one release window for old PWA shells, then 410.

## 3. Identity, sessions & security architecture

- **Tokens:** short-lived access JWT (15 min) + rotating opaque **refresh token** in an `HttpOnly; Secure; SameSite=Strict` cookie, stored server-side (`session` table: device label, created, last-seen, revoked). Logout and "sign out other devices" become real. Access token lives in memory only — leaves localStorage entirely (Document 1 issue #3). fastapi-users is kept for hashing/registration; the session layer is a thin custom strategy beside it.
- **Local data isolation:** Dexie database name becomes `saldo::<user_id>`; login opens that user's DB, logout closes it; Settings→Sync offers "remove this device's local copy". Fixes the confirmed shared-device leak without punishing single-user devices with forced wipes.
- **Boot guards:** refuse to start with the default JWT secret outside debug; warn loudly when serving over plain HTTP.
- **Rate limiting:** slowapi (in-process, SQLite-friendly) on `/auth/*` — 5/min/IP login, stricter on reset; lockout-with-backoff per account in `audit_log`.
- **Headers:** nginx adds CSP (self + inline-styles allowance Tailwind needs), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS-when-tunneled.
- **At rest:** documented full-disk-encryption guidance for hosts + `PRAGMA secure_delete`; SQLCipher evaluated but **rejected for now** (key management on a self-hosted Pi devolves to a key sitting next to the DB; honest docs beat theater).
- **GDPR posture:** Settings→Data export (full JSON+CSV dump, streams from SQLite) and account deletion (soft `deleted_at`, 30-day purge job) — both are also the sovereignty features, one implementation, two promises kept.
- v2: TOTP, then passkeys (documented as deferred in TECH_STACK.md — now scheduled, not vague).

## 4. Backend architecture

Shape is preserved (thin `main.py`, vertical slices, no repositories); three additions:

- **`app/shared/crud.py`** — the generic user-scoped ownership/404/soft-delete helpers every router currently re-implements; routers shrink to declarations + module-specific logic. (This is consolidation, not a new layer — it stays functions, honoring the anti-ceremony decision record.)
- **API versioning:** routers mount under `/api/v1` (nginx already rewrites `/api/`); OpenAPI stays the contract for forkers.
- **Structured logging:** `structlog` JSON lines to stdout with request-id middleware; uvicorn access logs off in favor of one canonical request log line. This plus `audit_log` is the whole observability story a self-hosted Pi wants — **no Prometheus/Grafana/OTel by default** (rejected: operational weight on the target hardware); a `/metrics`-lite JSON endpoint (db size, last backup age, sync error counts, scheduler health) feeds a Settings→System panel and anything a power user wants to scrape.

## 5. Background scheduler (the missing substrate)

An **in-process asyncio scheduler** (APScheduler, SQLite job store) inside the backend container — deliberately *not* Celery/Redis (rejected: a second/third process on a Pi to run five cron-like jobs). Single-worker assumption is documented and enforced (uvicorn workers=1; the Pi deployment already runs this way; multi-worker forks get a `SALDO_SCHEDULER_ENABLED` flag).

Jobs: recurring-rule posting (daily; writes transactions with deterministic per-occurrence UUIDv7s so client- and server-materialized occurrences dedupe through sync), bill reminders → web-push (Phase B), monthly net-worth snapshots, daily FX refresh into `fx_rate`, tombstone/attachment GC, session purge, backup freshness check (surfaces in `/metrics`-lite rather than silently rotting).

Web push: standard VAPID via `pywebpush`; keys generated at first boot into the data volume; no third-party service beyond the browser vendors' push endpoints (consistent with sovereignty).

## 6. Frontend architecture

Deltas only (the module structure stays):

- **Route-level code-splitting** (`React.lazy` per page) + virtualized transaction list (TanStack Virtual — same vendor already trusted for Query).
- **Sync engine v2** as a small state machine (`idle → collecting → pushing → pulling(page n) → merging → done/error`) with the registry from §2; progress + conflicts surfaced through `syncStore` to the Settings→Sync panel.
- **i18n:** message catalog (react-intl or lingui; decide by bundle cost) with `es` as the source language — Spanish stays the first-class citizen; `en` is the translation.
- **Design tokens → CSS variables** so the three themes (and future ones) stop being compile-time Tailwind forks (this was already flagged as debt in PROGRESS.md Stage 9).
- **A11y & E2E rigs:** Playwright project with an offline-toggle fixture (service-worker + `context.setOffline`) running the Document-3 journeys, axe-core assertions per page; ESLint (typescript-eslint + jsx-a11y) restored to CI as a hard gate.

## 7. Deployment & operations

- Compose topology unchanged (nginx / uvicorn / cloudflared / volume). Changes: backend port no longer published by default (tunnel or nginx is the ingress; `:8000` moves to a `dev` profile), nginx gains the §3 headers + gzip/brotli static config, healthcheck extended to scheduler liveness.
- **Backups become a feature, not a script:** the scheduler runs the same `sqlite3 .backup` + optional S3 upload that `ops/backup.sh` does today, with status in Settings→System; the shell script remains for cron traditionalists.
- **Upgrade safety** (the self-hosted killer): entrypoint takes a pre-migration snapshot of the DB before `alembic upgrade head`; release notes gain a machine-readable `min_supported_version`; CI adds an upgrade test (previous release's DB → migrate → smoke).
- CI hardening: pip/npm caching, `pip-audit` + `npm audit` + CodeQL, coverage gates (domain core 100% enforced, overall thresholds), the E2E job, and image signing (cosign) on release.

## 8. What is deliberately not being built

Recorded in the repo's own rejected-alternatives tradition: microservices/event bus (no consumers, same as 2024's DDD verdict) · Postgres-by-default (SQLite still right-sized; §2 removes the only load pattern that threatened it) · CRDTs (v2 sync's version+conflict-log covers the household reality at a fraction of the complexity; revisit only if live co-editing ever becomes a goal) · Redis/Celery (§5) · GraphQL (OpenAPI serves the forker persona better) · SQLCipher (§3) · third-party analytics/telemetry SDKs (opt-in, self-reported only).

---

**STOP.** This concludes Document 4. On confirmation, Document 5 — Technical Roadmap — will order all of the above into dependency-aware engineering workstreams with milestones, and Document 6 will break those into executable stages with acceptance criteria and a Git strategy.
