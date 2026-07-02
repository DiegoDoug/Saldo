# Plan — Transactions & Categories for Saldo

> Implementation plan for adding a transaction ledger (income / expense / split /
> recurring / notes / tags) and richer categories (nesting / custom / color /
> icons / monthly budgets). Written against the code as of the `main` branch;
> follows the repo's staged-build convention (`docs/PROGRESS.md` runs through
> Stage 11 — this picks up at Stage 12).

## 0. The central design decision (read this first)

**Reframe the existing `Entry` as the *budget*, and add a new `Transaction` table
as the *actuals*.**

Today's `Entry` (`category_id` + `year` + `month` + `amount`) is *already* "a
monthly budget per category" — it just wasn't called that. The domain core
(`compute_month`) simply sums lists of those amounts, so that single number is
today both the plan and the reality. Rather than a destructive rewrite, we
**reinterpret** `Entry` as the budget and add transactions alongside. This is the
least invasive path and it directly satisfies two requests at once ("Monthly
budgets per category" = existing `Entry`; "Custom categories" = existing category
CRUD).

| Concept | Table | Status |
|---|---|---|
| Monthly budget per category | `Entry` (kind fixed/variable/income) | **exists** — reinterpret |
| Savings goal | `Entry` (kind=goal) | **exists** — unchanged |
| Actual income/expense records | `Transaction` | **new** |
| Split line items | child `Transaction` via `parent_id` | **new** |
| Tags | `Tag` + `TransactionTag` join | **new** |
| Recurring templates | `RecurringRule` | **new** |
| Category nesting/color/icon | new columns on `Category` | **extend** |

**Rejected alternative:** migrating `Entry` rows into new `Budget`/`Transaction`
tables. It's a destructive data migration that breaks the existing sync/domain/
tests for no real gain — the current schema already *is* the budget shape. This
aligns with `ARCHITECTURE.md`'s "don't add structure for a future that may never
arrive."

**One migration nuance to decide:** existing users' entry amounts were their
*spending*. Reinterpreting them as *budget* means old months would show no
actuals until transactions are logged. Recommended: an **opt-in one-time helper**
("crear movimientos desde los importes actuales") that seeds one `Transaction`
per existing entry, so historical months keep their actuals. Non-destructive
either way.

Each stage below is independently shippable, tested, and logged in
`docs/PROGRESS.md` — matching how Stages 0–11 were built. Next up: **Stage 12**.

---

## 1. Data model

### 1.1 Extend `Category` (nesting, color, icon)

Add to `backend/app/modules/budgeting/models.py`:

- `parent_id: uuid.UUID | None` — FK `category.id`, indexed → nesting tree
- `color: str | None` — hex, e.g. `#6EE7B7`
- `icon: str | None` — lucide icon name, e.g. `"ShoppingCart"`

Rules: a child **inherits `kind` from its root** (a subcategory of a variable
expense is variable) — validate on create/update; reject cycles and cross-kind
parents. Keep `kind ∈ {income, fixed, variable}` (already encodes
income-vs-expense).

### 1.2 New `Transaction` table

```
id, user_id
date            # YYYY-MM-DD (the real event date)
year, month     # denormalized from date (0-11) for the existing [year+month] query path
type            # {income, expense}
category_id?    # null = uncategorized; null on a split parent
amount, currency
note            # freeform text
split_parent    # bool — true on the container row of a split
parent_id?      # FK transaction.id — set on split children
recurring_id?   # FK recurring_rule.id — set on materialized occurrences
created_at, updated_at, deleted
```

**Splits** = one parent row (`split_parent=true`, carries date/type/total/note)
+ N child rows (`parent_id` set, each category+amount). **Totals count leaves
only**: non-split transactions + split children; parent rows are excluded.
Invariant: `sum(children.amount) == parent.amount` (validated server + client).
Modeling splits as child transactions (not a separate table) reuses all
transaction machinery — tags, notes, sync, Dexie — with one table instead of two.

### 1.3 `Tag` + `TransactionTag`

- `Tag`: id, user_id, name, color?, timestamps, deleted
- `TransactionTag`: id, user_id, transaction_id, tag_id, updated_at, deleted — a
  join row with **its own id + updated_at + deleted** so it round-trips through
  the LWW/tombstone sync like everything else (no plain composite-key join, which
  sync can't tombstone).

### 1.4 `RecurringRule`

```
id, user_id
type, category_id?, amount, currency, note
day_of_month    # which day occurrences land (default 1)
start_year, start_month
months_count    # "choosable how many months" from the request
active          # the "optional toggle to show on months"
created_at, updated_at, deleted
```

**Recurrence strategy — materialize (recommended).** When a rule is created/
edited, generate concrete `Transaction` rows (one per month, `recurring_id` set,
`day_of_month`) for `months_count` months. The **toggle** = `active`; flipping it
tombstones/restores the generated occurrences (or filters them from display).
Editing one occurrence just edits that `Transaction`; editing the rule offers
"apply to future occurrences." This keeps the domain core purely numeric and fits
offline sync (real rows, LWW).

- *Rejected alternative:* virtual projection (expand rules on the fly, no stored
  rows). Lower row count but pushes recurrence logic into the pure domain core and
  needs an exception table for edited occurrences — more complexity than a
  single-household dataset warrants.

### 1.5 Migration

One Alembic migration (batch mode, per repo convention): add `parent_id`/`color`/
`icon` to `category`; create `transaction`, `tag`, `transaction_tag`,
`recurring_rule`. No data migration required (`Entry` unchanged). Register new
models in `app/core/metadata.py`.

---

## 2. Domain core (keep it pure, keep cross-language parity)

The core's cherished property — framework-free, mirrored byte-for-byte in Python
(`app/shared/domain/budgeting.py`) and TS (`shared/domain/budgeting.ts`) with
matching test tables — must be preserved. Changes are **additive**:

- **Actuals feed the existing math.** `income_total`/`fixed_total`/
  `variable_total` now sum **transactions grouped by kind** instead of (or
  alongside) entry amounts. The `MonthInput` still receives numeric lists — we
  just build them from transactions. `compute_month`/`compute_year` signatures
  stay stable.
- **New pure function** `compute_budget_variance(budgets_by_category,
  actuals_by_category) -> per-category {budgeted, actual, remaining, over}`.
  Small, pure, mirrored on both sides with a shared expected-value test table
  (the cross-language contract).
- The spend meter shifts to **actual vs budget** (and vs can-spend). Goal math
  unchanged.

Mirror every change in both languages and extend the parity test tables in the
same commit — this is the one place the repo tests hardest.

---

## 3. Backend API (`modules/budgeting/router.py` + new slices)

Follow the existing conventions exactly: every route depends on `CurrentUser`,
every query filters by `user.id`, foreign-owned rows read as 404, deletes are
soft (tombstones), client may supply UUIDs.

New/changed endpoints:

- **Categories:** accept `parent_id`/`color`/`icon`; new
  `GET /budgeting/categories/tree` (nested). Validate parent kind + no cycles.
- **Transactions:** `POST/GET/PATCH/DELETE /budgeting/transactions` with
  `?year&month&category_id&tag_id&type` filters. Split create validates
  `sum(children)==parent`. Reject foreign `category_id`/`parent_id`.
- **Tags:** CRUD `/budgeting/tags`; attach/detach via `TransactionTag` rows.
- **Recurring:** CRUD `/budgeting/recurring`; server materializes occurrences on
  create/edit; `active` toggle.
- **Summary:** extend `MonthSummary`/`YearSummary` with `budget_total`,
  `actual_total`, and `by_category` variance.

Keep handlers **under 30 lines** (`CLAUDE.md`) — push validation/materialization
into `service.py` helpers. Extend `tests/test_budgeting_api.py` with the
**cross-user isolation** cases for every new entity (the security invariant),
plus split-sum, tree validation, and recurring materialization.

---

## 4. Sync (`modules/sync`) — generalize, don't duplicate

Add `transactions`, `tags`, `transaction_tags`, `recurring_rules` to
`PushRequest`/`PushResponse`/`PullResponse`. Each is row-based LWW-on-`updated_at`
with tombstones — the exact pattern already proven for categories/entries.

**Refactor to avoid duplication** (`CLAUDE.md`: logic repeated >twice → extract):
today `_upsert_category`/`_upsert_entry` (backend) and `mergeCategories`/
`mergeEntries` (frontend `syncEngine.ts`) are near-identical. Generalize into a
single table-driven upsert/merge so adding four tables doesn't mean eight copies.
Bump **Dexie to v3** with new stores: `transactions`
(`id, [year+month], date, categoryId, parentId, recurringId, deleted,
updatedAt`), `tags`, `transactionTags` (`id, transactionId, tagId`),
`recurringRules`. Extend sync tests (idempotent replay, LWW, tombstone
propagation) to the new tables.

---

## 5. Frontend data layer (`modules/budgeting`)

- **`localRepo.ts`:** add/edit/delete transactions (incl. split as parent+children
  in one Dexie `rw` transaction), tag CRUD + attach/detach, recurring CRUD,
  category color/icon/parent, per-month budget (existing `setCategoryAmount`). All
  Dexie-first, `updatedAt` bumped, deletes tombstoned — matching current style.
- **Recurring on device:** materialize occurrences locally on rule create/edit
  (mirrors the server, offline-safe), guarded by a single `rw` transaction against
  double-seeding (same pattern already used for `seedDefaultCategoriesIfEmpty`).
- **`hooks.ts`:** `useTransactions(year,month, filters)`, `useTags`,
  `useRecurringRules`, `useCategoryTree`, and a `useMonthResult` that now derives
  actuals from transactions + variance from budgets — all via `useLiveQuery` so
  the UI stays reactive after background sync.
- **`mappers.ts`:** wire↔local for the new shapes.

---

## 6. Frontend UI

Reuse the Cuaderno theme, `MoneyInput`, `CategoryRow` patterns, dnd-kit (already
in stack), and **Spanish ubiquitous language**: *Movimientos* (transactions),
*Ingreso/Gasto*, *Dividir* (split), *Recurrente*, *Nota*, *Etiquetas* (tags),
*Presupuesto* (budget), *Categoría anidada*, *Color/Icono*.

- **Category manager (new view):** tree with expand/collapse, add subcategory,
  color picker + lucide icon picker, set default monthly budget + per-month
  override, drag-to-reorder.
- **Transaction entry form:** type, amount, date, nested category picker, note,
  tag multi-select (create-on-type), "Dividir" toggle → split line editor (rows
  must sum to total, live validation), "Recurrente" toggle → day-of-month +
  months-count.
- **Transaction list:** per-month, grouped/filterable by category or tag, colored
  tag chips, category icons.
- **Recurring manager:** list rules, toggle `active` (show/hide on months), edit
  horizon.
- **Month view upgrade:** budget-vs-actual progress bars per category (using
  category color), breakdown donut keyed on category colors/icons, tag filter.

Keep components' props grouped into objects where they'd exceed 3 (`CLAUDE.md`),
handle async errors on every mutation, and run **`/simplify`** before presenting
(per `CLAUDE.md`).

---

## 7. Suggested staging (matches `docs/PROGRESS.md`)

- **Stage 12 — Model & migration:** extend `Category`; add `Transaction`/`Tag`/
  `TransactionTag`/`RecurringRule`; Alembic migration; model tests.
- **Stage 13 — Backend API + domain core:** CRUD + tree + budget-vs-actual
  summary; additive pure-core changes mirrored PY/TS with parity tables; isolation
  + split + recurring tests.
- **Stage 14 — Sync + Dexie v3:** generalized upsert/merge; new tables into
  push/pull; sync tests.
- **Stage 15 — Frontend data layer:** localRepo/hooks/mappers; on-device recurring
  materialization; unit tests.
- **Stage 16 — Frontend UI:** category manager, transaction/split/tag/recurring
  UI, month-view budget-vs-actual.
- **Stage 17 — Polish:** tag filtering, empty states, a11y, `/simplify`, PROGRESS/
  README/screenshots, optional "seed transactions from current amounts" migration
  helper.

---

## 8. Risks & invariants to hold

- **Cross-language parity** — every domain-core change lands in Python *and* TS
  with matching test tables in the same commit.
- **User isolation** — the one non-negotiable security boundary; add isolation
  tests for all four new entities.
- **Split-sum invariant** — enforced server and client; splits only count at leaf
  level.
- **Offline UUIDs + tombstones** — all new entities client-generatable and
  soft-deleted, or sync/offline breaks.
- **Recurring dedup** — materialization must be idempotent (single `rw`
  transaction guard) to avoid the duplicate-seeding class of bug already hit once
  in Stage 11.
- **Migration reversibility** — `Entry` stays put; the "seed transactions" helper
  is opt-in and non-destructive.
