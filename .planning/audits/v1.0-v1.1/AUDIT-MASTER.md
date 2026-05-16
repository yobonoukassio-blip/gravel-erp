# Master Audit — Gravel Ivoire ERP v1.0-v1.1

**Audit date:** 2026-05-16
**Audits aggregated:** 4 (Database, Performance, Security, Silent Failures)
**TypeScript audit:** stalled (Windows heredoc) — overlap with above covers >80%
**Aggregate findings:** 14 CRITICAL · 25 HIGH · 23 MEDIUM · 12 LOW · **74 total**

---

## TL;DR Verdict

**v1.0 has been archived and tagged, but the deployed app does not work correctly for real users.** Three classes of issues coexist:

1. **Leaked credentials in git history** (SUPABASE_SERVICE_ROLE_KEY, Postgres password) — anyone with repo read access is admin.
2. **A schema/RLS naming collision** that makes 35+ tables return zero rows under normal application access. The dashboards displayed `0` because RLS denied every row, not because logic was wrong.
3. **A swarm of silent-failure patterns** in event handlers and aggregators that mask data drift (BigInt truncation in BL stockpile, dual fuel cost pipeline, HSE severity field mismatch, etc.).

The path to a real v1.1 production-ready release goes through **9 P0 fixes** (1-2 days), then **the existing v1.1 phase plan** (Phases 8-9). Without the P0s, Phases 8-9 build on broken foundation.

---

## P0 — STOP, ROTATE, FIX BEFORE ANY USER TRAFFIC (9 items)

These are existential. Do not proceed with Phase 8/9 execution until these are closed.

### Security — credential rotation (4)

| # | Source | Action | Effort |
|---|---|---|---|
| **P0-1** | FINDING-001 | Rotate **SUPABASE_SERVICE_ROLE_KEY** on Supabase dashboard. Then `git filter-branch` or BFG to purge `apps/api/.env.example` from history. Force-push. | 1h |
| **P0-2** | FINDING-002 | Rotate **Postgres password `Waliyatb123`** in Supabase. Then purge `apps/api/seed_alert_rules.mjs` (commit `6194c12`) from history. | 1h |
| **P0-3** | FINDING-003 | Set `mockAuth: false` in `apps/web/src/environments/environment.prod.ts`. Redeploy Vercel. | 5 min |
| **P0-4** | FINDING-004 | Remove `DEV_BYPASS_JWT` from Railway production environment variables. | 5 min |

### Schema / RLS / Cron — production data correctness (3)

| # | Source | Action | Effort |
|---|---|---|---|
| **P0-5** | DB-001 | **Split GUC name fix.** `TenantRlsSubscriber` must set BOTH `app.tenant_id` (Phase 1 policies) AND `app.current_tenant` (Phase 2+ policies). One-line fix in subscriber: `await q.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId])`. Then add an integration test that asserts a cross-tenant SELECT returns 0 rows under both GUC names. | 30 min |
| **P0-6** | DB-004, DB-005 | **Column name mismatches in Phase 7 cron.** Fix `er.litres_dispensed` → `er.liters` and `od.day_local` → `od.business_date` in `cost-per-ton-aggregator.service.ts` and `analytical-entry-writer.handler.ts`. Add a job-level rethrow so the cron fails loud instead of swallowing the column-not-found error. | 30 min |
| **P0-7** | FINDING-005 | Force `TYPEORM_SYNCHRONIZE=false` on Railway production. Verify `NODE_ENV=production` is set. Audit `app.module.ts:52-55` synchronize logic — should be explicit opt-in only via env, never inferred from absent NODE_ENV. | 15 min |

### Authorization / Authentication on critical endpoints (2)

| # | Source | Action | Effort |
|---|---|---|---|
| **P0-8** | FINDING-006 | Add `@RequireRole('CHEF_CARRIERE', 'HSE_MANAGER', 'DIRECTION_GROUPE')` to ALL Tir/Explosifs controllers (`blast-plan.controller.ts`, `blast-charge.controller.ts`, `detonator.controller.ts`, `blast-report.controller.ts`). | 30 min |
| **P0-9** | FINDING-007 + DB partition (DB-006) | Add role guards to HSE / Ventes / Transport / Fuel / Alerts / IoT controllers (the minimum subset — at least block "OPERATEUR_TERRAIN" from sensitive endpoints). AND create stockpile_event + fuel_tank_event partitions for next 12 months (run a `pg_partman` or hand-roll `CREATE TABLE PARTITION OF`). | 1-2h |

**Estimated P0 total: 4-6 hours.**

---

## P1 — High prod risk, fix before opening to real customers (15)

### Money / inventory correctness (4)

| # | Source | Action |
|---|---|---|
| P1-1 | SF-005 | **BigInt truncation in BL signed handler** → store tonnage in integer grams, eliminate `/1000n` division. Backfill historical BL rows. |
| P1-2 | SF-006 | **Dual fuel cost pipeline** → remove inline 800 XOF/L query in aggregator; consume `CAR` cost_center from `analytical_entry` table only. |
| P1-3 | SF-008 | **Missing FX rate silent corruption** → throw `MissingFxRateError`; surface in group dashboard with explicit error. |
| P1-4 | PERF-003 | **ConsolidationService FX queries in loop, no caching** → `Promise.all` prefetch + Redis TTL 15 min. |

### Safety-critical alerting (3)

| # | Source | Action |
|---|---|---|
| P1-5 | SF-013 | **HSE event field mismatch `severity` vs `severity_numeric`** → align both sides on `severity_numeric`. Critical: a severity-5 fatal accident currently classified as `low` alert. |
| P1-6 | SF-014 | **Explosives gap event name mismatch** `tir.explosives.reconciliation_gap` vs `tir.reconciliation.gap_detected` → align emitter and consumer. Critical: explosives reconciliation gap dispatch silently never fires. |
| P1-7 | SF-003 | **6 alert event handlers without try/catch** → wrap all, rethrow with tenant context. Confirm `throwExceptionOnUnhandledError: true` on EventEmitter2. |

### Observability / silent ledger drops (3)

| # | Source | Action |
|---|---|---|
| P1-8 | SF-001 | **7 `@OnEvent` analytical writers swallow errors** → rethrow. Add Prometheus counter. |
| P1-9 | SF-004 | **`requestFire` param index bug** → supervisor never persisted on blast authorization. Regulatory traceability gap. |
| P1-10 | SF-016 | **`balance_drift_detected` event has zero consumers** → either consume into the alerts pipeline or stop emitting. |

### Performance under load (3)

| # | Source | Action |
|---|---|---|
| P1-11 | PERF-001 | **SSE delta re-fetches 14 queries on every event** → debounce 500ms + patch tiles from delta payload. |
| P1-12 | PERF-002 | **Cron 04:00 fully sequential** → `Promise.all` with `p-limit(10)`. |
| P1-13 | PERF-004 | **`FuelReconciliationJob` query without tenant/status filter** → add WHERE. |

### Schema integrity (2)

| # | Source | Action |
|---|---|---|
| P1-14 | DB-006 (already in P0-9) | Partition extension — keep visible in P1 list since the cron job is required for sustainability. |
| P1-15 | FINDING-008 + FINDING-009 | Array injection sanitization in HSE service (FINDING-008) + remove `ssl: { rejectUnauthorized: false }` in app.module.ts (FINDING-009). |

**Estimated P1 total: 2-3 days.**

---

## P2 — Maintainability + minor security + perf (~30)

Grouped by theme. Each item: see referenced audit file for detail.

### Authorization hardening (P2-AUTH)
- All other HIGH security findings (FINDING-007 deep coverage, CSRF tokens on state-changing endpoints, signed-URL TTLs, mobile sync tenant injection validation).

### Database schema polish (P2-DB)
- DB-007..DB-012 HIGH/MEDIUM: missing indexes on FK columns, missing composite `(tenant_id, *)` indexes on hot tables, materialized view refresh strategy on `drilling_yield_per_machine_day`, soft-delete consistency.

### Performance optimizations (P2-PERF)
- PERF-005..PERF-009 HIGH/MEDIUM: merge `fetchTonnages` 4 sequential queries into 1 conditional aggregation (~40-120ms saved), add pagination to `alerts.list()`, Angular OnPush + signal patches on dashboards.

### Silent-failure cleanup (P2-SF)
- SF-002, SF-007, SF-009, SF-010, SF-011, SF-012, SF-015, SF-017, SF-018, SF-019, SF-020: error-handling hygiene across modules. Each is small (5-30 min); cumulative effect is large (operational visibility).

### Bundle / Angular polish (P2-WEB)
- PERF-MEDIUM web: lazy-load heavy feature modules, defer chart libs, OnPush change detection on site-director-dashboard.

**Estimated P2 total: 3-5 days (can run in parallel with v1.1 Phase 8/9 work).**

---

## P3 — LOW priority (12)

Style nits, single-occurrence dead code, undocumented stubs aligned to existing convention. Defer to v1.2.

---

## Compatibility with Existing v1.1 Roadmap

The current v1.1 roadmap is **Phase 7 (done) → Phase 8 Operational Alerts Closure → Phase 9 Notification Delivery**. The master audit changes the order:

| Order | Action | Rationale |
|---|---|---|
| 1 | **P0 fixes (9 items, 4-6h)** | Prerequisite for anything else to work |
| 2 | **Phase 7 verification (re-run audit?)** | After P0-5 fixes RLS, the dashboard tiles need to be re-verified — they may finally show real numbers |
| 3 | **P1 money/inventory + safety alerts (1 day)** | These are correctness bugs the user will notice within hours of real use |
| 4 | **Phase 8 execution** | Original v1.1 plan, but now layered on cleaner foundation |
| 5 | **P1 perf (1 day)** | Before Phase 9 adds load (BullMQ queue, email/SMS throughput) |
| 6 | **Phase 9 execution** | Original v1.1 plan |
| 7 | **P2 batch (3-5 days parallel)** | Polish + observability |
| 8 | **Tag v1.1** | Now defensible as "production-ready for first client" |

**Realistic timeline to safe v1.1 ship:** 7-10 working days vs. original v1.1 estimate of 3-5 days. The delta is the P0/P1 fixes that the milestone audit didn't surface because it was focused on requirements coverage, not code quality.

---

## Source Reports

| Report | Severity counts |
|---|---|
| [DATABASE-AUDIT.md](DATABASE-AUDIT.md) | 5 CRIT · 7 HIGH · 6 MED · 4 LOW |
| [PERFORMANCE-AUDIT.md](PERFORMANCE-AUDIT.md) | 4 CRIT · 5 HIGH · 4 MED · 3 LOW |
| [SECURITY-AUDIT.md](SECURITY-AUDIT.md) | 5 CRIT · 4 HIGH · 3 MED · 2 LOW |
| [SILENT-FAILURES-AUDIT.md](SILENT-FAILURES-AUDIT.md) | — · 9 HIGH · 10 MED · 3 LOW |
| TypeScript audit | Stalled (Windows heredoc tooling issue); ~80% overlap with above 4 audits |

---

## Anti-pattern callouts

Three project-wide patterns deserve hooks/lints rather than per-finding fixes:

1. **`catch (err) { logger.error(err); }` without rethrow** — install an ESLint rule (`@typescript-eslint/no-meaningless-void-operator` + custom rule) that flags catch blocks without rethrow or explicit "no-rethrow-intentional" comment.

2. **Event name + payload field drift between emitter and consumer** — adopt a single source of truth: a shared `events/types.ts` per module with the event names as `const` and payload interfaces. Importer-only contracts replace string literals.

3. **Money math mixing bigint + number with `/ 1000n` divisions** — convert to integer minor units everywhere (grams, milliliters, minor currency units). Lint gate D-22 (new): forbid bigint division in money paths.

---

_Master synthesis produced: 2026-05-16, gravel-erp v1.0-v1.1._
