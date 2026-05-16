# Performance Audit — v1.0-v1.1

> Audited: 2026-05-16
> Scope: production-dashboard, analytics, iot, stockpile, fuel, dashboard-site, dashboard-group
> Methodology: static analysis of all service, job, handler, and controller files in scope

---

## Summary

| Severity | Count | Estimated impact |
|---|---|---|
| CRITICAL | 4 | Will break under load or on multi-tenant expansion |
| HIGH | 5 | Measurable >200ms on common path |
| MEDIUM | 4 | Wasteful but acceptable at current scale |
| LOW | 3 | Micro-optimizations |

---

## Findings

### [CRITICAL] PERF-001: SSE delta triggers full snapshot re-fetch on every event

**Location:**
- `apps/web/src/app/features/dashboard-site/pages/site-director-dashboard.component.ts:155`
- `apps/web/src/app/features/dashboard-site/pages/quarry-chief-dashboard.component.ts:110`

**Pattern:** On every SSE `kpi.delta` push, the Angular component unconditionally calls `loadSnapshot()`, which issues a full `GET /api/dashboards/site-director` request that runs 14 parallel database queries aggregated by `DashboardAggregatorService.computeForSiteDirector()`.

**Estimated impact:**
- Under active site conditions, the `production.transport.rotation_completed` event fires on every truck weighing — potentially every 2-5 minutes per truck, with 2-3 trucks running concurrently = 1-3 full-dashboard re-fetches per minute.
- Each re-fetch = 14 parallel queries + 2 sequential queries inside `fetchTonnages` (4 sequential sub-queries) + 4 parallel queries inside `fetchFinanceKpi` + 2 parallel queries inside `fetchHseKpi` + 2 sequential queries inside `vteRevenue`.
- At 10 users watching the dashboard simultaneously, 10 full-aggregation runs per event burst = up to 140+ concurrent queries per event.
- With 10 concurrent users and events arriving at 1/min: ~140 queries/minute sustained baseline from dashboards alone.

**Fix:**
The SSE payload already carries `updated_keys: string[]`. The frontend should selectively re-fetch only the tiles affected by the delta keys rather than the entire snapshot. Implement a tile-level `refreshTile(key)` HTTP call pattern, or have the backend push the full updated value in the SSE payload itself (embed the KPI value in the delta) so the frontend never needs a follow-up REST call for common events. At minimum, debounce `loadSnapshot()` calls to coalesce bursts within a 500ms window.

---

### [CRITICAL] PERF-002: `CostPerTonAggregatorJob` runs fully sequential N×M×K queries with no parallelism

**Location:** `apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts:67-71`, `apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts:103-118`

**Pattern:** The 04:00 UTC cron iterates `tenants → sites → calibres` with three nested sequential `for` loops and `await` inside each. There is no `Promise.all()` at any level. Each `aggregateForDate()` call executes 5 separate SQL queries against different tables.

**Worst-case query count estimate:**
- Current seed: 1 tenant × 1 site × 3 calibres = 3 iterations × 5 queries = **15 queries** (trivial)
- Realistic production at 6-month mark: 3 tenants × 4 sites each × 5 calibres each = **60 iterations × 5 queries = 300 sequential queries**, each taking ~10-50ms on Supabase = **3-15 seconds total**
- Target production (10 tenants × 6 sites × 8 calibres): **480 sequential queries**. At 20ms each = ~10 seconds per run. Blocking the event loop on a single-process NestJS instance.
- Additionally, `aggregateForTenant()` fetches `sites` and `calibres` per tenant inside the loop rather than batching both in one pass.

**Fix:**
Change the tenant loop to `Promise.all(tenants.map(...))` with a concurrency limiter (e.g. `p-limit` at 5 concurrent tenants). Within each tenant, parallelize the site × calibre combinations: collect all `(siteId, calibreCode)` tuples first, then `Promise.all` with a ceiling (e.g. 10 concurrent). Also batch the `sites` and `calibres` queries into one round-trip per tenant using a JOIN or single query.

---

### [CRITICAL] PERF-003: `ConsolidationService.consolidate()` issues N sequential FX queries inside a JS loop

**Location:** `apps/api/src/modules/analytics/services/consolidation.service.ts:144`, `apps/api/src/modules/analytics/services/consolidation.service.ts:177`

**Pattern:** `getFx(fromCurr)` is called with `await` inside the `for (const r of revRows)` loop and inside `for (const c of costRows)`. Although the first call per currency is cached in `fxMap`, each unique currency pair hits the DB once per loop iteration on cache miss. More critically, `await getFx()` inside a `for...of` loop means each row is processed fully sequentially — even rows that share the same already-cached currency must wait for prior `await`s to settle.

**Estimated impact:**
- A 90-day consolidation period with 3 sites × 5 contracts × 2 currencies = ~30 `revRows`. Each iteration `await`s even when cached. Sequential await overhead for 30 rows at 0.1ms each is negligible, but with 3 distinct currencies, 3 DB queries fire sequentially (not parallel) before `fxMap` is warm.
- For a group with 8 sites across EUR/XOF/XAF: 3 FX queries fire sequentially inside the loop instead of being prefetched in parallel before iteration begins.
- The `GET /api/analytics/consolidation` endpoint, called on every load of the group dashboard (no caching), recomputes this from scratch each time.

**Fix:**
Collect all unique `currency` values from `revRows` before the loop. Pre-warm `fxMap` with `Promise.all([...uniqueCurrencies].map(getFx))`. Then iterate `revRows` and `costRows` synchronously (no `await` inside the loops) using the pre-warmed map. This eliminates all sequential I/O from inside the aggregation loops.

---

### [CRITICAL] PERF-004: `FuelReconciliationJob` fetches all tanks cross-tenant without scoping

**Location:** `apps/api/src/modules/fuel/jobs/fuel-reconciliation.job.ts:42-44`

**Pattern:**
```sql
SELECT id FROM fuel_tank
```
No `WHERE` clause. This fetches every tank across all tenants and sites in one query. Then `runForTank(tank.id)` is called sequentially for each, and each `runForTank` call re-fetches the tank's `tenant_id` and `site_id` from the DB — a per-tank lookup that was already available in the parent query.

Additionally `runForTank` itself issues 4 queries per tank: `SELECT fuel_tank`, `SUM(fuel_tank_event)`, `SELECT fuel_tank_balance`, `fetchCurrentOperationalDayId` + the `fuelEventService.append()` (which is itself a DB write). That is 5 DB round-trips per tank, all sequential.

**Estimated impact:**
- 4 tanks currently = 4 × 5 = 20 sequential queries at 03:30 UTC.
- At 20 sites × 3 tanks each = 60 tanks × 5 queries = 300 sequential queries. At 20ms each = 6 seconds blocking the event loop.
- The missing `WHERE` clause is also a correctness risk: if multi-tenancy is enforced via RLS, cross-tenant leakage is prevented at the DB layer. But the application logic currently ignores tenant context when selecting tanks, which will silently process tanks for inactive tenants.

**Fix:**
Add `WHERE is_active = true` (or an appropriate `status` filter) and join `tenant_id` + `site_id` into the initial query so the per-tank refetch is eliminated. Parallelise with `Promise.all` + concurrency limiter. Fetch `currentOperationalDayId` once per `(tenant, site)` group instead of once per tank.

---

### [HIGH] PERF-005: `fetchTonnages` executes 4 sequential queries that can be merged into 1

**Location:** `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts:206-268`

**Pattern:** `fetchTonnages` fires four independent `this.ds.query()` calls sequentially (one per time window: today, yesterday, week, month). Each query does a `JOIN operational_day` to resolve the date. All four hit the same `stockpile_event` table with the same `(tenant_id, site_id, event_type)` predicate, differing only in the date window.

**Estimated impact:** 4 sequential queries at ~10-30ms each = 40-120ms added latency per dashboard load, on the critical path of `computeForSiteDirector` (even though it is called via `Promise.all`, it occupies one slot that blocks the overall `Promise.all` from settling until all 4 sub-queries complete).

**Fix:** Merge into a single query using conditional aggregation:
```sql
SELECT
  COALESCE(SUM(tonnage_delta_kg) FILTER (WHERE od.date = od_today.date), 0) AS today_kg,
  COALESCE(SUM(tonnage_delta_kg) FILTER (WHERE od.date = od_today.date - 1), 0) AS yesterday_kg,
  COALESCE(SUM(tonnage_delta_kg) FILTER (WHERE od.date >= od_today.date - 6), 0) AS week_kg,
  COALESCE(SUM(tonnage_delta_kg) FILTER (WHERE od.date >= od_today.date - 29), 0) AS month_kg
FROM stockpile_event se
JOIN operational_day od ON od.id = se.operational_day_id AND od.tenant_id = se.tenant_id
JOIN operational_day od_today ON od_today.id = $3 AND od_today.tenant_id = $1
WHERE se.tenant_id = $1 AND se.site_id = $2 AND se.event_type = 'STOCKPILE_INFLOW'
  AND od.date >= od_today.date - 29
```
This cuts 4 queries to 1, reducing tonnage fetch latency from ~40-120ms to ~10-30ms.

---

### [HIGH] PERF-006: `vteRevenue` executes 2 sequential queries that can be parallelised or merged

**Location:** `apps/api/src/modules/production-dashboard/services/phase3-kpi.service.ts:102-103`

**Pattern:**
```typescript
const week = await computeForWindow('7 days');
const month = await computeForWindow('30 days');
```
Two identical queries against `bon_de_livraison JOIN sale_contract` with different `INTERVAL` values run sequentially instead of in parallel. Both are on the hot path of `computeForSiteDirector`.

**Estimated impact:** ~10-25ms of unnecessary serialisation per dashboard load. Multiplied by SSE-triggered re-fetches (PERF-001) this adds up.

**Fix:** Either `Promise.all([computeForWindow('7 days'), computeForWindow('30 days')])`, or merge into a single query:
```sql
SELECT
  COALESCE(SUM(...) FILTER (WHERE bl.signed_at_utc >= NOW() - INTERVAL '7 days'), 0) AS week_rev,
  COALESCE(SUM(...) FILTER (WHERE bl.signed_at_utc >= NOW() - INTERVAL '30 days'), 0) AS month_rev
FROM bon_de_livraison bl JOIN sale_contract sc ON ...
WHERE bl.tenant_id = $1 AND bl.site_id = $2 AND bl.status = 'signed'
  AND bl.signed_at_utc >= NOW() - INTERVAL '30 days'
```

---

### [HIGH] PERF-007: `IotIngestionService.ingestBulk` processes payloads sequentially

**Location:** `apps/api/src/modules/iot/services/iot-ingestion.service.ts:56-66`

**Pattern:** `ingestBulk` iterates payloads with `for...of` + `await this.ingest(p)`. Each `ingest` call does a DB `save` + inline `sanity.validateReading`. The comment on line 44 explicitly notes "for high throughput, switch to BullMQ background job" but this has not been implemented.

**Estimated impact:** Edge gateway backfill after WAN reconnection can send 7 days × N readings. If a device sends 1 reading/minute for 7 days = 10,080 readings per device. With 3 devices per site and sequential processing at ~15ms/reading: 3 × 10,080 × 15ms = **7.6 minutes blocking**. During this time, the Node.js event loop is saturated by the sequential `await` chain, degrading all other API requests.

**Fix (Phase 9 BullMQ path):** Decouple `ingestBulk` from inline validation — write all raw rows in a single batch `INSERT` (one round-trip), then push validation jobs to a BullMQ queue. At minimum before Phase 9, do `Promise.all` with a concurrency limiter of 20-50 for the bulk path.

---

### [HIGH] PERF-008: `AlertDispatcherService.dispatch` is called synchronously in `@OnEvent` handlers and issues per-event DB queries on the event-emitter thread

**Location:** `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts:135-153`

**Pattern:** `dispatch()` is `async`, but it's called from `@OnEvent` handlers which are not themselves awaited by NestJS EventEmitter (fire-and-forget). The `dispatch` method does `AlertRule.find()` (a TypeORM ORM call that fetches all rules for a tenant+eventType), then loops rules and may issue `resolveRecipients()` (another `user` table query), then calls an email/SMS provider. All of this happens inline in the event handler.

**Estimated impact:**
- On a busy site day: `hse.incident.created` fires, triggering `AlertDispatcherService`. If `alert_rule` has 5 rules with email + SMS channels, `dispatch` executes: 1 `find(AlertRule)` + up to 5 × `resolveRecipients()` (each is a `user` table query) + 5 provider calls. That is 11+ DB/network calls per event.
- If 3 incidents are created in quick succession (bulk HSE report), 3 × 11 = 33 parallel async I/O chains fire simultaneously with no backpressure mechanism.

**Fix:** Move `dispatch()` to a BullMQ job. The `@OnEvent` handler should only enqueue the job payload (synchronous, no DB). The worker consumes the queue at a controlled rate. Until BullMQ lands, add a `setImmediate()` wrapper to at least defer execution off the current event-loop tick.

---

### [HIGH] PERF-009: Group dashboard P&L computed at request time with no caching

**Location:** `apps/web/src/app/features/dashboard-group/dashboard-group.component.ts:58-74`, `apps/api/src/modules/analytics/services/consolidation.service.ts:48-69`

**Pattern:** `DashboardGroupComponent.ngOnInit()` calls `GET /api/analytics/consolidation?pivot=XOF&from=YYYY-01-01&to=YYYY-12-31` on every component mount. The backend `ConsolidationService.consolidate()` executes two full-year table scans (`bon_de_livraison` JOIN `sale_contract`, and `cost_per_ton_snapshot`) with no result caching. Every time a Group Director opens the dashboard (page load, tab switch, component remount) the full scan runs.

**Estimated impact:**
- For a 365-day window with 4 sites × 50 BLs/day: `bon_de_livraison` scan over 73,000 rows + `cost_per_ton_snapshot` scan over 4 × 365 × 3 = 4,380 rows. Unindexed `delivery_date BETWEEN` scans at this scale: 200-500ms per query pair.
- There is also no HTTP caching header (`Cache-Control`, `ETag`) on the `/analytics/consolidation` endpoint, so each page visit hits the DB.

**Fix:** Cache the consolidation result in Redis with a TTL of 15-30 minutes (acceptable staleness for a financial summary dashboard). Key: `consolidation:{tenantId}:{pivot}:{from}:{to}`. Invalidate on `production.vte.bl_signed` and `cost_per_ton_snapshot` upsert. Alternatively, materialize the yearly rollup in `cost_per_ton_snapshot` at the month boundary (the nightly cron already writes daily snapshots).

---

### [MEDIUM] PERF-010: `drilling_yield_per_machine_day` MV refresh is global (cross-tenant) on every hole_drilled event

**Location:** `apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts:65-66`

**Pattern:**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY drilling_yield_per_machine_day
```
This SQL statement refreshes the entire materialized view for all tenants, not just the tenant that triggered the event. The debounce (30s) mitigates burst, but during peak drilling hours (say 20 holes drilled in 30s on one tenant), a single refresh fires — which is correct. However, at 3 active tenants drilling concurrently, up to 3 parallel `REFRESH MATERIALIZED VIEW CONCURRENTLY` can run simultaneously. This command takes an `ExclusiveLock` on the MV while scanning the underlying `drilled_hole` table — blocking concurrent reads on the MV including the `fetchDrillingYield` dashboard query.

**Estimated impact:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` duration scales with `drilled_hole` row count. At 12 months of data × 50 holes/day × 3 sites = ~54,000 rows, a full refresh takes 50-200ms and briefly degrades dashboard reads.

**Fix:** Partition the MV by `tenant_id` (using conditional refresh logic or a tenant-scoped view per schema) so only the affected tenant's data is refreshed. Short-term: add `AND tenant_id = $tenantId` to the underlying query via a parameterized function `REFRESH MATERIALIZED VIEW ... WHERE tenant_id = '...'` — note Postgres does not support parameterized MV refresh natively, so the alternative is a plain view with a real-time query, or a per-tenant summary table maintained via trigger.

---

### [MEDIUM] PERF-011: `fetchHseKpi` computes TF (frequency rate) twice per dashboard load

**Location:**
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts:320-339` (`fetchTf`)
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts:630-656` (`fetchHseKpi`)

**Pattern:** `fetchTf` and `fetchHseKpi` are both called in the top-level `Promise.all` of `computeForSiteDirector`. `fetchTf` computes `tf_rolling_12m` from the `alert` table scanning 12 months of HSE incidents. `fetchHseKpi` then assigns `tf_rolling_12m: 0` (hardcoded comment: "already computed in main flow, duplicated here for interface completeness"). The TF scan inside `fetchTf` is thus performed and the result is wired to `SiteDirectorDashboard.tf_rolling_12m`, while `HseKpi.tf_rolling_12m` is always 0. This means `fetchTf` runs a 12-month `alert` table scan that could be eliminated by folding TF into `fetchHseKpi`.

**Fix:** Remove `fetchTf` as a separate parallel call. Compute TF inside `fetchHseKpi` alongside `incidents_open_count` and `audit_conformity_pct`, returning it in the `HseKpi` struct. The dashboard aggregator maps `hse_kpi.tf_rolling_12m` to `tf_rolling_12m`. This saves one 12-month `alert` table scan per dashboard load.

---

### [MEDIUM] PERF-012: `alerts.service.ts` `list()` returns unbounded result set

**Location:** `apps/api/src/modules/alerts/alerts.service.ts:68`

**Pattern:**
```typescript
return this.repo.find({ where, order: { createdAtUtc: 'DESC' } });
```
No `take` or `skip`. For a site with sustained HSE activity (30+ alerts/month over 12 months = 360+ rows), this serialises and transfers every row to the caller on each call. The alerts inbox also lacks pagination in its query path.

**Fix:** Add `take: 50` default with an optional `cursor`/`page` parameter. Apply an index on `(tenant_id, site_id, status, created_at_utc DESC)` to support efficient keyset pagination.

---

### [MEDIUM] PERF-013: `AnalyticalEntryWriterHandler` event handlers perform a SELECT then INSERT (two round-trips) per event

**Location:**
- `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:117-159` (`onBlSigned`)
- `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:272-334` (`onExtractionCycleRecorded`)
- `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:342-379` (`onRotationCompleted`)
- `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:388-429` (`onCrusherSessionCompleted`)
- `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:438-495` (`onScreeningSessionCompleted`)

**Pattern:** Each handler fires a SELECT to look up parent-table data (e.g. `bon_de_livraison JOIN sale_contract`, or `extraction_cycle JOIN operational_days`), then fires an INSERT. This is 2 sequential round-trips per event, all inline in the `@OnEvent` handler. With `ON CONFLICT DO NOTHING`, idempotency is handled — but the SELECT is still always executed.

**Estimated impact:** At 50 truck rotations/day: 50 × 2 queries = 100 sequential analytical-entry queries emitted from event handlers throughout the day. Not critical at current scale but will accumulate with BullMQ migration scope.

**Fix:** Pass sufficient context in the event payload (e.g. `delivery_date`, `site_id`, `unit_price_minor_units`) so the SELECT is unnecessary and the INSERT can fire directly. This is the standard pattern for enriched events in event-sourced systems. Address during Phase 9 event-schema refinement.

---

### [LOW] PERF-014: `SseBroadcasterService` logs `logger.log()` on every `register`, `unregister`, and replay — verbose at scale

**Location:** `apps/api/src/modules/production-dashboard/services/sse-broadcaster.service.ts:71,84,133`

**Pattern:** Three `this.logger.log()` calls fire on every client connect/disconnect/replay. With 10 concurrent users refreshing tabs, this emits ~30+ log lines per minute to Pino/Loki. Not harmful at low scale, but at 50 concurrent users this is noise.

**Fix:** Downgrade to `this.logger.debug()`. Reserve `logger.log()` for error/warn paths.

---

### [LOW] PERF-015: `cost-per-ton-aggregator.service.ts` uses two correlated subqueries in `equipment_refuel` and `work_order` queries

**Location:** `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts:57-62`, `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts:68-76`

**Pattern:**
```sql
AND er.equipment_id IN (SELECT id FROM production_equipment WHERE site_id = $3)
AND wo.equipment_id IN (SELECT id FROM production_equipment WHERE site_id = $3)
```
Two correlated `IN (SELECT ...)` subqueries on the same `production_equipment` table. Postgres will usually optimise these as hash semi-joins, but they are redundant — the same subquery is issued twice per aggregation run.

**Fix:** Use a JOIN instead:
```sql
JOIN production_equipment pe ON pe.id = er.equipment_id AND pe.site_id = $3
```
Or batch both into a single CTE. Minimal impact at current data volume but cleaner.

---

### [LOW] PERF-016: `source_event_type LIKE 'hse.incident.%'` on the `alert` table is a non-indexable predicate

**Location:**
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts:332`
- `apps/api/src/modules/production-dashboard/services/dashboard-aggregator.service.ts:637`

**Pattern:** `LIKE 'hse.incident.%'` is a prefix-anchored pattern which Postgres *can* use a B-tree index on if a `text_pattern_ops` index exists. No such index is evidenced in the migration files reviewed. Without it, this is a full sequential scan filter on every TF / incident-open query.

**Fix:** Add a partial index: `CREATE INDEX idx_alert_hse_incident ON alert (tenant_id, site_id, status, created_at_utc) WHERE source_event_type LIKE 'hse.incident.%'` — or better, add a `category` column (`'hse' | 'production' | 'maintenance'`) and filter on that, which is directly indexable.

---

## Phase 7 Specific Findings

### 04:00 UTC Cron — Worst-case query count

| Parameter | Conservative (6mo) | Production target |
|---|---|---|
| Tenants | 3 | 10 |
| Sites per tenant | 4 | 6 |
| Calibres per tenant | 5 | 8 |
| Tuples processed | 60 | 480 |
| DB queries per tuple | 5 | 5 |
| **Total DB queries** | **300** | **2400** |
| Sequential execution estimate | ~6s | ~48s |
| With `Promise.all` (10 concurrent) | ~1s | ~8s |

The job currently has zero parallelism. At 480 tuples with 5 queries each at 20ms average: 48 seconds of sequential execution. This saturates the single DB connection from NestJS and delays all other API requests until 04:00 UTC + 48s. The fix in PERF-002 is essential before production scale.

### Group dashboard P&L — cached vs computed

The `GET /api/analytics/consolidation` endpoint has no cache layer. Every Group Director browser load issues a full-year scan. There is no `finance_kpi` / `hse_kpi` path into the SSE stream for the group dashboard — the `DashboardGroupComponent` is REST-only, which is correct for a periodic-refresh use case, but the lack of any server-side caching means each of N Group Director users causes N full-year scans.

### Finance/HSE KPI tiles — stream vs REST

Finance KPIs (`fetchFinanceKpi`) and HSE KPIs (`fetchHseKpi`) are included in the `computeForSiteDirector` response and therefore flow through the SSE-triggered snapshot re-fetch (PERF-001). They are not independently updatable. This means even a `maintenance.work_order.opened` event (which doesn't affect finance or HSE KPIs) causes `fetchFinanceKpi` and `fetchHseKpi` to run. Finance KPI queries include a 30-day `analytical_entry` aggregation on each re-fetch.

---

## Index Gaps (inferred from query patterns, no migration audit performed)

| Table | Missing index | Used by |
|---|---|---|
| `alert` | `(tenant_id, site_id, status, source_event_type)` with text_pattern_ops | `fetchTf`, `fetchHseKpi`, `fetchOpenIncidents` |
| `analytical_entry` | `(tenant_id, site_id, entry_date, cost_center)` | `fetchFinanceKpi` (3 queries), `CostPerTonAggregatorService` |
| `stockpile_event` | `(tenant_id, site_id, operational_day_id, event_type)` | `fetchTonnages` (4 queries), `CostPerTonAggregatorService` |
| `bon_de_livraison` | `(tenant_id, site_id, status, signed_at_utc)` | `vteRevenue` (2 queries), `ConsolidationService` |
| `cost_per_ton_snapshot` | `(tenant_id, site_id, snapshot_date DESC)` | `fetchFinanceKpi` LIMIT 1 |
| `fuel_tank` | `(tenant_id, site_id)` | `FuelReconciliationJob` cross-tenant query |

---

## Priority Remediation Order

1. **PERF-001** — Debounce/selective SSE re-fetch (Angular): prevents DB storm under real usage. 1 day effort.
2. **PERF-002** — Parallelize `CostPerTonAggregatorJob`: must land before scale-out. 0.5 day.
3. **PERF-003** — Pre-warm FX map in `ConsolidationService`: 1 hour fix.
4. **PERF-004** — Scope `FuelReconciliationJob` fuel_tank query + parallelize: 0.5 day.
5. **PERF-005** — Merge 4 tonnage queries into 1: 2 hour fix.
6. **PERF-006** — Parallelize `vteRevenue` sub-queries: 30 minute fix.
7. Index gaps table above: 1 migration file, 1 hour.
8. **PERF-009** — Redis cache on consolidation endpoint: 1 day (requires Redis wiring).
