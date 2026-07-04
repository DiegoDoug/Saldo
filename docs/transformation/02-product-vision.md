# Saldo Transformation — Document 2: Product Vision

**Status:** Complete — awaiting confirmation before Document 3 (Information Architecture & UX)
**Builds on:** Document 1 (Architecture Review). The vision below assumes the three consolidation decisions from that review: one ledger-centric financial model, integer money, and a client-side security model worthy of financial data.

---

## 1. Mission

**Give people a complete, private picture of their money — on infrastructure they own, that works everywhere, forever.**

Saldo exists for people who believe their financial history is too sensitive and too permanent to rent: too sensitive to hand to an ad-funded aggregator, too permanent to trust to a startup that may shut down and take a decade of records with it.

## 2. Vision

In five years, Saldo is **the default self-hosted personal finance platform** — the thing people mean when they say "the Home Assistant of personal finance": a polished product (not a hobbyist toy) that a household installs once on a Pi, NAS, or VPS, uses daily from their phones, and trusts with decades of financial history because the data never leaves hardware they control.

## 3. The strategic wedge

Every leading commercial competitor shares one structural constraint Saldo does not have — and one structural advantage Saldo will never match. The strategy is to lean entirely into the asymmetry:

- **They cannot copy:** self-hosting, data sovereignty, offline-first, no subscription, forkability. Monarch ($99/yr), YNAB ($109/yr), Copilot ($95/yr) are cloud SaaS by business model; their unit economics *require* holding your data. Saldo's core promise — "your data, your hardware, zero ongoing cost" — is not a feature they can add.
- **They will always win at:** bank aggregation (Plaid contracts), mobile-native polish, and AI compute at scale. Saldo does not chase bank-sync parity; it makes **manual + imported data entry so fast it stops being a cost**, and treats aggregation as a future opt-in bridge (self-hosted importers), never a dependency.

The honest competitive frame:

| | Monarch / Copilot | YNAB | Lunch Money | Actual Budget (OSS) | **Saldo** |
|---|---|---|---|---|---|
| Data lives | Their cloud | Their cloud | Their cloud | Your server ✓ | **Your server ✓** |
| Offline-first PWA | ✗ | ✗ | ✗ | Partial | **✓ (real)** |
| Full ledger + net worth + goals | ✓ | Budget-only | ✓ | ✓ | ✓ (after unification) |
| Multi-currency native | Weak | ✗ | ✓ | Partial | **✓ (by design)** |
| Price | ~$99/yr | ~$109/yr | ~$50/yr | Free | **Free** |
| Household multi-user | ✓ | ✓ | Partial | ✗ | ✓ (v2: shared households) |

**Actual Budget is the real competitor**, not Monarch. Saldo beats it by being a *platform* (ledger + net worth + goals + forecast + reports, not envelope budgeting only), by first-class multi-currency, and by an install story ("one `docker compose up` on a Pi") plus a UX bar set against commercial apps rather than against other OSS.

## 4. Target audience & personas

**Audience:** privacy-conscious households comfortable with (or adjacent to someone comfortable with) self-hosting — the ~10M-strong and growing Home Assistant / Jellyfin / Immich demographic — plus the international/multi-currency users the US-centric incumbents ignore.

**Persona 1 — Diego, the self-hosting couple's "IT person" (primary).**
30s, runs a Pi/NAS with a few containers, splits finances with a partner, paid in EUR with some USD income. Installs and administers Saldo; his non-technical partner just uses the PWA. *Buys:* sovereignty, one-command install, painless upgrades, backups he controls. *Churns on:* broken upgrades, data-loss scares, partner finding it clunky.

**Persona 2 — Marta, the non-technical household member (the retention test).**
Uses whatever Diego installed, from her phone, often on flaky mobile data. Logs a purchase in under 10 seconds or she stops logging. *Buys:* speed, clarity, the app opening instantly offline. *Churns on:* friction, English-only or Spanish-only mismatch, sync weirdness. **Every UX decision is judged by Marta, not Diego.**

**Persona 3 — Alex, the spreadsheet refugee (growth).**
Years of bank CSVs and a meticulous spreadsheet; distrusts cloud finance apps on principle. *Buys:* lossless CSV import, exportable everything, formulas he can audit (the open domain core is a feature). *Churns on:* import friction — which is why import is MVP, not v2.

**Persona 4 — the contributor/forker (ecosystem).**
Not a "user" but the moat: forks Saldo for a niche (a country's tax quirks, a co-op's books). Served by the vertical-slice architecture, decision records, and contribution docs. The ecosystem is what makes an OSS product durable.

## 5. Core product pillars

1. **Sovereign** — your hardware, your data, lossless export always one click away. Trust is the product.
2. **Instant** — opens offline, every write is local-first, logging an expense takes <10 seconds. Speed is the retention lever for manual entry.
3. **Complete** — one ledger feeding budgets, net worth, goals, forecast, and reports. One entry, every view. (This pillar *is* the Document-1 unification decision.)
4. **Honest** — auditable math (the mirrored domain core), visible sync state, recoverable conflicts, no dark patterns, no upsell.
5. **Multilingual & multi-currency by birth** — Spanish domain soul, i18n UI, ISO-4217 everywhere. The underserved international user is the beachhead the US incumbents concede.

**Unique selling proposition, one sentence:** *The only personal finance app that is genuinely yours — runs on your hardware, works with no connection, costs nothing forever, and still feels like a $100/yr product.*

## 6. North Star Metric

**Weekly Active Households that logged ≥1 transaction (WAH-L).**

It captures the whole chain: install worked → sync works → entry is fast enough that people actually do it → the household (not just the admin) is engaged. Supporting metrics: median time-to-log-a-transaction (target <10s), D30 household retention after install, import success rate, upgrade success rate (self-hosted products die by broken upgrades). Being self-hosted, all telemetry is **opt-in and anonymous**; the metric is also proxied by community signals (GitHub, image pulls) — accepting fuzzier numbers is part of the sovereignty deal.

## 7. Feature philosophy

- **Ledger-first:** every feature reads from the one transaction ledger; no feature creates a second source of truth. (The `Entry`/`Transaction` fork of Document 1 is the standing counterexample and the first thing to fall.)
- **Marta-test:** if a feature adds friction to the daily log-an-expense loop, it ships behind progressive disclosure or not at all.
- **Local-capable by default:** every feature must work offline; server-only features (FX refresh, email) must degrade gracefully.
- **No feature without egress:** anything the app stores, the user can export.
- **AI assists, never gatekeeps** (v3): categorization suggestions, anomaly flags, forecasts — all running against local/self-hosted models where feasible, all overridable, never required. AI strategy gets its full treatment in the roadmap documents.
- **v2 scope discipline stays:** shared households, passkeys, bank-import bridges remain deliberately sequenced, not smuggled in early.

## 8. Product roadmap (product-level; engineering sequencing is Documents 5–6)

**Phase A — Coherence (the "MVP" of the transformed product).**
One financial model: transactions power budgets (per-category monthly limits with progress, replacing dual entry; legacy `Entry` data migrated); integer money; CSV import/export; settings page; onboarding flow; the shared-device security fix. *Exit test: Marta logs one expense and sees it in her budget, her account balance, and the month view — once.*

**Phase B — Daily-driver polish.**
Recurring rules that post themselves + bill reminders; search & filters everywhere; i18n (es/en at parity); notifications (web push, self-hosted); conflict inspector; accessibility audit; E2E-tested offline loop. *Exit test: a household uses nothing else for 90 days.*

**Phase C — Household & depth (v2).**
Shared households (the one place a real domain invariant appears — Document 1's aggregate note); passkeys; debt paydown planning; subscription detection; richer reports; investment/asset tracking beyond snapshots.

**Phase D — Intelligence & ecosystem (v3+).**
Local-first AI (auto-categorization, anomaly detection, cash-flow forecasting, natural-language search); importer bridges (OFX, per-bank community importers as plugins); a stable plugin/API surface for the forker persona; optional managed-hosting partners for the non-Diego market — **without ever making cloud the default**.

**Five-year evolution:** budgeting app → complete household finance platform → the self-hosted finance *ecosystem* (plugins, importers, community models), with Saldo's core staying small, auditable, and free.

---

**STOP.** This concludes Document 2. On confirmation, Document 3 — Information Architecture & UX — will translate these pillars into the concrete sitemap, navigation model, page-by-page purposes, user journeys (first-run, daily log, weekly review, import), and the offline/PWA/accessibility strategy.
