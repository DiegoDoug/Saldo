# Saldo → Finance Platform: Architecture & Implementation Plan

This document is the required design deliverable for evolving Saldo from a
budgeting app into a full offline-first personal-finance platform. It is written
to be executed **incrementally**, one vertical slice at a time, with a runnable,
green app after every commit. No existing capability is removed.

> Status legend: ✅ shipped in this branch · 🚧 in progress · ⬜ planned

---

## 1. Current architecture (analysis)

Saldo today is a modular monolith, DDD-lite, organized **by feature**:

- **Backend** (`backend/app/`): FastAPI app factory (`main.py`), async
  SQLAlchemy/SQLModel over SQLite, Alembic migrations. Feature modules under
  `app/modules/{identity,budgeting,layout,sync}`, each a vertical slice
  (`models.py` + `schemas.py` + `router.py` + `service.py`). The framework-free
  arithmetic lives in `app/shared/domain/` (`compute_month`/`compute_year`,
  `Money`).
- **Frontend** (`frontend/src/`): React + Vite + TypeScript. Feature modules
  under `src/modules/{identity,budgeting,sync,dashboard,layout}`. Dexie
  (IndexedDB) is the on-device source of truth; TanStack Query drives the
  background sync loop; Zustand holds session/theme. Pure arithmetic mirrored in
  `src/shared/domain/`.
- **Sync**: `/sync/push` + `/sync/pull`, last-write-wins on `updated_at`,
  tombstones for deletes, per-user scoping, idempotent push.

Key invariants we must preserve:

1. **Security boundary** — every query on user data is scoped by `user_id`;
   cross-user access returns 404/403, never data.
2. **Domain core purity** — no framework imports / no I/O in `shared/domain`;
   Python and TS cores agree on the same numbers.
3. **Offline-first** — every UI write lands in Dexie first, never blocks on the
   network; reconciliation is LWW on `updated_at` compared via epoch (naive-UTC
   vs `Z` gotcha).
4. **Migrations own the schema** — no `create_all` at runtime; new tables must be
   imported in `app/core/metadata.py` and ship a migration.

## 2. Design principles for the expansion

- **Additive, not disruptive.** Budgeting (`Category`/`Entry`) stays exactly as
  is. New modules are new tables and new routers. The existing dashboard, month
  and year views keep working unchanged.
- **Every new syncable table follows the same envelope**: UUID PK (client may
  generate offline), `user_id` FK + index, `created_at`, `updated_at`, `deleted`
  (soft-delete tombstone). This is what makes a table a first-class citizen of
  the LWW sync engine.
- **New domain math is framework-free and mirrored** (net worth, forecasting,
  savings-rate, goal completion date) in both `shared/domain` cores.
- **One slice per commit**, each shippable: backend model → migration → router →
  tests → frontend Dexie table → api/hooks → page → route.

## 3. Breaking changes

**None to existing data or endpoints.** The migration path is purely additive:

- No column is dropped or retyped on `category`/`entry`/`user`/`widget_layout`.
- Budgeting `Entry` remains the source of truth for the month/year budget math.
  Transactions are a *parallel, richer* ledger; a later, optional slice can
  derive budget "variable/fixed actuals" from transactions, but that is opt-in
  and does not change existing formulas.
- The only additive change to an existing table is a **new nullable
  `default_currency` already present on `user`**; no change required.

The one thing to watch: the frontend Dexie schema version bumps for each new
table. Dexie upgrades are additive (new object stores), so existing local data
is preserved across the version bump.

## 4. Data model

New tables, all carrying the sync envelope (`id, user_id, created_at,
updated_at, deleted`):

| Table | Key fields | Notes |
|-------|-----------|-------|
| `account` ✅ | `name, type, currency, opening_balance, color, icon, archived, position` | `type ∈ checking, savings, cash, credit_card, investment, crypto`. Balance = opening + Σ signed transactions. |
| `transaction` ✅ | `type, amount, currency, account_id, transfer_account_id, merchant_id, category_id, date, notes, tags, recurring_id` | `type ∈ income, expense, transfer`. `transfer_account_id` set only for transfers. `tags` is JSON array of strings. |
| `merchant` ✅ | `name, logo, color, category_id, website, location, recurring_probability` | Transactions reference a merchant instead of free text. |
| `recurring_rule` ⬜ | `template (amount/type/account/category/merchant), frequency, interval, start_date, end_date, next_run` | `frequency ∈ daily, weekly, biweekly, monthly, quarterly, yearly`. Materializes future `transaction` rows. |
| `goal` ⬜ | `name, kind, target_amount, current_amount, monthly_contribution, currency, target_date` | `kind ∈ emergency, vacation, house, car, custom`. Completion date computed in domain core. |
| `asset` ⬜ | `name, kind, value, currency` | Feeds net worth. |
| `liability` ⬜ | `name, kind, balance, currency, interest_rate` | Feeds net worth. |
| `net_worth_snapshot` ⬜ | `date, assets_total, liabilities_total, net_worth` | Historical series; written by a periodic job / on demand. |

Relationships & indexes:

- `transaction.account_id → account.id` (indexed), `transaction.date` (indexed
  for range queries), `transaction.merchant_id`, `transaction.category_id`,
  `transaction.recurring_id` (all indexed, nullable).
- Every table indexes `user_id` and `deleted` (sync scan + tombstone filter),
  matching the existing `category`/`entry` pattern.
- Money never crosses currencies inside the compute core; per-account currency
  is authoritative, conversion happens for display/aggregation only (reuse
  `FxRateProvider`).

## 5. API endpoints

All under the existing auth (`CurrentUser`), all `user_id`-scoped.

```
Accounts        ✅
  POST   /accounts
  GET    /accounts?include_archived=&include_deleted=
  GET    /accounts/{id}
  PATCH  /accounts/{id}
  DELETE /accounts/{id}                 (soft delete)
  GET    /accounts/balances             (aggregated balances per account + total)

Transactions    ✅
  POST   /transactions
  GET    /transactions?account_id=&type=&category_id=&merchant_id=
                       &date_from=&date_to=&q=&tag=
                       &sort=&order=&limit=&offset=      (filters/search/sort/pagination)
  GET    /transactions/{id}
  PATCH  /transactions/{id}
  DELETE /transactions/{id}
  POST   /transactions/bulk             (bulk delete / categorize / tag)
  POST   /transactions/transfer         (atomic paired transfer helper)

Merchants       ✅  CRUD + GET /merchants/{id}/stats
Recurring/Bills ⬜  CRUD + GET /bills/upcoming?days=  + POST /recurring/{id}/materialize
Goals           ⬜  CRUD + GET /goals/{id}/projection
Net worth       ⬜  assets CRUD, liabilities CRUD, GET /net-worth, GET /net-worth/history
Reports         ⬜  GET /reports/{spending-trends,income-trends,by-merchant,by-category,
                                 largest,monthly,yearly,savings-rate,health-score}
Forecast        ⬜  GET /forecast?horizon=7|30|90
Sync            ✅→⬜  /sync/push + /sync/pull extended per table, LWW preserved
```

## 6. Frontend routes

Existing routes (`/`, `/month/:month`, `/year`) are untouched. New routes mount
under the same authenticated `SyncProvider` shell:

```
/               Dashboard (expanded with widgets)      (existing, extended)
/transactions   Transactions list + filters + bulk     ✅
/accounts       Accounts + balances                    ✅
/bills          Upcoming bills + calendar              ⬜
/goals          Goals                                  ⬜
/net-worth      Net worth + allocation                 ⬜
/reports        Analytics                              ⬜
/forecast       Cash-flow projections                  ⬜
/merchants      Merchant directory                     ✅
/settings       Settings                               ⬜
```

Shared UI to add incrementally: loading skeletons, empty states (reuse existing
`EmptyState`), optimistic updates (already the Dexie-first pattern), command
palette, keyboard shortcuts, contextual menus, mobile gestures.

## 7. Migration strategy

1. **One Alembic revision per table**, autogenerated after importing the model in
   `app/core/metadata.py`, then hand-checked (indexes, FK, batch ops for SQLite).
   Chain `down_revision` off the current head so `alembic upgrade head` is linear
   and reversible (`downgrade` drops the new table).
2. **Backwards compatible**: only `create_table`/`create_index`; no destructive
   ops on existing tables. Existing databases upgrade in place.
3. **Frontend Dexie**: bump `this.version(n)` with the new object store only
   (additive upgrade preserves existing IndexedDB data).
4. **Sync**: each new table joins push/pull with its own LWW upsert, identical to
   `_upsert_entry`. Old clients that don't send the new arrays keep working
   (fields default to empty lists).
5. **Tests per slice**: unit (domain), integration (API + security scoping),
   migration (upgrade→downgrade round-trip via the metadata create_all used in
   `conftest`), and sync (idempotent replay + LWW).

## 8. Execution order (incremental)

1. ✅ **Accounts** — foundation; every transaction needs an account.
2. ✅ **Transactions** — the primary financial data source (CRUD, filters,
   search, sort, pagination, bulk, transfers).
3. ✅ **Merchants** — richer transaction descriptions.
4. 🚧 **Recurring / Bills** — materialize future transactions, upcoming page.
5. ⬜ **Goals**.
6. ⬜ **Assets / Liabilities / Net worth**.
7. ⬜ **Forecasting** (depends on recurring + history).
8. ⬜ **Reports / Analytics** (depends on transactions + merchants).
9. ⬜ **Dashboard widgets + pages polish + command palette / shortcuts**.

Each step lands as its own commit with a runnable app and green tests.
</content>
</invoke>
