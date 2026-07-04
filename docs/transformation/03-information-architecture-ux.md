# Saldo Transformation — Document 3: Information Architecture & UX

**Status:** Complete — awaiting confirmation before Document 4 (Data Model & System Architecture)
**Builds on:** Document 1 (the ledger unification decision) and Document 2 (pillars; every choice below is judged by the Marta test: fast, obvious, offline).

The current app has 11 flat routes in a bottom nav that has already outgrown itself (`AppNav` groups them into a "Más" overflow). This document restructures the IA around how a household actually uses a finance app: **a daily loop, a weekly loop, a monthly loop, and rare admin tasks** — and gives every page one job.

---

## 1. Structural principles

1. **Three-tier navigation.** Primary nav carries the daily/weekly loop (5 items max, thumb-reachable). Everything analytical lives one level deeper under a single hub. Admin/rare tasks live behind Settings. The current "11 flat pages" model forces Marta to scan a menu to log a purchase.
2. **One page, one question.** Each page answers exactly one user question (below, each page is defined by its question). Pages that answer two questions get split or merged.
3. **Capture is a verb, not a place.** Adding a transaction is a **global action** (persistent FAB / keyboard shortcut / share-target), not a page you navigate to. This is the single highest-leverage UX change for the <10s logging target.
4. **The ledger is the spine.** After unification, every number on every page is a view over transactions (+ valuations). Tapping any aggregate anywhere drills down to the filtered transaction list that produced it — one universal "explain this number" gesture, which is also the Honest pillar made tangible.
5. **Offline is a first-class state, not an error.** Every page renders fully from Dexie; network-dependent affordances (FX refresh, mixed-currency conversion) degrade visibly but quietly.

## 2. Sitemap

```
Saldo
├─ (public)  /login · /register · /reset-password
├─ Onboarding  /welcome            (first-run wizard, once)
│
├─ ● Home            /             "How am I doing right now?"
├─ ● Transactions    /transactions "What happened, and is it labeled right?"
│    └─ /transactions/:id          (detail/edit sheet)
├─ ● [ + Add ]                     global capture sheet (FAB, not a route)
├─ ● Budget          /budget       "Can I spend this, this month?"
│    └─ /budget/:year/:month       (month focus; absorbs today's MonthView)
│    └─ /budget/:year              (year overview; absorbs YearView)
├─ ● Insights        /insights     hub: "What should I know?"
│    ├─ /insights/reports          spending trends, categories, merchants
│    ├─ /insights/net-worth        assets, liabilities, history
│    ├─ /insights/forecast         projected cash flow
│    └─ /insights/goals            savings goals & progress
│
├─ Planned           /planned      recurring rules, upcoming bills, subscriptions
├─ Accounts          /accounts     "Where is my money?"  (reached from Home cards)
│    └─ /accounts/:id              account register (filtered ledger view)
├─ Search            ⌘K / 🔍       global overlay: transactions, merchants, pages, actions
│
└─ Settings          /settings
     ├─ /settings/profile          email, password, sessions
     ├─ /settings/preferences      language, currency, theme, start-of-month
     ├─ /settings/categories       category management (today buried in MonthView)
     ├─ /settings/merchants        merchant directory (demoted from primary nav)
     ├─ /settings/data             import (CSV/OFX), export, backup status
     ├─ /settings/security         2FA/passkeys (v2), audit log, device sessions
     ├─ /settings/notifications    bill reminders, budget alerts
     ├─ /settings/sync             sync state, conflict inspector, local data reset
     └─ /settings/household        members & sharing (v2)
```

**Primary nav (mobile bottom bar / desktop sidebar):** Home · Transactions · **[+]** · Budget · Insights. Five slots, center slot is capture. `Planned` and `Accounts` are secondary (desktop sidebar section / mobile via Home cards and Insights hub) — they're weekly-loop, not daily-loop.

**What moves where (vs. today):** Merchants leaves primary nav (it's metadata curation, visited monthly at best). Reports/Net worth/Forecast/Goals collapse into the Insights hub — four analytical pages that share an audience and a visit cadence. Month/Year views become the Budget section rather than sibling top-level routes. Nothing is deleted; everything gets a cadence-appropriate home.

## 3. Page definitions (purpose · content · movement)

**Home** — *"How am I doing right now?"* Today's safe-to-spend (budget remaining ÷ days left), account balance cards, this month's spend vs. plan sparkline, next 7 days of planned bills, recent transactions, sync status. Keeps the widget customization (dnd-kit reorder/hide — already built, a genuine differentiator). Every card links to its source page. Home is a **router, not a destination**: 5-second glance, one tap deeper.

**Capture sheet (global +)** — amount-first numpad, then smart defaults: most-recent account preselected, category suggested from merchant history (rule-based now, AI later), date=today, currency=account's. Two taps for a repeat purchase. Works offline, obviously. Also reachable via PWA share-target and app-shortcut ("Add expense" long-press icon), and `N` on desktop.

**Transactions** — the ledger: infinite-scrolling list grouped by day, running filters (account/category/merchant/tag/type/date), bulk select → recategorize/tag/delete, inline category fix (tap the category chip — the #1 curation gesture). Row tap opens the detail sheet (`/transactions/:id`) for edit/split/notes. This absorbs today's TransactionsPage plus the drill-down target role from principle 4.

**Budget** — *"Can I spend this?"* Month focus: per-category envelopes (limit, spent-from-ledger, remaining bar), income received vs. expected, savings goal (`ahorro`) progress, overspend flags — the Spanish-vocabulary soul of the product, now fed by transactions instead of parallel entries. Year view: 12-month grid, totals, seasonality. The current MonthView's inline category CRUD moves to Settings→Categories; the Budget page is for *judging*, not administering.

**Insights hub** — a landing grid of headline stats routing to: **Reports** (trends, by-category, by-merchant, largest, savings rate — today's ReportsPage), **Net worth** (snapshot + history + asset/liability management), **Forecast** (projection from balances + planned items + history), **Goals** (progress, projected completion, contribute action). These four already exist and are kept nearly as-is; the hub gives them one address and frees primary nav.

**Planned** — recurring rules + the upcoming-bills calendar (today's BillsPage), plus detected subscriptions (v2). Once rules self-post (Document 1, issue #5), this page becomes review-and-confirm rather than manual materialization.

**Accounts** — balance list with archive states; account detail = the ledger pre-filtered to that account with a running balance column (a classic register — currently missing entirely; today tapping an account goes nowhere).

**Onboarding (/welcome)** — currently absent; new users land on an empty dashboard. Four steps, skippable, offline-capable: (1) language + currency, (2) create first account(s) with starting balances, (3) pick/trim default categories + optional monthly budget amounts, (4) fork in the road: "log your first expense" (→ capture sheet) or "import a CSV" (→ Settings→Data, serving the Alex persona on day zero). Ends on Home with real numbers, never an empty state.

**Settings** — everything above; notably **Data** (import wizard with column mapping + preview + dedupe; export everything as CSV/JSON — the egress promise) and **Sync** (last sync, per-device sessions, the conflict inspector Document 1 called for, and "wipe local data" — the shared-device story done right).

## 4. The four journeys (design targets)

1. **Daily log (Marta, 10s, possibly offline):** unlock phone → Saldo icon (or long-press shortcut) → + → numpad `4.50` → merchant chip "Panadería" (suggested) → done. Toast: "Guardado · se sincronizará". Budget bar on Home already moved when she glances.
2. **Weekly review (either, 5 min):** Home → uncategorized-count chip → Transactions pre-filtered to uncategorized → fix via category chips → glance at Budget → done. The *uncategorized queue* is the workflow anchor (all serious competitors converge on it; Saldo currently lacks it).
3. **Monthly close (Diego, 15 min):** Budget month view → compare vs. plan → adjust next month's envelopes (copy-forward with edits) → Insights→Net worth → "update valuations" prompt walks through stale assets → snapshot posts automatically.
4. **Day zero (Alex, 30 min):** register → onboarding → import CSV → mapping preview catches his bank's date format → 2,000 transactions in → Reports already show a year of history. First-session wow is the retention bet for this persona.

## 5. UX improvement inventory (beyond IA)

- **States, systematically:** every page gets designed empty (first-run CTA, not blank), loading (skeletons — currently absent), error (retry affordance), and offline states. Empty states exist today (`EmptyState`) but CTAs mostly don't lead anywhere useful.
- **Feedback:** optimistic writes already exist (Dexie-first) — surface them: subtle "saved locally / synced" ticks instead of today's silent writes plus a cryptic conflict counter. The SyncStatusBar grows into a tappable sync panel.
- **Undo, not confirm:** deletes (transaction, category) become soft-delete + 5s undo toast — the data model already tombstones everything; the UI should cash that in instead of interrupting with confirms.
- **Keyboard & power:** global search/command palette (⌘K) covering transactions, pages, and actions; `N` new transaction; `[`/`]` month navigation. Desktop is Diego's habitat.
- **Charts:** all Recharts visuals get text summaries (also the accessibility fix), tap-to-drill (principle 4), and consistent number formatting via the existing `formatMoney`.
- **Mobile ergonomics:** bottom-sheet dialogs instead of centered modals; swipe on transaction rows (left = categorize, right = delete-with-undo); pull-to-sync on lists.

## 6. Accessibility strategy

Target **WCAG 2.2 AA**, audited in CI (axe-core in the Playwright suite Document 1 already mandates):

- Contrast-verify the three themes (cuaderno/liso/carbón) — never audited; carbón (dark) most at risk.
- Full keyboard path for every journey in §4 (dnd-kit already handles dashboard reorder; extend the standard to sheets, chips, and the capture numpad).
- Screen-reader semantics: live-region announcements for sync events and saved-toasts; charts get `aria-label` + data-table fallbacks; money amounts formatted for correct SR reading.
- `prefers-reduced-motion` honored (charts, sheet transitions); touch targets ≥44px; visible focus everywhere.
- **i18n as accessibility:** the es/en split (Document 2, Phase B) via a message-catalog layer; Spanish domain terms (`nomina`, `ahorro`) remain the *category/domain* vocabulary even in the English UI — identity preserved, audience unlocked.

## 7. Responsive & PWA strategy

- **One codebase, two layouts:** bottom bar + sheets + FAB below `md`; persistent sidebar + two-pane (list + detail side-by-side on Transactions/Accounts) above. Same routes, same components, CSS-grid reflow — no separate "desktop pages".
- **PWA, deepen what exists:** the shell/precache/update-prompt story is already solid. Add: share-target (capture from any app), app shortcuts (Add expense / Budget), badging API for uncategorized count, `persist()` storage durability request (financial data must survive browser eviction pressure — currently unrequested), and web push for bill reminders (Phase B, self-hosted, no third-party push service beyond the standard push endpoints).
- **Performance budget:** interactive <2s on a mid-range Android over the PWA cache; route-level code-splitting (today only react/charts are split); virtualized transaction list (the post-import ledger will be thousands of rows); Recharts lazy-loaded per Insights page.

---

**STOP.** This concludes Document 3. On confirmation, Document 4 — Data Model & System Architecture — will specify the unified schema (transactions-as-spine, budgets, integer money, valuations), the reworked sync protocol, auth/session architecture, the background scheduler, and the deployment/observability design that the IA above assumes.
