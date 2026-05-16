# Database & Schema Audit — v1.0-v1.1

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 5 |
| HIGH | 7 |
| MEDIUM | 6 |
| LOW | 4 |

---

## Findings

### [CRITICAL] DB-001: RLS GUC name split — module tables invisible to the application role

**Location:** `apps/api/src/common/typeorm/tenant-rls.subscriber.ts` (line 50) vs every module-level migration in `apps/api/src/modules/`

**Issue:** `TenantRlsSubscriber.afterTransactionStart` calls `set_config('app.tenant_id', ...)`. Phase 1 core tables (`tenants`, `countries`, `sites`, `operational_days`, `shifts`, `fx_rates`) have policies keyed on `app.tenant_id`, which is correct. But every table created from Phase 2 onward uses a different GUC name: `app.current_tenant`. This includes `drilling_plan`, `drilled_hole`, `stockpile`, `stockpile_event`, `fuel_tank`, `fuel_tank_event`, `equipment_refuel`, `equipment_fuel_consumption`, `extraction_cycle`, `truck_rotation`, `weighing_ticket`, `crusher_session`, `screening_session`, `blast_plan`, `explosives_event`, `blast_report`, `detonator`, `hse_incident`, `alert`, `analytical_entry`, `cost_per_ton_snapshot`, `budget`, `alert_rule`, `work_order`, `spare_part`, `employee`, `shift_entry`, and all IoT tables. Because `app.current_tenant` is never set, `current_setting('app.current_tenant', true)` returns an empty string, which casts to `NULL::uuid`. The policy `USING (tenant_id = NULL::uuid)` evaluates to UNKNOWN (not TRUE), so zero rows are returned. `gravel_app` receives empty result sets for every query against these tables.

**Impact:** Complete data invisibility for the application role across the entirety of Phases 2–7. Every operational write (stockpile events, fuel events, BLs, extraction cycles, HSE incidents, analytical entries) succeeds at the DB level because INSERT policies also evaluate to NULL = permissive for some Postgres versions, but SELECT returns nothing. The RLS is not a security bypass — it is broken data access. Dashboards and API endpoints return empty responses for all operational modules.

**Fix:** Change the subscriber to set both GUC names atomically, or standardize every policy to one name. The cleanest fix is to standardize on `app.current_tenant` (already used by 35+ tables) and update the subscriber:

```sql
-- In TenantRlsSubscriber.afterTransactionStart replace:
SELECT set_config('app.tenant_id', $1, true)
-- with:
SELECT set_config('app.tenant_id', $1, true),
       set_config('app.current_tenant', $1, true)
```

Then ship a follow-up migration that rewrites the 9 Phase-1 policies to also use `app.current_tenant` so both GUC names eventually converge on the same value.

---

### [CRITICAL] DB-002: `explosives_event` chain-of-hash is NOT partitioned-safe — `fetchPrevHash` races under concurrent append

**Location:** `apps/api/src/modules/tir/services/explosives-ledger.service.ts` lines 190–204

**Issue:** `fetchPrevHash` selects `MAX ORDER BY occurred_at_utc DESC, id DESC LIMIT 1` without a `FOR UPDATE` or any serialization lock. Two concurrent appends for the same `(tenant_id, site_id)` can both read the same `prev_hash`, compute identical hashes, and insert two rows with the same `prev_hash`. The chain bifurcates. This is exactly Pitfall #6 described in the audit trigger for `audit_chain_state`, which uses `SELECT ... FOR UPDATE` on a dedicated state row. The explosives ledger skips this pattern.

**Impact:** Silent chain corruption for the explosives ledger. The reconciliation job will detect the fork during verification, but the data cannot be self-healed because the table is append-only. Regulatory exposure: OHADA + mining-permit auditors require an unbroken chain for explosives inventory. A bifurcated chain invalidates the entire ledger segment.

**Fix:** Add an `explosives_chain_state` table mirroring `audit_chain_state`:

```sql
CREATE TABLE explosives_chain_state (
  tenant_id UUID NOT NULL,
  site_id   UUID NOT NULL,
  last_hash BYTEA NOT NULL DEFAULT '\x00'::bytea,
  PRIMARY KEY (tenant_id, site_id)
);
```

`fetchPrevHash` must lock this row with `SELECT ... FOR UPDATE` inside the append transaction, then `UPDATE explosives_chain_state SET last_hash = $rowHash WHERE ...` after the INSERT. This is the identical pattern used in `gravel_audit_trigger()`.

---

### [CRITICAL] DB-003: `stockpile_event` RLS policy missing `FORCE ROW LEVEL SECURITY`

**Location:** `apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql` lines 69–72

**Issue:** The migration calls `ALTER TABLE stockpile_event ENABLE ROW LEVEL SECURITY` but does NOT call `FORCE ROW LEVEL SECURITY`. The comment in the Phase 1 RLS migration explicitly states: "FORCE RLS is required because table owners (`gravel_owner`) bypass standard RLS. Without FORCE, migrations and admin sessions silently see all tenants." The same omission affects `fuel_tank_event`, `drilled_hole`, `drilling_plan`, `truck_rotation`, `weighing_ticket`, `hse_incident`, `hse_attachment`, `crusher_session`, `screening_session`, `shift_entry`, `employee`, and every Phase 3–7 module table except `alert`, `extraction_cycle`, `production_equipment`, and `outbox_event` which do have FORCE.

**Impact:** Any query running under `gravel_owner` (which runs migrations and scheduled maintenance scripts) will bypass the RLS policies and see all tenant data. If a migration script or a CRON job connected as `gravel_owner` queries `stockpile_event` or `hse_incident`, it receives rows from every tenant. For the explosives ledger this is a regulatory compliance violation.

**Fix:** Add a remediation migration:

```sql
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stockpile_event','fuel_tank_event','drilled_hole','drilling_plan',
    'truck_rotation','weighing_ticket','hse_incident','hse_attachment',
    'crusher_session','screening_session','shift_entry','employee',
    'analytical_entry','cost_per_ton_snapshot','budget','alert_rule',
    'work_order','spare_part','blast_plan','explosives_event','blast_report'
  ] LOOP
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
```

---

### [CRITICAL] DB-004: `cost-per-ton-aggregator.service.ts` references non-existent column `er.litres_dispensed`

**Location:** `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts` lines 55–62

**Issue:** The fuel cost query joins `equipment_refuel er` and selects `er.litres_dispensed`. The DDL in `1716400200000__create_equipment_refuel.sql` defines the column as `liters` (not `litres_dispensed`). There is no `litres_dispensed` column anywhere in the fuel DDL. The query will throw `column er.litres_dispensed does not exist` at runtime every time the daily aggregation cron fires, causing `cost_carburant_minor = 0` for every snapshot.

**Impact:** Every `cost_per_ton_snapshot` row is silently computed with zero fuel cost. The cost-per-ton KPI displayed on the dashboard and used in OHADA exports understates actual site cost — potentially by 30–50% given fuel is typically the largest operational cost at a quarry. No exception surfaces to the caller because `aggregateForTenant` swallows errors per-tuple.

**Fix:**

```typescript
// Change:
`SELECT COALESCE(SUM(er.litres_dispensed * 800), 0)::bigint AS cost
   FROM equipment_refuel er ...`
// To:
`SELECT COALESCE(SUM(er.liters * 800), 0)::bigint AS cost
   FROM equipment_refuel er ...`
```

---

### [CRITICAL] DB-005: `analytical-entry-writer.handler.ts` references non-existent column `od.day_local`

**Location:** `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts` lines 214–215

**Issue:** The `onFuelRefuelAppended` handler joins `operational_days od` and selects `od.day_local AS op_day_local`. The DDL for `operational_days` (migration `1715500300000__create_operational_day.sql`) defines no `day_local` column — the columns are `business_date`, `shift_start_local`, `iana_timezone`, `started_at_utc`, `ended_at_utc`. The query will fail at runtime for every `production.fuel.refuel_appended` event, and the handler catches the exception silently (`this.logger.error(...)`), meaning no `analytical_entry` row is written for fuel refuels.

**Impact:** The `analytical_entry` ledger is permanently missing all fuel cost entries. `CostPerTonAggregatorService` (which reads from `analytical_entry` for cost centers) will never accumulate CAR costs from the ledger path. OHADA export for carburant is empty.

**Fix:** Replace `od.day_local` with `od.business_date`:

```sql
-- Change:
od.day_local AS op_day_local
-- To:
od.business_date AS op_day_local
```

---

### [HIGH] DB-006: Partition gap — `stockpile_event` and `fuel_tank_event` cover only 3 months, no automated extension

**Location:** `apps/api/src/modules/stockpile/migrations/1716300100000__create_stockpile_event_partitioned.sql` lines 36–41; `apps/api/src/modules/fuel/migrations/1716400100000__create_fuel_tank_event_partitioned.sql` lines 33–38

**Issue:** Both partitioned tables were created with hardcoded partitions for May–July 2026 only. There is no `pg_partman` setup, no cron job, and no migration that creates future partitions. `explosives_event` was better planned with 12 months of 2026 pre-created, but even that will fail come January 2027. `audit_log` uses a `DO $$` loop to pre-create through 2028-01, which is the correct pattern. `stockpile_event` and `fuel_tank_event` will raise `no partition of relation "stockpile_event" found for row` at the first INSERT with `occurred_at_utc >= 2026-08-01`.

**Impact:** All stockpile inflows and fuel deliveries will begin failing on 2026-08-01 00:00:00 UTC. This is a hard production outage — no new events can be appended to the ledger, no balance updates occur, and the chain breaks because no partitions exist to receive rows.

**Fix:** Either install `pg_partman` and configure automatic monthly creation, or add an `@Cron('0 0 1 * *')` job that calls:

```sql
CREATE TABLE IF NOT EXISTS stockpile_event_{YYYY}_{MM}
  PARTITION OF stockpile_event FOR VALUES FROM ('{first}') TO ('{next}');
CREATE TABLE IF NOT EXISTS fuel_tank_event_{YYYY}_{MM}
  PARTITION OF fuel_tank_event FOR VALUES FROM ('{first}') TO ('{next}');
```

As an immediate remediation, add a migration that extends both tables through at least 2027-12.

---

### [HIGH] DB-007: `seed_alert_rules.sql` — all 5 seed rows share the same hardcoded `tenant_id`; no FK constraint on `alert_rule.tenant_id`

**Location:** `apps/api/src/modules/analytics/migrations/1718100000000__seed_alert_rules.sql` lines 29–68; `apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql` line 71

**Issue:** All seed rows use the hardcoded value `24cd97f8-0170-453e-89da-e9213dd710d7` as both the `id` and the `tenant_id`. First problem: two rows with `id = '24cd97f8-...'` cannot both be inserted because `id` is the primary key (`gen_random_uuid()` is the default, but the INSERT explicitly provides the value for rows 1 and 2 using the same UUID). The INSERT will fail with a PK violation for the second row. Second problem: `alert_rule.tenant_id` has no FK reference to `tenants(id)`, so the seed can insert rows for a non-existent demo tenant silently. The `WHERE NOT EXISTS` guard on `(tenant_id, event_type, severity_filter)` will partially protect re-runs but the PK collision makes the first run fail.

**Impact:** The seed migration fails on first run due to duplicate PK. Alert routing is broken for all tenants because no rules exist. `AlertDispatcherService` will find zero rules for every event type and emit no notifications.

**Fix:** Remove the hardcoded `id` values from the VALUES list and let `gen_random_uuid()` apply (it is the DEFAULT). Add a proper FK: `tenant_id UUID NOT NULL REFERENCES tenants(id)`. The demo seed should reference an actual tenant inserted earlier in the migration sequence, or be made conditional on the tenant existing.

---

### [HIGH] DB-008: `TenantRlsSubscriber` does not set GUC when outside an explicit TypeORM transaction — raw `ds.query()` calls in handlers bypass RLS entirely

**Location:** `apps/api/src/common/typeorm/tenant-rls.subscriber.ts`; `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts` (all `this.ds.query(...)` calls)

**Issue:** `TenantRlsSubscriber` hooks into `afterTransactionStart`, which fires only when TypeORM explicitly opens a transaction (`ds.transaction(...)` or `queryRunner.startTransaction()`). The five event handlers in `AnalyticalEntryWriterHandler` call `this.ds.query(...)` directly — no `ds.transaction()` wrapper. These are single-statement auto-committed queries. `afterTransactionStart` never fires, `app.tenant_id` and `app.current_tenant` are never set, and the queries run without tenant context. Because `current_setting('app.current_tenant', true)` returns `''` which casts to NULL, the RLS policy returns no rows — but crucially the INSERT can still land if the policy evaluates permissively, potentially inserting cross-tenant data.

**Impact:** `analytical_entry` rows inserted by event handlers may be written without a valid RLS context, and subsequent SELECT queries from the same handler return nothing. The `CostPerTonAggregatorService` then reads a zero sum from `analytical_entry` even when rows exist if the GUC is not set.

**Fix:** Wrap each handler's `this.ds.query(...)` sequence in `this.ds.transaction(async em => { ... })` or create a dedicated helper that sets the GUC explicitly before the raw query.

---

### [HIGH] DB-009: `drilling_yield_per_machine_day` MV has no REFRESH handler for CONCURRENT — `drilled-hole.handler.ts` must be verified

**Location:** `apps/api/src/modules/foration/migrations/1716000200000__create_drilling_yield_mv.sql`; `apps/api/src/modules/foration/event-handlers/drilled-hole.handler.ts`

**Issue:** The migration comment states the MV is "refreshed CONCURRENTLY 30s-debounced by ForationEventHandlers". The unique index required for `REFRESH MATERIALIZED VIEW CONCURRENTLY` is present (`idx_drilling_yield_unique`). However, the MV aggregates on `(tenant_id, operational_day_id, machine_id, operator_id)` without a `site_id` in the GROUP BY or unique index. A query that filters by `tenant_id` and `operational_day_id` for a dashboard cannot narrow by site_id efficiently. More critically, if the handler ever calls a non-CONCURRENT refresh (e.g. by dropping to `REFRESH MATERIALIZED VIEW drilling_yield_per_machine_day` without the CONCURRENTLY keyword), it takes an exclusive lock that blocks all reads on the MV for the duration of the refresh — which can be seconds on a busy day.

**Impact:** Dashboard read latency spikes whenever the MV refreshes without CONCURRENTLY. A site with 200 drilled holes per day will hold this lock multiple times per shift.

**Fix:** Verify the handler always uses `REFRESH MATERIALIZED VIEW CONCURRENTLY drilling_yield_per_machine_day`. Add `site_id` to the MV GROUP BY and to `idx_drilling_yield_unique` to enable index-only scans on per-site dashboard queries.

---

### [HIGH] DB-010: `CostPerTonAggregatorJob` iterates tenants × sites × calibres with sequential `aggregateForDate` calls — N×M×K query pattern at cron time

**Location:** `apps/api/src/modules/analytics/jobs/cost-per-ton-aggregator.job.ts` lines 67–76, 103–119

**Issue:** The job iterates `for tenant in tenants: for site in sites(tenant): for calibre in calibres(tenant)` and calls `aggregator.aggregateForDate()` per tuple. Each `aggregateForDate` call issues 4 separate SQL queries (stockpile, fuel, work-order, analytical_entry). For a group with 5 sites × 10 calibres, the cron fires 50 `aggregateForDate` calls = 200 SQL round-trips, all sequential. Additionally, `calibres` is queried once per tenant across all sites from `stockpile.calibre_code` — this returns calibres for the tenant globally, not per-site, so sites without certain calibres still trigger unnecessary aggregation.

**Impact:** At 5 sites × 10 calibres, the 04:00 UTC cron takes roughly 200 sequential query round-trips. At production scale (10 sites × 20 calibres = 400 calls × 4 queries = 1600 DB round-trips), this will hold connections for minutes and contend with morning shift start queries.

**Fix:** Rewrite the aggregation as a single SQL `INSERT ... ON CONFLICT DO UPDATE` using window functions over the analytical_entry ledger, joined to stockpile_event for tonnage. The entire job becomes one query per tenant. Alternatively, run site-level aggregations in parallel using `Promise.all`.

---

### [HIGH] DB-011: `explosives_physical_count` table has no RLS and no `FORCE ROW LEVEL SECURITY`

**Location:** `apps/api/src/modules/tir/migrations/1717100400000__create_blast_report.sql` lines 47–58

**Issue:** `explosives_physical_count` is created with no `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, no policy, and no `FORCE ROW LEVEL SECURITY`. The table contains regulated explosives inventory data (physical counts, override authorizations). Any query by `gravel_app` under any tenant GUC context will return rows for all tenants.

**Impact:** Cross-tenant leakage of explosives physical count data. All tenant users can see other tenants' explosives reconciliation records. This is a CRITICAL security and regulatory violation for the TIR module (explosives require strict chain-of-custody per BCEAO/mining regulations).

**Fix:**

```sql
ALTER TABLE explosives_physical_count ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL;
ALTER TABLE explosives_physical_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE explosives_physical_count FORCE ROW LEVEL SECURITY;
CREATE POLICY explosives_physical_count_tenant_iso ON explosives_physical_count
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

---

### [HIGH] DB-012: `hse_incident` uses `REFERENCES operational_day(id)` — singular table name does not match DDL `operational_days`

**Location:** `apps/api/src/modules/hse/migrations/1716500000000__create_hse_incident.sql` line 22; `apps/api/src/modules/extraction/migrations/1716100000000__create_extraction_cycle.sql` line 23

**Issue:** Both `hse_incident.operational_day_id` and `extraction_cycle.operational_day_id` declare `REFERENCES operational_day(id)`. The actual table name defined in `1715500300000__create_operational_day.sql` is `operational_days` (plural). Postgres will reject these FKs with `relation "operational_day" does not exist` when the migrations execute, causing the entire migration to fail. The same mismatch appears in the `stockpile` table which references `REFERENCES zone(id)` but no table named `zone` exists (it would be `production_zones`).

**Impact:** Two module migrations (`hse_incident`, `extraction_cycle`) and the `stockpile` master table will fail to apply, meaning the entire HSE, Extraction, and Stockpile modules cannot be initialized on a fresh database.

**Fix:** Correct the FK references:
- `operational_day(id)` → `operational_days(id)` in `hse_incident` and `extraction_cycle`
- `zone(id)` → `production_zones(id)` in `stockpile`
- `bench(id)` → `benches(id)` in `extraction_cycle`
- `site(id)` → `sites(id)` in `employee`

---

### [MEDIUM] DB-013: RLS policies on analytics tables cast `tenant_id` to text instead of comparing UUID — type mismatch

**Location:** `apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql` lines 27, 45, 67, 83; `apps/api/src/modules/maintenance/migrations/1717300000000__create_maintenance_tables.sql` lines 25, 50, 66, 80, 94; `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` lines 20, 52, 66

**Issue:** These policies use `tenant_id::text = current_setting('app.current_tenant', true)` — casting the UUID column to text before comparing to the GUC string. The correct and consistent pattern used in all other tables is `tenant_id = current_setting('app.current_tenant', true)::uuid`. The text-comparison form prevents the planner from using the `tenant_id` index for RLS filtering, since the index is on the `uuid` type, not on `tenant_id::text`.

**Impact:** Every query on `analytical_entry`, `cost_per_ton_snapshot`, `budget`, `alert_rule`, `work_order`, `spare_part`, and all IoT tables triggers a sequential scan of the full table to evaluate the RLS predicate before applying the query predicate. At volume this adds 50–200ms to any dashboard or analytics query.

**Fix:** Standardize to `tenant_id = current_setting('app.current_tenant', true)::uuid` in all affected policies.

---

### [MEDIUM] DB-014: `crusher_session` and `screening_session` RLS policies missing `true` flag on `current_setting` — will throw on NULL GUC

**Location:** `apps/api/src/modules/concassage/migrations/1717200000000__create_crusher_session.sql` line 50; `apps/api/src/modules/concassage/migrations/1717200100000__create_screening_session.sql` line 50

**Issue:** Both policies call `current_setting('app.current_tenant')` without the second `true` (missing_ok) argument. When the GUC is not set (background jobs, migration sessions), Postgres raises `ERROR: unrecognized configuration parameter "app.current_tenant"` instead of returning NULL. Every other RLS policy uses `current_setting('app.current_tenant', true)` with the missing_ok flag.

**Impact:** Any query on `crusher_session` or `screening_session` from a connection where the GUC has not been set will raise a runtime exception rather than returning an empty result set. This will crash background cron jobs and migration scripts that touch these tables without a tenant context.

**Fix:** Add the `true` flag:
```sql
USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
```

---

### [MEDIUM] DB-015: `TimescaleDB hypertable` creation for `iot_reading_validated` missing — only `iot_reading_raw` is converted

**Location:** `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` lines 23–29

**Issue:** The migration converts `iot_reading_raw` to a hypertable when TimescaleDB is present, but `iot_reading_validated` is created as a plain table with no hypertable conversion. IoT validated readings are the primary source for business dashboards and will grow at the same rate as raw readings. Without Timescale continuous aggregates on `iot_reading_validated`, time-range queries on this table will degrade linearly with data volume.

**Impact:** On a 10-site deployment with 1-minute GPS + fuel sensor readings, `iot_reading_validated` accumulates ~5M rows/month. A 30-day dashboard query without Timescale chunk exclusion will scan the full table.

**Fix:** Add the hypertable conversion for `iot_reading_validated` using the same conditional `DO $$ BEGIN PERFORM ... END $$` pattern immediately after the table DDL.

---

### [MEDIUM] DB-016: `analytical_entry` UNIQUE constraint prevents multiple cost centers from the same source row — will silently discard valid accounting entries

**Location:** `apps/api/src/modules/analytics/migrations/1718000000000__create_analytics_tables.sql` lines 61–62

**Issue:** The unique constraint is `UNIQUE (tenant_id, source_table, source_id, cost_center)`. The `AnalyticalEntryWriterHandler` handlers use `ON CONFLICT (tenant_id, source_table, source_id, cost_center) DO NOTHING` for idempotency, which is correct. However, `onExtractionCycleRecorded` writes one EXT entry per cycle. If a future sprint adds a secondary cost entry (e.g. labor + depreciation) for the same `extraction_cycle` row to the same cost center EXT, the second write will be silently discarded. More immediately, if the handler fires twice (event-emitter retry), the duplicate is correctly ignored. The design is sound for now but the constraint needs documentation.

**Impact:** Low immediate impact, but future cost model extensions that attempt to write multiple accounting lines per source entity to the same cost center will silently fail without error, producing incomplete ledger entries.

**Fix:** Document the constraint behavior explicitly in a migration comment. If multiple entries per `(source_table, source_id, cost_center)` are ever needed, introduce a `sub_account` discriminator column and include it in the unique key.

---

### [MEDIUM] DB-017: `detonator` table has no RLS

**Location:** `apps/api/src/modules/tir/migrations/1717100100000__create_detonator.sql`

**Issue:** The `detonator` table has no `ALTER TABLE detonator ENABLE ROW LEVEL SECURITY`, no policy, and no `FORCE ROW LEVEL SECURITY`. Detonator serial numbers, blast charge assignments, and destruction records are sensitive regulatory data. The table is in the TIR module alongside `explosives_event` (which has RLS) but was missed.

**Impact:** Any `gravel_app` session can read all detonators across all tenants. Cross-tenant detonator serial number leakage violates explosives chain-of-custody regulations.

**Fix:**
```sql
ALTER TABLE detonator ENABLE ROW LEVEL SECURITY;
ALTER TABLE detonator FORCE ROW LEVEL SECURITY;
CREATE POLICY detonator_tenant_iso ON detonator
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

---

### [MEDIUM] DB-018: `spare_part` table has no indexes on `(tenant_id, site_id)` — dashboard spare-part threshold queries will full-scan

**Location:** `apps/api/src/modules/maintenance/migrations/1717300000000__create_maintenance_tables.sql` lines 53–66

**Issue:** `spare_part` has no indexes defined (only the UNIQUE constraint on `(tenant_id, site_id, sku)`). Queries filtering `WHERE tenant_id = $1 AND site_id = $2 AND below_threshold = true` (the alert query) will use the unique index but only if the planner decides to use an index scan on all three columns. Without an explicit index on `(tenant_id, site_id, below_threshold)`, the planner may prefer a sequential scan once rows exceed a few thousand.

**Fix:**
```sql
CREATE INDEX spare_part_tenant_site_threshold_idx
  ON spare_part (tenant_id, site_id, below_threshold)
  WHERE below_threshold = true;
```

---

### [LOW] DB-019: `audit_log` partition range ends at `2028-02-01` — will fail 21 months from now without a partition management procedure

**Location:** `apps/api/src/migrations/1715500500000__create_audit_log.sql` lines 24–42

**Issue:** The `DO $$` loop creates audit_log partitions through `2028-02-01`. There is no automated partition creation job documented or implemented for `audit_log`. A row inserted after 2028-02-01 will raise `no partition found for row`.

**Fix:** Add the audit_log to the same partition maintenance cron as stockpile_event and fuel_tank_event (see DB-006).

---

### [LOW] DB-020: `blast_plan` missing RLS policy — only `ENABLE` is missing

**Location:** `apps/api/src/modules/tir/migrations/1717100200000__create_blast_plan.sql`

**Issue:** `blast_plan` has no `ALTER TABLE blast_plan ENABLE ROW LEVEL SECURITY` and no `CREATE POLICY`. It is a mutable state machine, explicitly noted as not append-only. Without RLS a `gravel_app` user can read all tenants' blast plans. The comment about "NO BEFORE DELETE trigger" confirms the developer was focused on the state-machine semantics and omitted the RLS scaffold.

**Fix:**
```sql
ALTER TABLE blast_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE blast_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY blast_plan_tenant_iso ON blast_plan
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

---

### [LOW] DB-021: `gravel_owner` has hardcoded `change_me_dev` password in the extensions migration — will be applied to production Supabase if not overridden

**Location:** `apps/api/src/migrations/1715500000000__create_extensions_and_roles.sql` lines 24–32

**Issue:** Role creation uses `PASSWORD 'change_me_dev'`. The Supabase compatibility migration (`1715800000000__supabase_app_roles.sql`) creates roles as NOLOGIN, which supersedes this, but on a self-hosted Postgres instance the `gravel_owner LOGIN PASSWORD 'change_me_dev'` will be applied as-is.

**Fix:** Remove the PASSWORD clause from the migration and provision passwords via infrastructure secrets (OpenTofu / Secrets Manager) outside the migration.

---

### [LOW] DB-022: `iot_reading_validated.raw_id` has no FK constraint and no index — orphan validation rows cannot be detected

**Location:** `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` lines 33–46

**Issue:** `raw_id UUID NOT NULL` references the raw reading but declares no `REFERENCES iot_reading_raw(id)`. Since `iot_reading_raw` is (or will be) a hypertable, the FK across Timescale chunks requires the partition column in the referenced key — which is `observed_at_utc`. Either the schema needs a denormalized `raw_observed_at_utc` column in validated to hold the FK, or the constraint must be enforced at the service layer with an explicit check. Currently, validated rows can exist for deleted or non-existent raw readings with no detectability.

**Fix:** Add `raw_observed_at_utc TIMESTAMPTZ NOT NULL` to `iot_reading_validated` and add the composite FK `REFERENCES iot_reading_raw(id, observed_at_utc)`, or document service-layer enforcement explicitly.

---

## Checklist Status

- [x] All WHERE/JOIN columns indexed — mostly yes; `spare_part` missing threshold index (DB-018)
- [ ] Composite indexes in correct column order — PASS for all reviewed indexes
- [x] Proper data types (bigint, text, timestamptz, numeric) — PASS; money uses bigint + currency throughout
- [ ] RLS enabled on all multi-tenant tables — FAIL: `blast_plan`, `detonator`, `explosives_physical_count` missing (DB-003, DB-017, DB-011, DB-020)
- [ ] RLS FORCE on all tables — FAIL: 20+ module tables missing FORCE (DB-003)
- [ ] RLS policies use correct GUC — FAIL: Phase 1 tables use `app.tenant_id`, all modules use `app.current_tenant`, subscriber only sets `app.tenant_id` (DB-001)
- [x] Foreign keys have indexes — PASS for reviewed tables
- [ ] No N+1 query patterns — FAIL: CostPerTonAggregatorJob is N×M×K sequential (DB-010)
- [x] Transactions kept short — PASS; no evidence of external calls inside transactions
- [ ] Partition management — FAIL: stockpile_event and fuel_tank_event expire 2026-08-01 (DB-006)
