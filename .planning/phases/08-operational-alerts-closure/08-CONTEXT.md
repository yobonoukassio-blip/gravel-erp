# Phase 8: Operational Alerts Closure - Context

**Gathered:** 2026-05-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Les alertes operationnelles maintenance se declenchent automatiquement, sans saisie humaine :

1. **ALT-01** — Un `@Cron` (`PreventiveMaintenanceSchedulerJob`) ouvre un `WorkOrder` quand l'intervalle PM d'un equipement est franchi (heures, km, ou calendaire).
2. **ALT-02** — Un handler `maintenance.spare_part.threshold_crossed` ecoute les evenements de stock pieces et cree une `Alert` visible dans l'inbox alertes quand le seuil min est atteint.

**Hors scope** (autre phase) :
- Delivery email/SMS — Phase 9 (NTF-01, NTF-02, NTF-03)
- UI config des alert_rule — v2
- Workflow d'escalation des alertes (re-emit si non-acquittees) — v2
- Predictive maintenance ML — v2

</domain>

<decisions>
## Implementation Decisions

### Cron Scheduler (ALT-01)

- **D-01:** Cron schedule = `@Cron('0 * * * *')` — **hourly**, pas daily. Les PM hour-based peuvent franchir un seuil de 250h intra-day ; un check daily les raterait jusqu'a 23h. Le cout (24 runs/jour vs 1) est negligeable face au risque d'engin overdue qui continue de tourner.
- **D-02:** Idempotency = **avant POST WorkOrder**, le job execute `WorkOrderService.findOpen({ equipmentId, type: 'preventive', pmPlanId })` qui retourne le premier WO avec `status IN ('open','in_progress')`. Si trouve, le job log "PM already open" et skip. Pas de duplication, le WO ouvert reste pertinent jusqu'a sa fermeture.
- **D-03:** Tenant scoping = un seul cron global qui execute `SELECT DISTINCT tenant_id FROM preventive_maintenance_plan WHERE is_active = true` puis itere par tenant. Chaque tenant tourne dans son propre CLS context (`app.current_tenant = '<uuid>'`) pour respecter RLS et eviter les fuites cross-tenant.
- **D-04:** `nextDueAtUtc` calcul = pour `intervalType='days'`, persiste `nextDueAtUtc = lastExecutedAtUtc + intervalValue days` apres chaque WorkOrder ferme. Pour `hours` ou `km`, le champ reste null ; le job compare directement `production_equipment.current_hours/km` >= `lastExecutedMeter + intervalValue` au runtime.

### Equipment Meter Source

- **D-05:** Source du compteur engin = **colonnes denormalisees** `current_hours_meter` (NUMERIC 12,2) et `current_km_meter` (NUMERIC 12,2) sur `production_equipment`. Pas de JOIN/MAX a chaque cron run.
- **D-06:** Mise a jour des compteurs = event-driven via deux handlers :
  - `EquipmentRefuelCreated` (existe deja) -> `MeterUpdateHandler.updateHoursIfHigher(equipmentId, refuel.equipment_hour_meter_reading)` ; le `IF HIGHER` empeche les regressions accidentelles si un mecano saisit une valeur passee.
  - `TruckRotationCompleted` -> `MeterUpdateHandler.updateKmIfHigher(equipmentId, rotation.km_total_after)` (necessite d'ajouter `km_total_after` sur `truck_rotation` si absent — verifier en planning).
- **D-07:** Migration de schema = la migration de phase 8 ajoute `current_hours_meter` + `current_km_meter` sur `production_equipment` avec backfill : `current_hours_meter = (SELECT MAX(equipment_hour_meter_reading) FROM equipment_refuel WHERE equipment_id = pe.id)` ; null si pas de refuel encore.

### Spare Part Threshold Alerts (ALT-02)

- **D-08:** Trigger = **event-driven, pas pollu**. Au moment de `SparePartService.applyConsumption(sparePartId, delta)`, apres la mise a jour du `current_stock`, si `current_stock < threshold_min` ET `below_threshold = false`, le service flip `below_threshold = true` ET emet `maintenance.spare_part.threshold_crossed` sur l'EventEmitter avec `{ tenant_id, site_id, spare_part_id, current_stock, threshold_min, severity_hint }`. Reciproquement, si restock fait remonter au-dessus, flip a `false` ET emet `maintenance.spare_part.threshold_recovered` (pour resoudre l'alerte existante).
- **D-09:** `below_threshold` flag = **source de verite**, derive uniquement au flip (transition event). Pas de bulk recompute sauf via job manuel (`/admin/spare-parts/recompute-thresholds`) en cas de drift.
- **D-10:** Alert dedupe = utilise la cle existante `dedupe_key = "spare_part:" + spare_part_id + ":below_threshold"`. Si l'alerte est deja `status=open` pour cette cle, le handler n'en cree pas une seconde. Sur recovery event, l'alerte open est mise a `status=resolved` avec `resolved_at_utc = now()`.
- **D-11:** Pas de WorkOrder auto pour spare part low — seulement une `Alert`. La requirement ALT-02 dit "cree une alerte visible dans l'inbox alertes", rien de plus. Le re-stock est une action humaine de gestionnaire.

### Severity Mapping

- **D-12:** PM overdue (cron firing) -> `severity = 'warning'` par defaut. Si `now() - nextDueAtUtc > 7 days` OU `(current_meter - lastExecutedMeter - intervalValue) / intervalValue > 0.25` (25% au-dela du seuil), -> `severity = 'critical'`. Pas d'escalation cron-on-cron pour l'instant ; la severity est figee a la creation du WO. L'escalation re-emit revient en Phase 9.
- **D-13:** Spare part below threshold : `current_stock > 0` -> `warning` ; `current_stock = 0` (stockout) -> `critical`. Pas de notion de "criticite de piece" hardcodee — si une piece doit etre `critical` meme avec stock > 0, ajouter une colonne `is_critical` plus tard (deferred).

### Recipients & alert_rule Seeding

- **D-14:** Recipients = `alert_rule.role_codes` UNIQUEMENT, jamais `user_ids` individuels. Les `role_codes` survivent aux mouvements RH ; les `user_ids` deviennent obsoletes a chaque depart/embauche.
- **D-15:** Alert rules seedees via migration (`1715901000000__seed_alert_rules.sql` ou similaire). Quatre regles minimum :
  - `event_type = 'maintenance.work_order.preventive_opened'`, severity_filter = null, channels = ['in_app','email'], role_codes = ['MAINTENANCE_MANAGER','MECANICIEN_CHEF','DIRECTEUR_SITE']
  - `event_type = 'maintenance.work_order.preventive_opened'`, severity_filter = 'critical', channels = ['in_app','email','sms'], role_codes = ['DIRECTEUR_SITE','DIRECTION_GROUPE']
  - `event_type = 'maintenance.spare_part.threshold_crossed'`, severity_filter = null, channels = ['in_app','email'], role_codes = ['MAINTENANCE_MANAGER','GESTIONNAIRE_STOCK','DIRECTEUR_SITE']
  - `event_type = 'maintenance.spare_part.threshold_crossed'`, severity_filter = 'critical', channels = ['in_app','email','sms'], role_codes = ['DIRECTEUR_SITE']
- **D-16:** SMS channel = present dans les regles `critical` mais le dispatcher reste stub (Phase 9 NTF-02 livre la vraie integration Twilio/Vonage). L'in_app et email sont prioritaires.

### Events Published (new domain events for this phase)

- **D-17:** Nouveaux events emis par cette phase :
  - `maintenance.work_order.preventive_opened` (payload : `{ tenant_id, site_id, equipment_id, pm_plan_id, work_order_id, severity, due_reason: 'hours'|'km'|'days', overdue_by }`)
  - `maintenance.spare_part.threshold_crossed` (payload : `{ tenant_id, site_id, spare_part_id, current_stock, threshold_min, severity }`)
  - `maintenance.spare_part.threshold_recovered` (payload : `{ tenant_id, site_id, spare_part_id, current_stock }`)
- **D-18:** Tous les events passent par `EventEmitter2` (deja en place). Pas d'outbox/Kafka pour cette phase — l'in-process eventing suffit, et l'audit log generique (Phase 1 audit_log) capture le WO/Alert cree.

### Claude's Discretion

- Le nom exact des fichiers job/handler (`PreventiveMaintenanceSchedulerJob`, `SparePartConsumptionHandler`, `MeterUpdateHandler`).
- Le decoupage du module entre `maintenance/jobs/` et `maintenance/event-handlers/`.
- Le format precis des log lines emises par le cron (mais doit inclure `tenant_id`, `pm_plan_id`, `decision: 'opened' | 'skipped_existing'`).
- Tests unitaires : choix entre Jest mocks vs in-memory DB pour les services.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements

- `.planning/ROADMAP.md` § Phase 8 — phase boundary, success criteria, dependencies
- `.planning/REQUIREMENTS.md` § ALT-01, ALT-02 — verbatim requirement statements

### Existing Entities (Phase 1/2/3 schema this phase builds on)

- `apps/api/src/modules/maintenance/entities/preventive-maintenance-plan.entity.ts` — PM plan table structure (intervalType, intervalValue, lastExecutedMeter, lastExecutedAtUtc, nextDueAtUtc, isActive)
- `apps/api/src/modules/maintenance/entities/work-order.entity.ts` — WorkOrder lifecycle, status enum
- `apps/api/src/modules/maintenance/entities/spare-part.entity.ts` — current_stock, threshold_min, below_threshold flag
- `apps/api/src/modules/maintenance/entities/spare-part-consumption.entity.ts` — consumption audit trail
- `apps/api/src/modules/master-data/production-equipment.entity.ts` — equipment master (will gain current_hours_meter, current_km_meter)
- `apps/api/src/modules/maintenance/entities/equipment-refuel.entity.ts` — source of hour-meter readings (`equipment_hour_meter_reading`)
- `apps/api/src/modules/alerts/alert.entity.ts` — Alert inbox table (dedupe_key, severity, status, source_event_type)
- `apps/api/src/modules/analytics/entities/alert-rule.entity.ts` — routing config (event_type, severity_filter, channels, role_codes)

### Existing Services & Handlers (to extend / call)

- `apps/api/src/modules/maintenance/services/work-order.service.ts` — has or must gain `open(input)` and `findOpen(criteria)`
- `apps/api/src/modules/maintenance/services/spare-part.service.ts` — has `applyConsumption()` that will gain the threshold-flip + emit logic
- `apps/api/src/modules/alerts/alerts.event-handlers.ts` — reference pattern for `@OnEvent('production.xxx.yyy')` -> AlertsService.create
- `apps/api/src/modules/alerts/alerts.service.ts` — `create()` with dedupe + status lifecycle
- `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` — current channel routing (in_app today, email/sms stubs)

### NestJS Schedule Module

- `apps/api/src/modules/<existing-with-cron>/...` — if a `@nestjs/schedule` cron already exists, follow that wiring pattern. If not, expect `ScheduleModule.forRoot()` to be added to AppModule + `@Cron` decorator from `@nestjs/schedule`.

### Prior CONTEXT.md (consistency)

- `.planning/phases/01-foundation/01-CONTEXT.md` — tenant context middleware (`app.current_tenant` GUC) usage pattern
- `.planning/phases/02-vertical-slice-production/02-CONTEXT.md` — event-driven architecture conventions (EventEmitter2, payload shapes)
- `.planning/phases/07-finance-real/07-CONTEXT.md` — recent example of phase that touched cron + event handlers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `WorkOrderService.open(input)` (apps/api/src/modules/maintenance/services/work-order.service.ts) — already creates WorkOrder with audit fields. Phase 8 adds `findOpen()` for idempotency check.
- `AlertsService.create()` + `AlertsEventHandlers` — proven pattern for `@OnEvent` → Alert row with dedupe. Pattern from `production.stockpile.threshold_crossed` → reuse 1:1 for `maintenance.spare_part.threshold_crossed`.
- `SparePartService.applyConsumption()` — already updates `current_stock`. Phase 8 extends it with the threshold-flip + event emission.
- `AlertDispatcherService` — channel routing from `alert_rule.channels`. Already routes `in_app` (writes to Alert row). Phase 8 emits events that this dispatcher consumes; the email/sms stubs ship in Phase 9.

### Established Patterns

- **Domain events** : `EventEmitter2` from `@nestjs/event-emitter`, payload always includes `{ tenant_id, site_id, ... }`. Event name format = `<domain>.<aggregate>.<verb_past>` (e.g., `maintenance.spare_part.threshold_crossed`).
- **Tenant scoping in cron** : every multi-tenant query must run inside a CLS context with `app.current_tenant` set. See `tenant-context.middleware.ts` for the per-request pattern — cron jobs must replicate it manually per tenant iteration.
- **Idempotency keys** : `Alert.dedupe_key` is the canonical pattern (`<entity>:<id>:<reason>`). WorkOrder doesn't have one yet, so Phase 8 idempotency is via `findOpen()` query, not a unique constraint.
- **Backfill on schema changes** : migrations include `UPDATE ... SET ... FROM (subquery)` for backfill of new denormalized columns, as done in `1715800100000__operational_day_runtime_columns.sql`.

### Integration Points

- `MaintenanceModule` (apps/api/src/modules/maintenance/maintenance.module.ts) — add new job + handlers to `providers`, ensure `ScheduleModule.forRoot()` is wired at AppModule level.
- `AlertsEventHandlers` (apps/api/src/modules/alerts/alerts.event-handlers.ts) — add `@OnEvent('maintenance.spare_part.threshold_crossed')` and `@OnEvent('maintenance.spare_part.threshold_recovered')` next to the existing `production.*` handlers.
- `production_equipment` migration — add `current_hours_meter` + `current_km_meter` columns with backfill (Phase 8 migration timestamp `1716000100000__add_equipment_meter_columns.sql` or similar).

### Constraints Discovered

- `truck_rotation` may not have `km_total_after` — verify in planning ; if absent, ALT-01 km-based path needs the column added or an alternative source.
- `production_equipment` may already have a `specs` jsonb that some teams use for ad-hoc meter values — Phase 8 prefers dedicated columns to avoid jsonb path queries in the cron hot loop.
- The seed of `alert_rule` rows must run AFTER role_codes table or convention is established. Per Phase 1 RLS, roles are claim strings, not a separate table — so no FK dependency. Seed migration is standalone.

</code_context>

<specifics>
## Specific Ideas

- L'utilisateur prefere les decisions defensives (idempotency stricte, source de verite explicite, denormalisation pour eviter JOINs au cron time). Pas de "we'll see if it works in prod".
- Mode `event-driven > polling` confirme dans cette discussion : on emet a la transition, on ne re-scanne pas tout en boucle.
- Severity escalation 7j -> critical = compromis pragmatique : eviter le flood de criticals au moindre overdue, mais surfacer ce qui traine vraiment.
- Le `below_threshold` flag servira de source de verite single — pas de double-source avec un computed field.

</specifics>

<deferred>
## Deferred Ideas

- **Notification email/SMS reelle** — Phase 9 (NTF-01, NTF-02, NTF-03). Phase 8 emet les events ; les stubs `logger.log()` deviennent vrais appels Brevo/Twilio en Phase 9.
- **Escalation re-emit** (alerte non-acquittee depuis X jours -> re-emit en severity superieure) — v2.
- **UI de configuration des `alert_rule`** (DIRECTION_GROUPE peut ajouter/retirer des role_codes dans une regle existante) — v2.
- **`is_critical` flag sur spare_part** pour forcer `severity = critical` meme avec stock > 0 — v2.
- **Predictive maintenance ML** (apprendre les patterns de panne pour pre-alerter avant le seuil PM) — v2.
- **Webhooks externes** (notifier un Slack/Teams au lieu de email) — v2.

</deferred>

---

*Phase: 08-operational-alerts-closure*
*Context gathered: 2026-05-16 (decision-by-recommendation mode — user delegated calls)*
