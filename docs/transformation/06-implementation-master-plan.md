# Saldo Transformation — Document 6: Implementation Master Plan

**Status:** Complete — final document of the series
**Builds on:** Documents 1–5. Expands the critical path (Phases 0–2 of the Technical Roadmap) into executable stages, then closes with the Git/release strategy and final recommendations. Phases 3+ are planned at roadmap altitude in Document 5 and get their own stage breakdowns when their turn comes — planning them in this detail now would be guessing past two migrations' worth of learning.

**Standing rules for every stage** (inherited from the repo's own working discipline, which is good and stays):
- One stage = one PR = a runnable, green app. No stage leaves `main` broken or half-migrated.
- Every stage's DoD includes: tests written and passing (`pytest`, `vitest`, `tsc`), `ruff`/ESLint clean, a PROGRESS.md entry (built / deviated / open), and docs updated in the same PR when behavior changes.
- Every schema-touching stage ships its Alembic migration and Dexie version bump *in the same PR*, with upgrade + downgrade tested.
- The security invariant (every user-data query scoped by `user_id`) and the domain-core purity rule (no framework imports, mirrored numbers) are review-blocking, not advisory.

---

## Release R0 — Security patch (Phase 0, stages S0.1–S0.4)

### S0.1 — Per-user local databases *(the confirmed leak — first PR of the transformation)*
**Scope:** Dexie DB per user (`saldo::<user_id>`); open on login, close on logout; one-time migration adopting the legacy `saldo` DB into the first user who logs in (with a "is this your data?" guard if the profile row mismatches); "remove local data" action in a minimal Settings shell.
**Tasks:** `db.ts` factory refactor (module-level `db` singleton → `getDb(userId)` provided via context); auth hooks open/close; adoption migration; sync/localRepo/hooks call-site sweep; Settings shell route.
**Acceptance:** two users alternating logins on one browser each see only their own data and sync cleanly (the Document-1 403-wedge scenario becomes a test); logout leaves no queryable financial data under the other account's session; existing single-user devices upgrade losslessly.
**Tests:** vitest for the factory + adoption paths; the two-user E2E becomes the seed of the Playwright suite (smoke-level now, full rig in Phase 4).
**Risk:** the singleton `db` import is referenced everywhere → mechanical but wide diff; mitigate by keeping the export as a proxy during the sweep. **Effort:** 0.5 ew.

### S0.2 — Auth hardening bundle
**Scope:** boot-refuse on default `SALDO_JWT_SECRET` (env `SALDO_DEBUG=1` bypass for dev); slowapi on `/auth/*` (login 5/min/IP, reset 3/hr/IP, register 10/hr/IP); `audit_log` table (server-only, non-synced — Phase 0's only migration) recording auth events with IP/UA; account soft-lockout with exponential backoff surfaced as a clear 429 message.
**Acceptance:** default-secret boot fails with an actionable error; 6th login attempt in a minute → 429; audit rows visible via a `/users/me/security-events` endpoint.
**Tests:** pytest for guard, limiter (time-mocked), lockout, audit writes; verify audit_log is absent from sync pull. **Effort:** 0.5 ew.

### S0.3 — Edge & headers
**Scope:** nginx CSP/XCTO/Referrer-Policy/Permissions-Policy (+HSTS behind tunnel flag); backend `:8000` publish moved to a `dev` compose profile; gzip static config.
**Acceptance:** `docker compose up` unchanged for existing users; headers present on every response; Vite dev flow unaffected. **Effort:** 0.2 ew.

### S0.4 — Toolchain & truth
**Scope:** ESLint (ts-eslint, jsx-a11y) + Prettier as hard CI gates and the resulting fixes; pip-audit/npm-audit/coverage-report CI steps (observe-only); README/ARCHITECTURE/CLAUDE.md updated to the 10-module reality; `FINANCE_ARCHITECTURE.md` artifact removed and the file marked superseded by `docs/transformation/`; PROGRESS.md re-opened with a transformation section.
**Acceptance:** CI red on lint violations; docs describe the code that exists. **Effort:** 0.8 ew.

**🚢 Release milestone R0** — tag `v0.2.0`, patch announcement: "upgrade now if you share a device." Upgrade = `docker compose pull && up`; no schema risk beyond the additive audit table.

---

## Release R1 — Foundations (Phase 1, stages S1.1–S1.4) · *feature freeze in effect*

### S1.1 — Integer money: domain cores first
**Scope:** currency-exponent table + minor-unit `Money` in both cores; `round2`-over-minor-units semantics decided and documented; **regenerate the cross-language expected-number tables once**, reviewed line-by-line against `reference/Presupuesto.tsx`, then frozen; property-based tests (hypothesis / fast-check) for round-trip float↔minor and sum-preservation.
**Acceptance:** both cores agree to the cent on the regenerated tables; no persistence changes yet (this stage is pure-core and independently mergeable).
**Risk:** silently changing a prototype rounding quirk — the review-against-prototype step is the mitigation and is *named in the PR checklist*. **Effort:** 1 ew.

### S1.2 — Integer money: persistence & wire cutover
**Scope:** Alembic migration adding `*_minor` integer columns, backfilling (`round(amount*100)` per-currency-exponent), swapping model fields, dropping float columns (two-step within one revision chain, batch mode for SQLite); wire schemas → `/api/v1` mount with minor units (v0 endpoints removed in the same release — pre-1.0, one clean break, loudly documented); Dexie v8 upgrade transforming stored rows; `MoneyInput`/`format.ts` boundary conversion.
**Acceptance:** migration on a seeded realistic DB preserves every account balance and month total exactly (automated sum-equality assertion pre/post, run in CI against a fixture DB *and* printed by the entrypoint on real upgrades); entrypoint takes the pre-migration snapshot (this stage ships that mechanism).
**Tests:** migration round-trip test (the CI upgrade-test harness lands here); full API suite re-pointed; Dexie upgrade unit tests.
**Risk:** highest in the plan. Mitigations: snapshot + sum-assertions + fixture-DB CI job + release notes with manual rollback steps (restore snapshot, pin previous image). **Effort:** 1.5–2 ew.

### S1.3 — Sync v2
**Scope:** server `SYNCABLE` registry collapsing the ten upserts into one generic (dropping ~350 lines); `version` column on all syncable tables (migration); `sync_conflict` table + losing-write capture; keyset-paginated per-table pull; client registry collapsing the ten merges; `_dirty` outbox flag + `where('_dirty')` push set; single Dexie `rw` transaction for merge + watermark; UUIDv7 generation for new rows; sync progress in `syncStore`; v2 mounted at `/api/v1/sync`, v1 kept read-compatible for one release.
**Acceptance:** 50k-row synthetic ledger: initial pull pages with progress and stays interactive; steady-state sync does zero full-table scans (asserted via Dexie hook counters in tests); wrong-clock device test: skewed client can no longer overwrite newer server data, and the losing payload appears in the conflict inspector endpoint; replay idempotency preserved (existing test matrix re-run against v2).
**Tests:** the entire existing sync test suite ported + the clock-skew and pagination matrices; a perf smoke (pull 50k under threshold) in CI.
**Effort:** 2.5–3 ew. **Dependency:** S1.2 (wire break batched together — clients update once).

### S1.4 — Sessions & real logout
**Scope:** `session` table; refresh-token rotation via HttpOnly cookie; 15-min access tokens held in memory (Zustand non-persisted; silent refresh on 401); device list + revoke in Settings→Profile; logout revokes server-side; remove token from localStorage (migration: existing persisted tokens exchanged once, then purged).
**Acceptance:** stolen access token dies in ≤15 min; "sign out other devices" works across two browsers in the E2E smoke; offline PWA behavior unchanged (refresh failure while offline degrades to read-only-local with the existing offline banner, never data loss).
**Risk:** cookie flows behind the nginx `/api` proxy and the Vite dev origin — test both topologies explicitly. **Effort:** 1.5–2 ew.

**🚢 Release milestone R1** — tag `v0.3.0`. Breaking release, one migration window, loud notes. Exit criteria: fixture-DB upgrade job green; 50k-ledger perf smoke green; the four Document-1 load-bearing issues (#2 money, #3 client security, #4 sync) closed.

---

## Release R2 — The unification (Phase 2, stages S2.1–S2.4)

### S2.1 — Budget schema & API
**Scope:** `budget_month` + `budget_envelope` (sync-registered — now a one-line registration each, proving S1.3); `Category` reshape (kind→income/expense + `group` label, `icon`, `color`, `archived`) with data migration mapping fixed/variable→groups; envelope CRUD + month-plan endpoints; copy-forward endpoint.
**Acceptance:** envelopes sync offline like everything else; category migration preserves every existing category's identity and kind semantics. **Effort:** 1 ew.

### S2.2 — Entry → Transaction migration
**Scope:** migration command producing a **dry-run report first** (per-month: N entries → N transactions; income/expense/goal totals before and after, asserted equal) surfaced in the UI on first launch after upgrade; goal entries → `budget_month.savings_goal_minor`; a designated "Presupuesto (migrado)" default account for entry-derived transactions (user can reassign later); `Entry` becomes read-only, dropped one release later.
**Acceptance:** for every historical month, `compute_month` over migrated data equals the pre-migration result to the cent (automated over the fixture DB and every real DB at upgrade time — mismatch aborts and restores the snapshot).
**Risk:** the product's trust moment. The abort-and-restore path is tested, not theoretical. **Effort:** 1.5–2 ew.

### S2.3 — Domain seam & summaries
**Scope:** `build_month_input` assembles from transactions + envelopes; summary endpoints re-pointed; mirrored TS assembly for offline compute; delete the entry-based assembly path.
**Acceptance:** mirrored test tables pass unchanged on both sides against ledger-fed inputs (the numbers must not move — S2.2 guaranteed the data, this guarantees the plumbing). **Effort:** 1 ew.

### S2.4 — Budget UI & drill-down
**Scope:** Budget month view fed from the ledger: envelope bars (limit/spent/remaining), income vs. expected, `ahorro` progress, overspend flags; year grid; copy-forward planning flow; category admin relocated to Settings→Categories; the universal aggregate→filtered-ledger drill-down hook, applied to Budget and Home first.
**Acceptance:** the Document-2 exit test as an E2E: log one expense via the ledger → it appears in budget envelope, account balance, and month summary — entered exactly once. Marta-test timing on the flow ≤ target.
**Effort:** 1.5–2 ew.

**🚢 Release milestone R2** — tag `v0.4.0`, the announcement release ("one entry, every view"). From here, Document 5's Phases 3–5 proceed as roadmapped (import wizard next — it is deliberately *after* unification so imported history lands in the unified model once, not twice).

---

## Git & release strategy

- **Trunk-based:** short-lived branches (`feat/s1.2-money-persistence`) → PR → squash to `main`; `main` always releasable (CI: lint, unit, API, migration-upgrade job, E2E smoke, image build).
- **Stage = PR** — matching the repo's one-slice-per-commit history; no long-running integration branches (the two-person-max team makes them pure overhead). The S1.2+S1.3 wire break is the one coordinated pair: both merge behind the `v0.3.0` tag before images publish.
- **Releases:** tags `v0.x.y` → existing GHCR multi-arch pipeline; every release ships upgrade notes with a tested rollback recipe (snapshot restore + image pin); pre-1.0 semver: minor = may break with migration, patch = never. `v1.0.0` is declared at Document 5's M4 (E2E-gated, bilingual, WCAG-audited).
- **Fixture discipline:** a maintained `fixtures/household.db` (realistic seeded year, both currencies) is the migration test bed from S1.2 onward — every schema PR must keep the upgrade job green against it.

## Final recommendations

1. **Hold the line on the three Document-1 decisions.** Every tempting feature between now and R2 either lands on floats, on duplicated sync code, or on the wrong side of the unification — and doubles in cost. The feature freeze *is* the plan.
2. **Sequence exactly as written for R0→R2; feel free to reorder after.** Phases 3–5 are prioritized but not load-bearing on each other; community energy should steer them. The critical path is not democratic; the rest is.
3. **Keep the repo's soul.** The decision records, the mirrored cores, the Spanish vocabulary, the PROGRESS.md habit, and the anti-ceremony stance are why this codebase is worth transforming rather than rewriting. The transformation should be recognizable as *more Saldo*, not different Saldo.
4. **Say no in writing.** Document 4 §8's rejected list (microservices, Postgres-default, CRDTs, GraphQL, SQLCipher, telemetry SDKs) will each be proposed by well-meaning contributors within a year. The answers are already written; link them.
5. **Measure the promise.** After R2, instrument the two numbers that decide everything: time-to-log-a-transaction and upgrade success rate. If those stay green, the North Star follows.

---

*This concludes the six-document transformation series:*
*1 Architecture Review · 2 Product Vision · 3 Information Architecture & UX · 4 Data Model & System Architecture · 5 Technical Roadmap · 6 Implementation Master Plan.*
*Execution begins with S0.1 — a half-week PR that closes the most serious open issue in the product.*
