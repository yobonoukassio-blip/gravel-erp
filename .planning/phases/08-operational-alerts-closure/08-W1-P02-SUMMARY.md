---
phase: 08-operational-alerts-closure
plan: 08-W1-P02
subsystem: maintenance + alerts (ALT-02)
tags: [alerts, maintenance, spare-part, event-driven, dedupe, severity-mapping]
requirements_covered: [ALT-02]
dependency_graph:
  requires:
    - 08-W1-P01 (in flight) — shared severity-mapping convention reference; not a hard build dependency
    - Phase 7 alert_rule seed migration (already landed)
  provides:
    - "maintenance.spare_part.threshold_crossed event payload contract (canonical): { tenantId, siteId, sparePartId, sku, quantityOnHand, thresholdMin, severity: 'warning'|'critical' }"
    - "maintenance.spare_part.threshold_recovered event payload contract: { tenantId, siteId, sparePartId, sku, quantityOnHand }"
    - "SparePartService.restock(params) public method"
    - "POST /maintenance/spare-parts/:id/restock REST endpoint"
    - "AlertsService.resolveByDedupeKey(tenantId, dedupeKey) silent resolver"
    - "Phase-8 canonical severity boundary: payload 'warning' -> Alert.severity 'high'; payload 'critical' -> Alert.severity 'critical' (applied in AlertsEventHandlers)"
  affects:
    - apps/api AlertDispatcherService.onSparePartLow — accepts the enriched payload via structural typing (no break); however the dispatcher still hard-codes severity='warning' which means stockout-critical alerts will NOT yet trigger SMS via the analytics dispatcher path. Tracked as a deferred discovery — Phase 9 NTF-02 already owns the dispatcher contract.
tech_stack:
  added: []
  patterns:
    - "Edge-triggered domain events (emit only on the wasBelow/nowBelow transition, not on every consume/restock)"
    - "Severity boundary mapping at the handler, not at emit time — keeps emitters decoupled from the Alert table's enum"
    - "AlertsService.resolveByDedupeKey for system-triggered recovery (resolvedBy stays null)"
key_files:
  created:
    - apps/api/test/unit/maintenance/spare-part.service.spec.ts
    - apps/api/test/unit/alerts/alerts.event-handlers.spec.ts
  modified:
    - apps/api/src/modules/maintenance/services/spare-part.service.ts (severity 'warning'|'critical', `<= 0` comparator)
    - apps/api/src/modules/alerts/alerts.event-handlers.ts (warning->high boundary mapping)
  carried_over_from_wip_b396bd3:
    - apps/api/src/modules/maintenance/services/spare-part.service.ts (restock() method)
    - apps/api/src/modules/maintenance/controllers/maintenance.controller.ts (POST restock endpoint)
    - apps/api/src/modules/alerts/alerts.service.ts (resolveByDedupeKey)
    - apps/api/src/modules/maintenance/maintenance.module.ts (AlertsModule import)
decisions:
  - "Severity is the canonical Phase-8 payload label ('warning' | 'critical') at the emitter; the warning -> Alert.severity 'high' boundary mapping is applied INSIDE AlertsEventHandlers.onSparePartThresholdCrossed. This matches the planner-locked convention referenced by W1-P01 and W2-P01."
  - "Stockout comparator is `newQuantity <= 0`, not `=== 0`. The strict-equality variant would miss future code paths that yield a negative running balance (e.g., concurrent consumes that bypass the SELECT FOR UPDATE on heterogeneous engines). The `<= 0` form is forward-compatible and the plan's verify-grep enforces it literally."
  - "Field naming reconciliation (Option B): codebase canonical `quantityOnHand` is preserved over D-17's `current_stock`. Event payloads use camelCase on emit (`quantityOnHand`) and snake_case when stored in `alert.payload_json` (`quantity_on_hand`), matching established conventions in production.fuel.refuel_appended and the Alert table's JSONB payloads."
  - "restock() endpoint REUSES the existing class-level guard stack on MaintenanceController (no new RBAC scheme invented). The endpoint is wired identically to POST spare-parts/:id/consume."
  - "Test colocation: relocated planner-WIP specs from src/modules/**/*.spec.ts to test/unit/{alerts,maintenance}/ to match the project's Jest config (testMatch: test/unit/**/*.spec.ts). The colocated copies would silently never run."
  - "AlertDispatcherService.onSparePartLow accepts the new enriched payload via structural typing — no API break. However the dispatcher hard-codes severity: 'warning', meaning critical (stockout) spare-part alerts will NOT trigger SMS via the analytics dispatcher path. Logged as a deferred discovery for Phase 9 NTF-02; out of scope for this plan."
metrics:
  duration_minutes: ~12
  completed_at: "2026-05-16"
  commits:
    - 151b63d (T01 — enrich payload + restock + tests)
    - 7fcde84 (T02 — handler boundary mapping + test relocation)
  test_counts:
    spare_part_service: 9
    alerts_event_handlers: 6
    total_passing: 15
---

# Phase 8 Plan W1-P02: Spare-part threshold event flow Summary

**One-liner:** Spare-part `consume()` emits enriched threshold_crossed payload with `severity: 'warning'|'critical'` and `<= 0` stockout comparator; new `restock()` emits threshold_recovered; AlertsEventHandlers apply the canonical Phase-8 severity boundary mapping (`'warning' -> 'high'`, `'critical' -> 'critical'`) at the handler boundary and resolve open alerts on recovery via dedupe key.

## End-to-end flow verified by the tests

```
consume(quantityOnHand:10 -> 3, threshold_min:5, belowThreshold:false)
  -> SparePartService emits:
       'maintenance.spare_part.threshold_crossed'
       { tenantId, siteId, sparePartId, sku, quantityOnHand: 3,
         thresholdMin: 5, severity: 'warning' }
  -> AlertsEventHandlers.onSparePartThresholdCrossed
       maps 'warning' -> Alert.severity 'high'
       calls AlertsService.createFromEvent with
         dedupeKey = 'spare_part:<id>:below_threshold'
  -> AlertsService.createFromEvent: 1 OPEN Alert row inserted
       (subsequent threshold_crossed events for the same spare_part
        while OPEN reuse the row — no duplicate)

restock(quantityAdded: 10) -> quantityOnHand = 13, belowThreshold:false
  -> SparePartService emits:
       'maintenance.spare_part.threshold_recovered'
       { tenantId, siteId, sparePartId, sku, quantityOnHand: 13 }
  -> AlertsEventHandlers.onSparePartThresholdRecovered
       calls AlertsService.resolveByDedupeKey(tenantId, 'spare_part:<id>:below_threshold')
  -> Alert.status = 'resolved', Alert.resolved_at_utc = now()
       (resolvedBy left null — system-triggered)
```

## Severity mapping applied (canonical for Phase 8)

| Domain reality | Event payload severity | Alert.severity column |
| --- | --- | --- |
| Stock > 0, below threshold | `'warning'` | `'high'` (boundary-mapped) |
| Stock <= 0 (stockout / negative balance) | `'critical'` | `'critical'` |

The mapping `'warning' -> 'high'` is applied INSIDE `AlertsEventHandlers.onSparePartThresholdCrossed`, not at emit time. This keeps the SparePartService emitter decoupled from the Alert table's `low|medium|high|critical` enum.

## Restock endpoint guard reuse

`POST /maintenance/spare-parts/:id/restock` reuses the same class-level guards as the other POST endpoints on `MaintenanceController` (`POST work-orders`, `POST work-orders/:id/close`, `POST spare-parts/:id/consume`). Currently the controller relies on the application-level `JwtAuthGuard` registered at the root via `APP_GUARD`; no per-endpoint guard decorator was added, identical to `consumeSparePart`. No new RBAC scheme was invented.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing WIP code emitted Alert.severity values from the service**

- **Found during:** T01 read-before-edit
- **Issue:** The planner's WIP commit (`b396bd3`) had `SparePartService.consume()` emitting `severity: 'high' | 'critical'` directly and the handler passing it through unchanged. This violated the plan's "Severity Mapping (canonical for Phase 8)" contract, which mandates emitters use the domain label (`'warning'`) and handlers do the `warning -> high` mapping at the boundary. Without this fix, future emitters (PM scheduler, dispatcher) would have to know the Alert table's enum, leaking persistence concerns into domain code.
- **Fix:** Changed emit payload severity to `'warning' | 'critical'`. Added `alertSeverity` boundary mapping in `AlertsEventHandlers.onSparePartThresholdCrossed` (`evt.severity === 'critical' ? 'critical' : 'high'`).
- **Files modified:** `apps/api/src/modules/maintenance/services/spare-part.service.ts`, `apps/api/src/modules/alerts/alerts.event-handlers.ts`
- **Commits:** 151b63d, 7fcde84

**2. [Rule 1 - Bug] Pre-existing WIP code used `=== 0` instead of `<= 0` for stockout**

- **Found during:** T01 read-before-edit (the plan's verify-grep explicitly checks `newQuantity <= 0 ? 'critical'`)
- **Issue:** `=== 0` misses the negative-balance edge case (concurrent consumes, racy data, future code paths).
- **Fix:** Changed comparator to `newQuantity <= 0 ? 'critical' : 'warning'`.
- **Files modified:** `apps/api/src/modules/maintenance/services/spare-part.service.ts`
- **Commit:** 151b63d

**3. [Rule 3 - Blocking] Colocated specs were in the wrong directory**

- **Found during:** T01 test execution (Jest reported "No tests found")
- **Issue:** Planner WIP placed spec files alongside source (`src/modules/**/*.spec.ts`), but the project's `jest.config.ts` only matches `test/unit/**/*.spec.ts`. The tests would silently never run in CI.
- **Fix:** Relocated specs to `apps/api/test/unit/maintenance/spare-part.service.spec.ts` and `apps/api/test/unit/alerts/alerts.event-handlers.spec.ts`. Updated relative imports (`./spare-part.service` -> `../../../src/modules/maintenance/services/spare-part.service`). Removed the original colocated files.
- **Commits:** 151b63d, 7fcde84

### Deferred discoveries (logged, NOT fixed in this plan)

- **AlertDispatcherService.onSparePartLow hard-codes severity='warning'.** The dispatcher accepts the enriched payload via structural typing (no break) but does not yet pass through `evt.severity`, so critical (stockout) spare-part alerts will not route to SMS via the analytics dispatcher path. Out of scope for ALT-02 (the Alert row itself is correctly stored with `severity='critical'`). Phase 9 NTF-02 owns the dispatcher contract — this is the natural place to wire it.

### Auth gates / Architectural changes

None. All execution was autonomous.

## Verification Evidence

### Plan verify-greps (T01)

| Grep pattern | Match |
| --- | --- |
| `maintenance.spare_part.threshold_recovered` in `spare-part.service.ts` | line 141 (emit) |
| `siteId: part.siteId` in `spare-part.service.ts` | lines 89, 143 |
| `newQuantity <= 0 ? 'critical'` in `spare-part.service.ts` | line 86 |
| `spare-parts/:id/restock` in `maintenance.controller.ts` | line 88 |

### Plan verify-greps (T02)

| Grep pattern | Match |
| --- | --- |
| `@OnEvent('maintenance.spare_part.threshold_crossed')` in `alerts.event-handlers.ts` | line 181 |
| `@OnEvent('maintenance.spare_part.threshold_recovered')` in `alerts.event-handlers.ts` | line 215 |
| `spare_part:${evt.sparePartId}:below_threshold` in `alerts.event-handlers.ts` | lines 199, 222 |
| `resolveByDedupeKey` in `alerts.service.ts` | line 100 |
| `AlertsModule` in `maintenance.module.ts` | lines 4, 36 |

### Phase-level verification (from PLAN.md `<verification>`)

1. `tsc --noEmit` exits 0 for files modified by this plan (other pre-existing test errors in `concassage/`, `stockpile/tests/`, `extraction/tests/`, `production-dashboard/tests/` are out of scope — deferred).
2. `jest --selectProjects unit --testPathPattern="(spare-part.service|alerts.event-handlers)"` -> 15 passing, 2 suites.
3. `grep -rn "maintenance.spare_part.threshold_crossed\|maintenance.spare_part.threshold_recovered"` returns ≥4 lines (emit ×2 in service, @OnEvent ×2 in handler — plus 2 dispatcher refs + 1 emit in service comment + 2 migrations = 10 total).
4. `grep "WorkOrderService\|work_order"` in `spare-part.service.ts` returns no match (D-11 satisfied — no auto WorkOrder for low stock).
5. `grep "newQuantity <= 0"` in `spare-part.service.ts` returns 1 match.

## Known Stubs

None. The spare-part alert loop is end-to-end functional with this plan.

The AlertDispatcherService note above is not a stub — the in-app alert IS created with the correct severity. Only the SMS dispatch path is incomplete, and SMS is explicitly a Phase 9 stub per D-16 ("SMS channel = present dans les regles `critical` mais le dispatcher reste stub (Phase 9 NTF-02 livre la vraie integration Twilio/Vonage)").

## Self-Check: PASSED

- [x] `apps/api/test/unit/maintenance/spare-part.service.spec.ts` exists
- [x] `apps/api/test/unit/alerts/alerts.event-handlers.spec.ts` exists
- [x] Commit `151b63d` present in `git log`
- [x] Commit `7fcde84` present in `git log`
- [x] All 15 unit tests pass
- [x] All plan verify-greps return matches
- [x] No WorkOrder auto-creation in spare-part.service (D-11)
