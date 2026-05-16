---
phase: 08-operational-alerts-closure
plan: 08-W1-P02
title: "Spare-part threshold event flow — payload enrichment, recovery event, AlertsEventHandler subscribers"
wave: 1
requirements_covered: [ALT-02]
depends_on: []
autonomous: true
files_modified:
  - apps/api/src/modules/maintenance/services/spare-part.service.ts
  - apps/api/src/modules/maintenance/controllers/maintenance.controller.ts
  - apps/api/src/modules/alerts/alerts.event-handlers.ts
  - apps/api/src/modules/alerts/alerts.service.ts
  - apps/api/src/modules/maintenance/maintenance.module.ts
tasks:
  - id: T01
    title: "Enrich threshold event payload with site_id + severity, add restock() that emits recovered event"
  - id: T02
    title: "AlertsEventHandlers — subscribe to threshold_crossed + threshold_recovered with dedupe + resolve"
must_haves:
  truths:
    - "When a spare-part consume drops quantity_on_hand at or below threshold_min for the first time, an event 'maintenance.spare_part.threshold_crossed' is emitted with tenantId, siteId, sparePartId, quantityOnHand, thresholdMin, severity in the payload"
    - "When stock recovers above threshold_min after a previous below state, an event 'maintenance.spare_part.threshold_recovered' is emitted"
    - "The threshold_crossed event causes exactly one OPEN Alert row in the alert table with dedupe_key = 'spare_part:<spare_part_id>:below_threshold'"
    - "A second threshold_crossed event for the same spare part while the previous alert is still OPEN does NOT create a second row (dedupe via AlertsService)"
    - "The threshold_recovered event marks the matching OPEN Alert as status='resolved' with resolved_at_utc set"
    - "Severity is 'warning' when quantity_on_hand > 0 and 'critical' when quantity_on_hand <= 0 (D-13). Quantities at or below zero map to severity='critical' — the comparator is `<= 0`, not `=== 0`, so any future code path that yields a negative running balance still escalates."
    - "No WorkOrder is auto-created for low stock (D-11) — only an Alert row"
    - "Handler `'warning' → 'high'` mapping is encoded at the AlertsEventHandlers boundary, not inside event emitters. This is the canonical Phase-8 convention referenced by W1-P01 and W2-P01."
    - "alert_rule.severity_filter='critical' rules trigger SMS; severity_filter=NULL rules trigger in_app+email only — Phase-8 dispatcher contract."
    - "Field naming reconciled: D-17 mentions `current_stock`; the codebase canonical is `quantityOnHand` (DB column `quantity_on_hand`). This plan documents the reconciliation in the 'Field Naming Reconciliation' section below and applies Option B (keep codebase canonical) consistently. Any event payload field referencing the stock value is named `quantityOnHand` on emit and `quantity_on_hand` when stored in the Alert payload JSON."
    - "POST /maintenance/spare-parts/:id/restock reuses the same guard decorators as the existing POST endpoints in maintenance.controller.ts (no invented RBAC scheme)."
  artifacts:
    - path: apps/api/src/modules/maintenance/services/spare-part.service.ts
      provides: "consume() emits enriched payload; new restock() flips below_threshold=false and emits recovered event"
      contains: "maintenance.spare_part.threshold_recovered"
    - path: apps/api/src/modules/alerts/alerts.event-handlers.ts
      provides: "Two new @OnEvent subscribers — onSparePartThresholdCrossed and onSparePartThresholdRecovered"
      contains: "@OnEvent('maintenance.spare_part.threshold_crossed')"
    - path: apps/api/src/modules/alerts/alerts.service.ts
      provides: "resolveByDedupeKey() helper called on recovery so the existing OPEN alert is closed"
      contains: "resolveByDedupeKey"
  key_links:
    - from: maintenance/services/spare-part.service.ts
      to: alerts/alerts.event-handlers.ts
      via: "EventEmitter2 event 'maintenance.spare_part.threshold_crossed' with payload { tenantId, siteId, sparePartId, sku, quantityOnHand, thresholdMin, severity }"
      pattern: "emit\\('maintenance\\.spare_part\\.threshold_crossed'"
    - from: alerts/alerts.event-handlers.ts
      to: alerts/alerts.service.ts
      via: "AlertsService.createFromEvent with dedupeKey 'spare_part:<id>:below_threshold' OR resolveByDedupeKey on recovery"
      pattern: "spare_part:\\$\\{.*\\}:below_threshold"
---

<objective>
Close the spare-part low-stock alerting loop (ALT-02). The current `SparePartService.consume()` already emits `maintenance.spare_part.threshold_crossed` but the payload is missing `siteId` + `severity` and there is no subscriber writing to the `alert` table — so the Chef Maintenance inbox stays silent.

This plan:
1. Enriches the emitted payload to match D-08 (adds `siteId`, `severity` per D-13).
2. Adds a `restock()` method that flips `below_threshold` back to false and emits `maintenance.spare_part.threshold_recovered` (D-08, D-17).
3. Adds two `@OnEvent` subscribers in `AlertsEventHandlers` that create/resolve the Alert row, deduped on `spare_part:<id>:below_threshold` (D-10).
4. Adds a small `resolveByDedupeKey()` helper to `AlertsService` so the recovery path can flip the alert to `resolved`.

NO new WorkOrder is created — D-11 is explicit: "Pas de WorkOrder auto pour spare part low — seulement une `Alert`."

This plan ALSO owns the canonical Phase-8 conventions referenced by W1-P01 and W2-P01:
- **Severity Mapping (canonical for Phase 8)** — see the dedicated section below; W1-P01's `MeterUpdateHandler` and W2-P01's `PmOpenedAlertHandler` apply this mapping verbatim.
- **Field Naming Reconciliation** — D-17's `current_stock` vs the codebase canonical `quantityOnHand`; we apply Option B (keep codebase canonical), see section below.

Output: 1 service rewrite (small), 1 controller endpoint added, 1 alerts service helper added, 1 alerts event-handlers extension, 1 module import wiring.
</objective>

## Severity Mapping (canonical for Phase 8)

| Event payload severity | Alert.severity column | alert_rule.severity_filter | Use case |
|---|---|---|---|
| `'warning'` | `'high'` | NULL (match-all in non-critical rules) | PM overdue ≤ 7d, spare part below threshold but stock > 0 |
| `'critical'` | `'critical'` | `'critical'` | PM overdue > 7d, spare part stockout (quantity ≤ 0) |

Handlers map event severity → Alert.severity AT THE BOUNDARY (inside AlertsEventHandlers / PmOpenedAlertHandler):
  - `'warning'` → `'high'`
  - `'critical'` → `'critical'`

alert_rule rules with `severity_filter = NULL` match BOTH `high` and `critical` Alerts (covers the warning case via in_app + email channels).
alert_rule rules with `severity_filter = 'critical'` match ONLY `critical` Alerts (the layer that adds SMS).

This convention is canonical for Phase 8. W1-P01 and W2-P01 both reference this section in their `must_haves.truths`.

## Field Naming Reconciliation

`08-CONTEXT.md` § D-08 / D-17 uses the field name `current_stock`. The codebase canonical is `quantityOnHand` (entity property) backed by the DB column `quantity_on_hand`.

**Decision (Option B):** keep the codebase canonical (`quantityOnHand` / `quantity_on_hand`). D-17's `current_stock` is treated as a CONTEXT typo / shorthand — the intent (the stock value at emit time) is preserved without renaming the production entity.

Application in this plan:
- Event payload field on emit: `quantityOnHand` (TypeScript camelCase, consistent with the codebase emit style observed in other events like `production.fuel.refuel_appended`).
- Alert payload JSON (stored in `alert.payload_json`): `quantity_on_hand` (snake_case, consistent with how other Alert payloads are serialized).
- TypeScript handler interfaces use `quantityOnHand`.

No production-entity rename is performed by Phase 8.

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/08-operational-alerts-closure/08-CONTEXT.md
@apps/api/src/modules/maintenance/services/spare-part.service.ts
@apps/api/src/modules/maintenance/entities/spare-part.entity.ts
@apps/api/src/modules/alerts/alerts.event-handlers.ts
@apps/api/src/modules/alerts/alerts.service.ts
@apps/api/src/modules/alerts/alert.entity.ts
@apps/api/src/modules/maintenance/maintenance.module.ts
@apps/api/src/modules/maintenance/controllers/maintenance.controller.ts

<interfaces>
<!-- Reality check: CONTEXT D-08 refers to `SparePartService.applyConsumption(sparePartId, delta)` and field `current_stock`.
     The codebase uses `consume({ tenantId, workOrderId, sparePartId, quantity })` and the column is `quantity_on_hand`.
     See "Field Naming Reconciliation" above — Option B applies. -->

From apps/api/src/modules/maintenance/entities/spare-part.entity.ts:
```typescript
export class SparePart {
  id!: string;
  tenantId!: string;       // tenant_id (uuid)
  siteId!: string;         // site_id (uuid)
  sku!: string;            // varchar(100)
  label!: string;
  quantityOnHand!: number; // int — column quantity_on_hand
  thresholdMin!: number | null; // int — column threshold_min
  belowThreshold!: boolean;     // column below_threshold (bool)
}
```

From apps/api/src/modules/alerts/alert.entity.ts:
```typescript
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'; // <-- Alert table
export type AlertStatus = 'open' | 'acked' | 'resolved';
```
NOTE: `Alert.severity` enum is `low|medium|high|critical`. `AlertRule.severityFilter` enum (in analytics) is `info|warning|critical`. They DIFFER. See "Severity Mapping (canonical for Phase 8)" above.

From apps/api/src/modules/alerts/alerts.service.ts (current public methods):
```typescript
createFromEvent(input: CreateAlertFromEventInput): Promise<Alert>;  // deduped on dedupeKey when status='open'
list(opts): Promise<Alert[]>;
ack(id, userId, tenantId): Promise<Alert>;
resolve(id, userId, tenantId): Promise<Alert>; // throws NotFoundException if id unknown — NOT suitable for "resolve by dedupe key"
```
We add `resolveByDedupeKey(tenantId, dedupeKey)` that resolves the OPEN alert silently (no-op if none).

From apps/api/src/modules/maintenance/services/spare-part.service.ts (current state — what to extend):
- `consume({ tenantId, workOrderId, sparePartId, quantity })` uses pessimistic lock, computes `newQuantity`, sets `belowThreshold`, emits `maintenance.spare_part.threshold_crossed` with payload `{ tenantId, sparePartId, sku, quantityOnHand, thresholdMin }` — MISSING `siteId` and `severity`.
- NO `restock()` method exists. NO `recovered` event is emitted.

From apps/api/src/modules/maintenance/controllers/maintenance.controller.ts (verified at planning time):
- Existing POST endpoints (e.g., `POST work-orders`, `POST work-orders/:id/close`, `POST spare-parts/:id/consume`) all sit under the same class-level guards.
- The new `POST spare-parts/:id/restock` MUST inherit the same guard decorators — DO NOT invent a new RBAC scheme.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1 (T01): Enrich threshold_crossed payload (siteId + severity), add restock() emitting threshold_recovered</name>
  <read_first>
    - apps/api/src/modules/maintenance/services/spare-part.service.ts (current consume() — payload to enrich)
    - apps/api/src/modules/maintenance/entities/spare-part.entity.ts (siteId field exists; column types)
    - apps/api/src/modules/maintenance/controllers/maintenance.controller.ts (pattern for adding a new endpoint — POST :id/restock; note the EXACT class-level and method-level decorators used by other POST endpoints — the new restock endpoint MUST reuse them. Do NOT invent a new RBAC scheme.)
    - 08-CONTEXT.md § D-08 verbatim: "apres la mise a jour du `current_stock`, si `current_stock < threshold_min` ET `below_threshold = false`, le service flip `below_threshold = true` ET emet `maintenance.spare_part.threshold_crossed` ... Reciproquement, si restock fait remonter au-dessus, flip a `false` ET emet `maintenance.spare_part.threshold_recovered`"
    - 08-CONTEXT.md § D-13 verbatim: "Spare part below threshold : `current_stock > 0` -> `warning` ; `current_stock = 0` (stockout) -> `critical`"
    - 08-CONTEXT.md § D-17 (payload shapes for both events) — see "Field Naming Reconciliation" in this plan for the codebase-canonical naming applied
    - 08-CONTEXT.md § D-11: "Pas de WorkOrder auto pour spare part low — seulement une `Alert`"
    - This plan's "Severity Mapping (canonical for Phase 8)" subsection
  </read_first>
  <behavior>
    - Test 1: `consume({ ..., quantity: 5 })` where part has `quantityOnHand=10`, `thresholdMin=8`, `belowThreshold=false` → emits `maintenance.spare_part.threshold_crossed` ONCE with payload containing `{ tenantId, siteId, sparePartId, sku, quantityOnHand: 5, thresholdMin: 8, severity: 'warning' }`.
    - Test 2: Same consume but starting `quantityOnHand=10`, `thresholdMin=5`, `belowThreshold=false`, `quantity=2` → result is `quantityOnHand=8`, still above threshold → NO event emitted.
    - Test 3: Stockout — `consume` brings `quantityOnHand` to 0 → emits with `severity: 'critical'` (D-13).
    - Test 3b: Negative running balance — `consume` brings `quantityOnHand` to -2 (degenerate state from concurrent consumes) → emits with `severity: 'critical'`. The comparator MUST be `newQuantity <= 0`, not `=== 0`.
    - Test 4: `consume` when `belowThreshold` already true → NO new threshold_crossed event (edge-triggered guard preserved).
    - Test 5: NEW `restock({ tenantId, sparePartId, quantityAdded })` where part is `belowThreshold=true, quantityOnHand=2, thresholdMin=5, quantityAdded=10` → result is `quantityOnHand=12, belowThreshold=false` AND emits `maintenance.spare_part.threshold_recovered` with payload `{ tenantId, siteId, sparePartId, quantityOnHand: 12 }`.
    - Test 6: `restock` while `belowThreshold=false` → updates quantity but emits NO recovery event.
    - Test 7: `restock({ quantityAdded: 0 })` or negative → throws BadRequestException("quantityAdded must be > 0").
    - Test 8: Throwing inside the transaction (e.g. RLS denial) does NOT emit any event (events come after the tx commits OR are emitted within the tx but the emit call is reached only if the tx body completes — choose the pattern already used by `consume()` which emits inside the transaction callback after the update).
  </behavior>
  <action>
    Per D-08 verbatim: "Au moment de `SparePartService.applyConsumption(sparePartId, delta)`, apres la mise a jour du `current_stock`, si `current_stock < threshold_min` ET `below_threshold = false`, le service flip `below_threshold = true` ET emet `maintenance.spare_part.threshold_crossed` sur l'EventEmitter avec `{ tenant_id, site_id, spare_part_id, current_stock, threshold_min, severity_hint }`. Reciproquement, si restock fait remonter au-dessus, flip a `false` ET emet `maintenance.spare_part.threshold_recovered` (pour resoudre l'alerte existante)."

    NAMING RECONCILIATION: codebase uses `consume()` (not `applyConsumption`) and `quantityOnHand` (not `current_stock`). See "Field Naming Reconciliation" section at the top of this plan — Option B applies. We extend `consume()` and add `restock()`.

    Per D-13 verbatim: "Spare part below threshold : `current_stock > 0` -> `warning` ; `current_stock = 0` (stockout) -> `critical`. Pas de notion de 'criticite de piece' hardcodee."

    SEVERITY MAPPING: see "Severity Mapping (canonical for Phase 8)" section. The emit uses payload `severity: 'warning' | 'critical'`. The mapping `'warning' → Alert.severity 'high'` happens in T02's handler boundary, not here. Stockout comparator is `<= 0` (NOT `=== 0`) to cover negative-balance edge cases.

    Per D-11 verbatim: "Pas de WorkOrder auto pour spare part low — seulement une `Alert`. La requirement ALT-02 dit 'cree une alerte visible dans l'inbox alertes', rien de plus."

    Step 1 — Edit `apps/api/src/modules/maintenance/services/spare-part.service.ts`:

    1a. Inside `consume()`, after `await manager.update(SparePart, ...)`, change the existing emit block to:

    ```typescript
    if (!wasBelow && nowBelow) {
      // Stockout comparator: <= 0 (covers negative running balance from
      // concurrent consumes); equality would miss negatives.
      const severity: 'warning' | 'critical' = newQuantity <= 0 ? 'critical' : 'warning';
      this.events.emit('maintenance.spare_part.threshold_crossed', {
        tenantId,
        siteId: part.siteId,
        sparePartId,
        sku: part.sku,
        quantityOnHand: newQuantity,
        thresholdMin: part.thresholdMin,
        severity,
      });
    }
    ```

    1b. ADD a new method `restock()`:

    ```typescript
    /**
     * Atomically add stock to a spare part. If the part was below threshold
     * and the new quantity is at or above threshold_min, flips
     * below_threshold=false and emits `maintenance.spare_part.threshold_recovered`
     * (D-08 / D-17). The recovered event closes the matching OPEN Alert via
     * AlertsEventHandlers.onSparePartThresholdRecovered (T02).
     */
    async restock(params: {
      tenantId: string;
      sparePartId: string;
      quantityAdded: number;
    }): Promise<void> {
      const { tenantId, sparePartId, quantityAdded } = params;
      if (quantityAdded <= 0) {
        throw new BadRequestException('quantityAdded must be > 0');
      }

      await this.ds.transaction(async (manager: EntityManager) => {
        const part = await manager
          .createQueryBuilder(SparePart, 'sp')
          .setLock('pessimistic_write')
          .where('sp.id = :id AND sp.tenant_id = :tenantId', { id: sparePartId, tenantId })
          .getOne();

        if (!part) {
          throw new BadRequestException(`spare_part ${sparePartId} not found`);
        }

        const newQuantity = part.quantityOnHand + quantityAdded;
        const wasBelow = part.belowThreshold;
        const nowBelow =
          part.thresholdMin != null && newQuantity <= part.thresholdMin;

        await manager.update(
          SparePart,
          { id: sparePartId },
          { quantityOnHand: newQuantity, belowThreshold: nowBelow },
        );

        // Edge-triggered recovery event (D-08).
        if (wasBelow && !nowBelow) {
          this.events.emit('maintenance.spare_part.threshold_recovered', {
            tenantId,
            siteId: part.siteId,
            sparePartId,
            sku: part.sku,
            quantityOnHand: newQuantity,
          });
        }
      });
    }
    ```

    Step 2 — Edit `apps/api/src/modules/maintenance/controllers/maintenance.controller.ts` to expose `restock`. Add this method below the existing `consumeSparePart`, REUSING the exact same guard decorators that already protect `consumeSparePart` (likely `@UseGuards(JwtAuthGuard)` from `common/guards/jwt-auth.guard.ts`, plus any role guard the controller already applies at the class level). DO NOT invent a new RBAC scheme — the executor copies the existing decorator stack verbatim.

    ```typescript
    @Post('spare-parts/:id/restock')
    restockSparePart(
      @Param('id') sparePartId: string,
      @Body() body: { quantityAdded: number },
      @Req() req: AuthedRequest,
    ) {
      return this.spService.restock({ ...body, sparePartId, tenantId: req.user.tenantId });
    }
    ```

    Step 3 — Update / add unit tests in `apps/api/src/modules/maintenance/services/spare-part.service.spec.ts` (create if it does not exist) covering Tests 1, 2, 3, 3b, 4, 5, 6, 7, 8 from `<behavior>`. Use `EventEmitter2` instance with `jest.spyOn(events, 'emit')` to assert the exact event names and payloads.
  </action>
  <verify>
    <automated>grep -q "maintenance.spare_part.threshold_recovered" apps/api/src/modules/maintenance/services/spare-part.service.ts &amp;&amp; grep -q "siteId: part.siteId" apps/api/src/modules/maintenance/services/spare-part.service.ts &amp;&amp; grep -q "newQuantity <= 0 ? 'critical'" apps/api/src/modules/maintenance/services/spare-part.service.ts &amp;&amp; grep -q "spare-parts/:id/restock" apps/api/src/modules/maintenance/controllers/maintenance.controller.ts &amp;&amp; pnpm --filter @gravel/api test -- spare-part.service.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    `consume()` emits enriched payload (siteId + severity per D-13; stockout comparator `<= 0`). `restock()` exists, emits recovery event when transitioning from below to above threshold. Controller has POST `/maintenance/spare-parts/:id/restock` REUSING the existing endpoint guard stack (no new RBAC). All 9 behavior tests pass. `tsc --noEmit` passes. No WorkOrder auto-creation logic is added (D-11).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2 (T02): AlertsEventHandlers subscribers + AlertsService.resolveByDedupeKey()</name>
  <read_first>
    - apps/api/src/modules/alerts/alerts.event-handlers.ts (reference: how onStockpileThreshold + onTirReconciliationGap are wired)
    - apps/api/src/modules/alerts/alerts.service.ts (current resolve() throws on missing — we need a silent variant)
    - apps/api/src/modules/alerts/alert.entity.ts (Alert.severity enum = 'low'|'medium'|'high'|'critical')
    - apps/api/src/modules/maintenance/maintenance.module.ts (must IMPORT AlertsModule so the AlertsEventHandlers provider is in scope for EventEmitter2 in the same DI context)
    - 08-CONTEXT.md § D-10 verbatim: "Alert dedupe = utilise la cle existante `dedupe_key = 'spare_part:' + spare_part_id + ':below_threshold'`. Si l'alerte est deja `status=open` pour cette cle, le handler n'en cree pas une seconde. Sur recovery event, l'alerte open est mise a `status=resolved` avec `resolved_at_utc = now()`."
    - 08-CONTEXT.md § D-13 (severity mapping)
    - This plan's "Severity Mapping (canonical for Phase 8)" subsection — handlers apply `'warning' → 'high'` AT THIS BOUNDARY.
  </read_first>
  <behavior>
    - Test 1: Emitting `maintenance.spare_part.threshold_crossed` with payload `{ tenantId: T, siteId: S, sparePartId: SP, quantityOnHand: 3, thresholdMin: 5, severity: 'warning' }` results in exactly 1 Alert row with `tenant_id=T, site_id=S, source_event_type='maintenance.spare_part.threshold_crossed', dedupe_key='spare_part:SP:below_threshold', status='open', severity='high'` (warning→high boundary mapping).
    - Test 2: Emitting the same event again while the first alert is OPEN does NOT create a second row (createFromEvent dedupe).
    - Test 3: Emitting `maintenance.spare_part.threshold_recovered` with payload `{ tenantId: T, sparePartId: SP, ... }` transitions the matching OPEN Alert to `status='resolved'` and sets `resolved_at_utc`.
    - Test 4: Emitting `threshold_recovered` when no OPEN alert exists is a no-op (no exception thrown).
    - Test 5: `resolveByDedupeKey` only touches the alert for the same `tenantId` (RLS-safe).
    - Test 6: When payload `severity = 'critical'` arrives, the created Alert row has `severity='critical'`.
  </behavior>
  <action>
    Per D-10 verbatim: "Alert dedupe = utilise la cle existante `dedupe_key = 'spare_part:' + spare_part_id + ':below_threshold'`. Si l'alerte est deja `status=open` pour cette cle, le handler n'en cree pas une seconde. Sur recovery event, l'alerte open est mise a `status=resolved` avec `resolved_at_utc = now()`."

    Severity boundary: payload `'warning' | 'critical'` → Alert.severity `'high' | 'critical'` AT THIS HANDLER. See "Severity Mapping (canonical for Phase 8)" at the top of this plan.

    Step 1 — Add `resolveByDedupeKey` to `apps/api/src/modules/alerts/alerts.service.ts`. Insert this method below `resolve()`:

    ```typescript
    /**
     * Silent resolve for recovery events (D-10). No-op when no matching OPEN
     * alert exists. Scoped strictly by tenantId so cross-tenant payloads
     * cannot resolve foreign alerts.
     */
    async resolveByDedupeKey(
      tenantId: string,
      dedupeKey: string,
    ): Promise<Alert | null> {
      const row = await this.repo.findOne({
        where: { tenantId, dedupeKey, status: 'open' },
      });
      if (!row) return null;
      row.status = 'resolved';
      row.resolvedAtUtc = new Date();
      // resolvedBy left null — system-triggered recovery, not a user action.
      return this.repo.save(row);
    }
    ```

    Step 2 — Edit `apps/api/src/modules/alerts/alerts.event-handlers.ts`. Add these two `@OnEvent` methods at the bottom of the class (before the closing brace). Note the boundary mapping `'warning' → 'high'`:

    ```typescript
    /**
     * Spare-part stock dropped at or below threshold (D-08, D-10, D-13).
     * Deduped: same spare_part + 'below_threshold' = 1 OPEN alert.
     *
     * Severity mapping (Phase 8 canonical): payload 'warning' → Alert 'high';
     * payload 'critical' → Alert 'critical'. See 08-W1-P02-PLAN.md §
     * "Severity Mapping (canonical for Phase 8)".
     */
    @OnEvent('maintenance.spare_part.threshold_crossed')
    async onSparePartThresholdCrossed(evt: {
      tenantId: string;
      siteId: string;
      sparePartId: string;
      sku?: string;
      quantityOnHand: number;
      thresholdMin: number | null;
      severity: 'warning' | 'critical';
    }): Promise<void> {
      const alertSeverity: 'high' | 'critical' =
        evt.severity === 'critical' ? 'critical' : 'high';

      await this.alerts.createFromEvent({
        tenantId: evt.tenantId,
        siteId: evt.siteId,
        sourceEventType: 'maintenance.spare_part.threshold_crossed',
        sourceEventId: null,
        dedupeKey: `spare_part:${evt.sparePartId}:below_threshold`,
        severity: alertSeverity,
        payload: {
          site_id: evt.siteId,
          spare_part_id: evt.sparePartId,
          sku: evt.sku ?? null,
          quantity_on_hand: evt.quantityOnHand,
          threshold_min: evt.thresholdMin,
        },
      });
    }

    /**
     * Spare-part stock recovered above threshold (D-08, D-10). Resolves the
     * existing OPEN alert silently; no-op if no matching alert.
     */
    @OnEvent('maintenance.spare_part.threshold_recovered')
    async onSparePartThresholdRecovered(evt: {
      tenantId: string;
      sparePartId: string;
    }): Promise<void> {
      await this.alerts.resolveByDedupeKey(
        evt.tenantId,
        `spare_part:${evt.sparePartId}:below_threshold`,
      );
    }
    ```

    Step 3 — Edit `apps/api/src/modules/maintenance/maintenance.module.ts` to IMPORT `AlertsModule` so the event subscribers are present in the runtime when SparePartService emits. Add:

    ```typescript
    import { AlertsModule } from '../alerts/alerts.module';
    ```
    Then add `AlertsModule` to the `imports` array. (Both modules use the global `EventEmitterModule`, but importing AlertsModule guarantees its event-handlers provider is instantiated before SparePartService is called in production.)

    Step 4 — Add unit tests in `apps/api/src/modules/alerts/alerts.event-handlers.spec.ts` (create if missing) for Tests 1–6 from `<behavior>`. Use a real in-memory event emitter and a mocked AlertsService, OR use the existing test patterns from `alerts.e2e-spec.ts` if they spin up the module.
  </action>
  <verify>
    <automated>grep -q "@OnEvent('maintenance.spare_part.threshold_crossed')" apps/api/src/modules/alerts/alerts.event-handlers.ts &amp;&amp; grep -q "@OnEvent('maintenance.spare_part.threshold_recovered')" apps/api/src/modules/alerts/alerts.event-handlers.ts &amp;&amp; grep -q "spare_part:\${evt.sparePartId}:below_threshold" apps/api/src/modules/alerts/alerts.event-handlers.ts &amp;&amp; grep -q "resolveByDedupeKey" apps/api/src/modules/alerts/alerts.service.ts &amp;&amp; grep -q "AlertsModule" apps/api/src/modules/maintenance/maintenance.module.ts &amp;&amp; pnpm --filter @gravel/api test -- alerts.event-handlers.spec.ts &amp;&amp; pnpm --filter @gravel/api tsc --noEmit</automated>
  </verify>
  <done>
    Two new `@OnEvent` subscribers exist for spare-part threshold and recovery. The handler applies the canonical severity boundary mapping (warning→high; critical→critical). `AlertsService.resolveByDedupeKey()` is implemented and returns null silently when no match. `MaintenanceModule` imports `AlertsModule`. All 6 behavior tests pass. `tsc --noEmit` passes.

    End-to-end manual smoke (optional, documented for the executor): seed a SparePart with `quantityOnHand=10, thresholdMin=5, belowThreshold=false`; call `consume({ quantity: 8 })` via the controller; observe in the `alert` table exactly one row with `dedupe_key='spare_part:<id>:below_threshold', status='open'`. Then call `restock({ quantityAdded: 10 })`; observe the same row has `status='resolved'` and `resolved_at_utc IS NOT NULL`.
  </done>
</task>

</tasks>

<verification>
After both tasks:
1. `pnpm --filter @gravel/api tsc --noEmit` exits 0.
2. `pnpm --filter @gravel/api test -- spare-part.service.spec.ts alerts.event-handlers.spec.ts` exits 0.
3. `grep -rn "maintenance.spare_part.threshold_crossed\\|maintenance.spare_part.threshold_recovered" apps/api/src/modules/` returns at least 4 lines (emit in service + emit in service + @OnEvent + @OnEvent).
4. No code path auto-creates a `work_order` row when a spare part drops below threshold (D-11): `grep -n "WorkOrderService\\|work_order" apps/api/src/modules/maintenance/services/spare-part.service.ts` returns no match.
5. Stockout comparator is `<= 0`, not `=== 0`: `grep -n "newQuantity <= 0" apps/api/src/modules/maintenance/services/spare-part.service.ts` returns at least 1 line.
</verification>

<success_criteria>
- Spare-part `consume()` emits `maintenance.spare_part.threshold_crossed` with full payload `{ tenantId, siteId, sparePartId, sku, quantityOnHand, thresholdMin, severity }` (D-08, D-17 — codebase-canonical naming per "Field Naming Reconciliation").
- Severity is `'warning'` when stock > 0, `'critical'` when stock `<= 0` (D-13, with the `<= 0` comparator covering negative-balance edge cases).
- New `restock()` service method + REST endpoint exist; endpoint REUSES the same guards as other POST endpoints on the controller. On crossing back above threshold, emits `maintenance.spare_part.threshold_recovered`.
- AlertsEventHandlers create exactly one OPEN Alert per spare-part-below-threshold transition (deduped on `spare_part:<id>:below_threshold` per D-10), with `'warning' → 'high'` mapping applied at the handler boundary.
- AlertsEventHandlers resolve the matching OPEN Alert on recovery (silent no-op when no match).
- No WorkOrder is auto-created for low stock (D-11).
- MaintenanceModule imports AlertsModule so subscribers are loaded.
- The "Severity Mapping (canonical for Phase 8)" and "Field Naming Reconciliation" sections are present in this PLAN.md and referenced by W1-P01 and W2-P01.
</success_criteria>

<output>
After completion, create `.planning/phases/08-operational-alerts-closure/08-W1-P02-SUMMARY.md` listing files modified, tests added, the verified end-to-end flow (consume → Alert OPEN → restock → Alert RESOLVED), the actual mapping used from D-13 severity labels to the Alert.severity enum, and the exact guard decorators reused on the new restock endpoint.
</output>
