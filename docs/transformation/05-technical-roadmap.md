# Saldo Transformation — Document 5: Technical Roadmap

**Status:** Complete — awaiting confirmation before Document 6 (Implementation Master Plan)
**Builds on:** Documents 1–4. This document orders the engineering work into dependency-aware phases with effort estimates. Document 6 breaks Phases 0–2 into executable stages with acceptance criteria.

**Estimation unit:** engineer-weeks (ew) for one senior engineer familiar with the codebase. The repo's own history (12 staged builds, then an 8-module expansion) shows this codebase absorbs ~1 vertical slice per ew; estimates lean on that observed velocity. Ranges express uncertainty, not padding.

**Sequencing logic:** security fixes that protect existing users come absolutely first (Phase 0); representation changes that get costlier with data growth come second (money, ids — Phase 1); the product-defining unification third (Phase 2); everything else stacks on those. Each phase ends with the app releasable.

---

## Phase 0 — Stop the bleeding + cleanup *(≈ 2–3 ew)*

Protects current users; zero schema changes; independently shippable as a patch release.

| # | Work item | From | Effort |
|---|---|---|---|
| 0.1 | Per-user Dexie DBs (`saldo::<user_id>`) + close-on-logout; migration of existing single DB on first login | D1 §4.2 | 0.5 ew |
| 0.2 | Boot guard on default JWT secret; HTTP warning | D4 §3 | 0.1 |
| 0.3 | slowapi rate limiting on `/auth/*`; auth events into a minimal `audit_log` table (the one Phase-0 migration, server-only, non-synced) | D4 §3 | 0.5 |
| 0.4 | nginx security headers; unpublish backend :8000 (dev profile) | D4 §7 | 0.2 |
| 0.5 | ESLint (ts-eslint + jsx-a11y) + Prettier restored as hard CI gates; fix fallout | D1 §4.4 | 0.5 |
| 0.6 | Docs truth pass: README/ARCHITECTURE/CLAUDE.md to 10-module reality; delete the `</content></invoke>` artifact; PROGRESS.md re-opened for the transformation | D1 §4.7 | 0.3 |
| 0.7 | CI: pip-audit / npm audit / coverage reporting (observe-only thresholds for now) | D4 §7 | 0.3 |

*Milestone M0: patch release; a shared browser no longer leaks financial data.*

## Phase 1 — Foundations: representation & protocol *(≈ 6–8 ew)*

The two changes that must precede everything and get more expensive by the month.

- **1.1 Integer money** (2.5–3 ew): exponent table in both cores; regenerate + freeze cross-language test tables against the prototype; Alembic data migration (float→minor units, one pass, pre-migration snapshot mandatory); Dexie upgrade hook; wire schemas break → this is the `/api/v1` cutover moment (D4 §4). Riskiest single item in the roadmap; gets the most test investment (property-based round-trip tests, sum-preservation assertions on migrated DBs).
- **1.2 Sync v2** (2.5–3 ew): registry on both sides (deletes ~600 lines of duplication), `_dirty` outbox + single-transaction merge, keyset-paginated pull with progress UI, `version` field + conflict-log table, UUIDv7 for new rows (old UUIDv4s stay valid). v1 endpoints kept one release, then 410.
- **1.3 Session auth** (1.5–2 ew): refresh-rotation + session table + in-memory access tokens; device list UI in a minimal Settings shell (the page itself lands here as scaffolding).
- **1.4 Generic CRUD helpers** (`shared/crud.py`) folded in opportunistically as routers are touched (0.5 ew).

*Milestone M1: minor-units release; sync survives a 50k-row ledger and a wrong clock; real logout. **Feature freeze on new modules until M1** — every module added before it multiplies 1.1 and 1.2's surface.*

## Phase 2 — The unification (financial core) *(≈ 5–7 ew)*

The product-defining phase (D4 §1.2, D3 Budget section).

- **2.1** `budget_month` + `budget_envelope` tables, sync-registered; envelope CRUD API (1 ew).
- **2.2** Entry→Transaction migration with dry-run report ("N entries → N transactions, totals before/after equal") shown to the user before commit; `Entry` read-only thereafter (1.5–2 ew).
- **2.3** Domain-core seam rework: `build_month_input` assembles from transactions+envelopes; `compute_month/year` untouched; mirrored tests re-pointed (1 ew).
- **2.4** Budget UI: month view re-fed from the ledger, envelope bars, copy-forward month planning; MonthView's category CRUD relocates to Settings→Categories (1.5–2 ew).
- **2.5** Universal drill-down (aggregate → filtered ledger) as a shared hook/route contract (0.5 ew).

*Milestone M2: one expense entered once appears in budget, balance, and reports. The Document-2 exit test. This is the release worth announcing.*

## Phase 3 — Adoption features & automation *(≈ 5–6 ew)*

- **3.1 CSV import wizard** (mapping, preview, dedupe by hash of date+amount+normalized-desc, merchant auto-matching via `aliases`) — 2 ew; the Alex persona's day zero.
- **3.2 Full export** (JSON+CSV streaming) + account deletion flow — GDPR + sovereignty in one (0.5 ew).
- **3.3 Scheduler** (APScheduler substrate + recurring-rule posting with deterministic occurrence ids + net-worth snapshots + FX refresh into `fx_rate` + tombstone GC + backup job/status) — 1.5 ew.
- **3.4 Onboarding wizard** (D3) — 1 ew.
- **3.5 Capture sheet + IA restructure** (nav regrouping, Insights hub, capture FAB/share-target/shortcuts) — 1–1.5 ew. *(Pure frontend; can run in parallel with 3.1–3.3.)*

*Milestone M3: a new household onboards, imports history, and bills post themselves — daily-driver viable.*

## Phase 4 — Quality, i18n, analytics depth *(≈ 4–6 ew)*

- **4.1 Playwright E2E** suite: the four D3 journeys incl. the offline→reconnect loop, axe-core per page, upgrade-migration test in CI — 1.5 ew. *(Deliberately here and not earlier as a full suite; smoke-level E2E lands with M1.)*
- **4.2 i18n layer**, `es` source / `en` parity; locale-aware formatting — 1.5 ew.
- **4.3 Performance:** route code-splitting, virtualized ledger, SQL-side balance aggregation (kills `account_deltas`-in-Python), tag join table — 1 ew.
- **4.4 Insights depth:** report drill-downs, uncategorized queue, search/⌘K — 1–1.5 ew.
- **4.5 Web push notifications** (VAPID; bill reminders, budget-threshold alerts) — 1 ew.

*Milestone M4: WCAG-audited, bilingual, E2E-gated. The "feels like a $100/yr product" bar.*

## Phase 5 — Intelligence platform *(≈ 4–6 ew, v3 territory)*

Rules before models; local before remote; everything overridable (D2 philosophy).

- **5.1 `automation_rule` engine** (deterministic if-match-then-set; retro-apply option) — 1 ew. This alone covers ~80% of auto-categorization value.
- **5.2 Heuristic layer:** subscription/recurring detection from ledger periodicity; anomaly flags (z-score vs. category history); both feed notifications — 1.5 ew.
- **5.3 Statistical forecast upgrade** (seasonality-aware cash-flow projection; still in the mirrored pure cores) — 1 ew.
- **5.4 Optional LLM assist** behind a user-supplied endpoint (self-hosted Ollama or an API key): categorization suggestions for the uncategorized queue, natural-language search compiling to ledger filters. Off by default; no data leaves the host unless the user points it somewhere — 1.5–2 ew.

*Milestone M5: the app categorizes, detects, and forecasts — without a cloud dependency.*

## Phase 6 — Production hardening *(≈ 3–4 ew)*

TOTP 2FA (1 ew) · passkeys (1 ew) · restore-from-backup UI + quarterly restore-drill docs (0.5) · threat-model doc + OWASP pass + external security review of auth/sync (0.5–1) · cosign image signing, SBOM, CodeQL (0.5) · load test: 100k-transaction synthetic household in CI perf job (0.5).

## Phase 7 — Households (enterprise-readiness, Saldo-scale) *(≈ 5–7 ew)*

The deferred-since-v1 feature, now on deliberately prepared ground: `household` + membership + roles (owner/member/viewer); shared accounts/categories/budgets with per-member attribution; sync scoping becomes `(household_id | user_id)`; invitations via email flow. This is the one place a real aggregate invariant appears (concurrent envelope edits) — the conflict-log sync from Phase 1 is what makes LWW still acceptable here. Includes migration path "solo user → household of one".

## Phase 8 — Scale & ecosystem *(ongoing)*

Plugin/importer API surface (stable OpenAPI + webhook-out) · community importer registry · optional Postgres CI matrix (keeping the fork promise honest) · read-only sharing links · managed-hosting partner docs. Deliberately unscheduled: driven by community pull, not roadmap push.

---

## Cross-cutting tracks (run continuously)

- **Testing ratchet:** domain core stays 100%; every phase's DoD includes its tests; coverage thresholds tighten at each milestone (observe → warn → gate).
- **Dependency currency:** Renovate/Dependabot from Phase 0; React 19 / Tailwind 4 / Vite upgrades batched at phase boundaries, never mid-phase.
- **Docs discipline:** PROGRESS.md entry per phase (the repo's best tradition); decision records for every "rejected" in D4 §8.

## Dependency graph & critical path

```
P0 ──► P1.1 (money) ──► P2 (unification) ──► P3.1 import ──► P4 ──► P5 ──► P7
        P1.2 (sync v2) ─┘        │                ▲
        P1.3 (sessions)          └─► P3.3 scheduler┘     P3.5 IA/capture ─► P4.4
```

Critical path: **P0 → money → sync v2 → unification → import** (~14–18 ew). IA/capture work (3.5), i18n prep, and E2E scaffolding are parallelizable off-path for a second contributor. Total to M4 ("best-in-class daily driver"): **~22–30 ew** solo; roughly two quarters with one senior engineer plus part-time contributions, which matches this project's demonstrated cadence.

## Top risks

1. **Money migration corrupts balances** → dry-run + sum-equality assertions + pre-migration snapshot + one-release rollback window (highest-impact, well-mitigated).
2. **Unification alienates existing budget users** → Entry data visibly preserved; month/year numbers proven equal pre/post in the migration report; vocabulary unchanged.
3. **Solo-maintainer bandwidth** → phases are individually shippable; the freeze in P1 is the only hard constraint; everything after M2 can slow without stranding users.
4. **Sync v2 regression against v1 clients** → one-release dual-mount + E2E matrix old-client/new-server.

---

**STOP.** This concludes Document 5. On confirmation, Document 6 — Implementation Master Plan — will expand Phases 0–2 (the critical path) into stage-by-stage execution: task lists, acceptance criteria, test requirements, Git/release strategy, and Definitions of Done.
