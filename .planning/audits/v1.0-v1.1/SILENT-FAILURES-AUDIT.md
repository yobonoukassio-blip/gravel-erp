# Silent Failures Audit — Gravel Ivoire ERP v1.0-v1.1

**Audited:** 2026-05-16
**Auditor:** silent-failure-hunter subagent
**Scope:** `apps/api/src/modules/` — all NestJS modules

## Summary

| Severity | Count |
|---|---|
| HIGH | 9 |
| MEDIUM | 10 |
| LOW | 3 |
| **Total** | **22** |

**Cross-cutting systemic pattern:** Analytical entry writes, alert creation, and alert dispatch all swallow exceptions without rethrow. The financial ledger, alert table, and external notifications can fail silently under DB pressure or event-shape bugs. Two event-shape bugs (HSE severity field, explosives gap event name) silently misclassify or drop critical safety alerts.

---

## HIGH Findings

### SF-001 — `analytical-entry-writer.handler.ts` — All 7 `@OnEvent` handlers swallow errors

**Location:** `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts`
**Pattern:** Every handler ends with `} catch (err) { this.logger.error(...); }` — no rethrow.

**Why silent:** Analytical ledger writes are silently dropped on any DB / network / parse error. OHADA export and CostPerTonAggregator run on incomplete data.

**Failure scenario:** Pressure on DB causes a transient INSERT failure. The OHADA export the next day is missing entries. The accounting drift is invisible because no one watches `logger.error()` output continuously.

**Fix:** Add `throw err;` after each `logger.error()`. NestJS EventEmitter2 propagates the rejection to the BullMQ outbox worker for retry. Add Prometheus counter `analytical_entry_write_failures_total{cost_center}`.

---

### SF-002 — `analytical-entry-writer.handler.ts:149` — `ON CONFLICT DO NOTHING` silent dedup

**Location:** `apps/api/src/modules/analytics/event-handlers/analytical-entry-writer.handler.ts:149`
**Pattern:** `INSERT INTO analytical_entry ... ON CONFLICT (uniq_key) DO NOTHING` with no warning log when a duplicate is detected.

**Why silent:** Idempotency is correct, but when the SAME source event is emitted twice with DIFFERENT amounts (payload corruption, race condition), the second is silently dropped instead of flagged.

**Fix:** `INSERT ... ON CONFLICT (uniq_key) DO UPDATE SET ... RETURNING xmax = 0 AS inserted` — when `inserted = false`, log a WARN with the source_id and amount delta.

---

### SF-003 — `alerts.event-handlers.ts:33–167` — Zero error handling on 6 alert handlers

**Location:** `apps/api/src/modules/alerts/alerts.event-handlers.ts`
**Pattern:** 6 handlers call `this.alerts.createFromEvent(...)` with no try/catch.

**Why silent:** EventEmitter2 in async mode does NOT propagate async rejections to `emit()` unless `throwExceptionOnUnhandledError: true` is set. Rejections are swallowed by the internal promise chain.

**Failure scenario — CRITICAL SAFETY:** `onBlastPlanClearanceTimeout` — if `AlertsService.createFromEvent` throws, the clearance-timeout alert is never created. The blast plan stays in FIRE_REQUESTED with no alert, no retry, no visibility. Detonators may remain armed beyond the clearance window.

**Fix:** Wrap each handler in try/catch, log with `tenantId`/`siteId`, rethrow. Confirm `EventEmitter2Module.forRoot({ throwExceptionOnUnhandledError: true })` in `AppModule`.

---

### SF-004 — `blast-plan.service.ts:157` — `requestFire` UPDATE parameter index bug

**Location:** `apps/api/src/modules/tir/services/blast-plan.service.ts:157`
**Pattern:** Parameter index drift in raw UPDATE — `requestedFireBySupervisor` is bound to wrong `$N`, persists as NULL.

**Why silent:** UPDATE succeeds (no constraint), but `fire_requested_by` column ends up NULL. Regulatory trail loses the authorizing supervisor.

**Failure scenario:** Audit / investigation after an incident cannot identify who authorized the blast.

**Fix:** Convert the raw UPDATE to a TypeORM repository call OR re-audit parameter indices and add an integration test.

---

### SF-005 — `bl-signed.handler.ts:37` — BigInt truncation in STOCKPILE_OUTFLOW

**Location:** `apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts:37`
**Code:**
```typescript
tonnageDeltaKg: -BigInt(Math.round(Number(payload.tonnageKg) * 1000)) / 1000n,
```
**Pattern:** BigInt integer division truncates. `15.3 kg` → `BigInt(15300) / 1000n = 15n`. Fractional part silently lost.

**Why silent:** No log of the truncated amount. Inventory ledger systematically understates outflow by up to 0.999 kg per signed BL.

**Failure scenario:** Cumulative phantom inventory builds up. Physical count systematically deviates from projected balance. The nightly `balance_drift_detected` alert fires as a false-positive that masks the real root cause indefinitely.

**Fix:** Store tonnage in integer grams: `tonnageDeltaG: -BigInt(Math.round(Number(payload.tonnageKg) * 1000))`. Rename the field, update consumers, document grams unit in the entity.

---

### SF-006 — `cost-per-ton-aggregator.service.ts:55` — Hardcoded 800 XOF/L fuel rate

**Location:** `apps/api/src/modules/analytics/services/cost-per-ton-aggregator.service.ts:55`
**Pattern:** The aggregator directly queries `equipment_refuel` and multiplies `litres_dispensed * 800` (XOF). `AnalyticalEntryWriterHandler` (Phase 7 just shipped) computes fuel costs via `equipment_fuel_consumption.cost_per_liter_minor_units`.

**Why silent:** Two code paths, different tables, different rates, no reconciliation log.

**Failure scenario:** The finance dashboard's cost-per-ton snapshot shows a different fuel cost than the OHADA analytical entry export for the same period. Capital allocation decisions made on contradictory data from the same database.

**Fix:** Remove the inline fuel query. Add `'CAR'` to the `cost_center IN (...)` clause of the existing `analytical_entry` GROUP BY query (lines 86–103). `onFuelRefuelAppended` already writes CAR entries.

---

### SF-007 — `alert-dispatcher.service.ts:252` — `resolveRecipients` returns `[]` on DB error

**Location:** `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts:252`
**Pattern:** `try { ... return recipients } catch (err) { logger.error(); return [] }` — empty array on error treated as "no recipients" by caller.

**Failure scenario:** Alert is created in DB but never dispatched. Operators see the alert in inbox but get no email/SMS.

**Fix:** Rethrow OR set alert status to `DISPATCH_FAILED` with explicit reason; let a retry job pick it up.

---

### SF-008 — `consolidation.service.ts:81` — Missing FX rate silently corrupts P&L

**Location:** `apps/api/src/modules/analytics/services/consolidation.service.ts:81`
**Pattern:** When `fx_rate_snapshot` has no row for the requested currency pair + date, the code falls back to `1n` (or skips conversion).

**Why silent:** EUR centimes summed directly with XOF entire units → garbage consolidated P&L.

**Failure scenario:** A group with EUR-denominated contracts shows a P&L that is off by a factor of 100-650 in the worst case.

**Fix:** Throw `MissingFxRateError` with `(from, to, date)`. The group dashboard should surface the error explicitly: "FX rate missing for EUR→XOF on 2026-04-15 — group consolidation unavailable."

---

### SF-009 — `fuel-reconciliation.service.ts:143` — `randomUUID()` fallback for missing opday

**Location:** `apps/api/src/modules/fuel/services/fuel-reconciliation.service.ts:143`
**Pattern:** When `operational_day` cannot be resolved, the code generates `randomUUID()` and proceeds.

**Why silent:** Creates orphaned `fuel_tank_event` rows with `operational_day_id` referencing nothing. No WARN log.

**Failure scenario:** Dashboard rollups by operational_day skip orphan events. Reconciliation reports are off.

**Fix:** Throw `OperationalDayNotResolvedError` with site + UTC. Add a job that requeues reconciliation after `operational_day` is created.

---

## MEDIUM Findings

| # | Location | Issue |
|---|----------|-------|
| SF-010 | `blast-plan-saga.handler.ts:39` | `handleZoneCleared` swallows ALL errors — DB failure permanently breaks FIRED transition |
| SF-011 | `drilled-hole.handler.ts:65` | MV refresh failure logged but staleness not surfaced; stale drill KPIs |
| SF-012 | `cost-per-ton-aggregator.job.ts:121` | Schema errors and data errors conflated in outer tenant catch |
| SF-013 | `alerts.event-handlers.ts:146–167` vs `hse-incident.service.ts:152–158` | **HSE event field mismatch: `severity` vs `severity_numeric`** — every HSE incident misclassified as `low` alert; severity-5 fatal triggers `low` notification gate never opens |
| SF-014 | `alert-dispatcher.service.ts:97` | Event name mismatch: `tir.explosives.reconciliation_gap` (consumed) vs `tir.reconciliation.gap_detected` (emitted) — explosives gap email/SMS dispatch never fires |
| SF-015 | `explosives-reconciliation.service.ts:55` | `getPhysicalCount` ignores `tenantId`; cross-tenant physical count bleed possible (compounding effect with DB-001 RLS bug) |
| SF-016 | `balance-recompute.job.ts:99` | `production.stockpile.balance_drift_detected` has zero consumers — nightly drift events emitted but no one listens |
| SF-017 | `fuel-reconciliation.job.ts:42` | Unbounded `SELECT id FROM fuel_tank` — silently returns empty set if RLS active in cron context |
| SF-018 | `notification-providers.ts:78` | Log-fallback reports `delivered:0, failed:0, skipped:N`; monitoring sees zero errors when provider unconfigured |
| SF-019 | `hse-incident.service.ts:171` | `close()` emits no event; CAPA closure workflow and notifications are event-blind |
| SF-020 | `consolidation.service.ts:48` | No try/catch — DB failure surfaces as opaque 500, no diagnostic context |

**Note:** SF-013 and SF-014 are functionally critical despite MEDIUM tag (safety + explosives) — promoted to P0 in master synthesis.

---

## LOW Findings

| # | Location | Issue |
|---|----------|-------|
| SF-021 | `cost-per-ton-aggregator.service.ts:109` | `costAmortissementMinor = 0n` not surfaced in API response; users unaware data is partial |
| SF-022 | `refuel-appended.handler.ts:27` | Undocumented logger-only stub — not aligned with project known-stub convention |
| SF-023 | `blast-clearance-timeout.job.ts:27` | No structured logging context before BullMQ rethrow; manual correlation required for stuck plans |

---

## Recommended Fix Order (within this audit)

1. **SF-005 BigInt truncation** — drives nightly drift false-positives that mask everything else
2. **SF-013 HSE severity field mismatch** — safety-critical alert classification
3. **SF-014 Explosives gap event name mismatch** — safety-critical notification flow
4. **SF-001, SF-003 systemic error swallowing** — visibility prerequisite for everything else
5. **SF-006 double fuel cost pipeline** — financial reporting consistency
6. **SF-008 missing FX silently corrupting P&L** — financial correctness
7. Remaining HIGH (SF-002, SF-004, SF-007, SF-009)
8. Remaining MEDIUM in order of safety / financial impact
9. LOW as polish

---

_Audit performed: 2026-05-16. File reconstructed from agent stdout after Windows heredoc tool failure on the original write._
