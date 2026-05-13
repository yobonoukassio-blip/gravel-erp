# Phase 3: Operational Completeness — Research

**Researched:** 2026-05-13
**Domain:** Mining ERP — Explosifs/Tir, Concassage/Criblage, Maintenance, RH, Ventes/Expédition
**Confidence:** HIGH (Phase 2 patterns locked; Phase 3 builds directly on those foundations)

---

## Summary

Phase 3 extends the vertical slice of Phase 2 to cover every remaining operational domain: the regulated explosives/blasting chain (TIR), crushing and screening feeding the stockpile (CON/CRI), equipment maintenance with spare-parts stock (MNT), the HR module that gates RH habilitations across TIR and MNT (RH), and the commercial chain from customer contract to digital delivery note to multi-currency invoice (VTE).

All six domains share one structural constraint: **Phase 2 patterns are the law**. Every new event table uses the same monthly RANGE-partitioned, SHA-256 chain-of-hash, append-only, BEFORE-DELETE-trigger, outbox-published schema as `stockpile_event`, `fuel_tank_event`, and `hse_incident`. Every new service that crosses a module boundary does so via EventEmitter2 events, never direct Service-A → Service-B calls. Every new mobile screen extends `AppendOnlyRepository<T>`. No new infrastructure stack items are needed.

The critical design constraint that sets Phase 3 apart from Phase 2 is **regulatory immutability under explosives law** (TIR-01, TIR-03, TIR-06): the blast-plan lifecycle is a saga pattern, not a simple state machine, and daily explosives reconciliation must block `OperationalDay` closure — a Phase 4-side-effect that must be wired here.

**Primary recommendation:** Sequence Phase 3 as 8 plans across 4 waves. Wave 0 bootstraps shared foundations (RH module, new i18n namespaces, ADR drafts, Keycloak roles). Waves 1–3 run domain plans in parallel where there are no hard data dependencies. The critical path is: RH (W0) → TIR (W1, depends on RH habilitations) → VTE/BL (W3, depends on stockpile OUTFLOW_SALE).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TIR-01 | Registre explosifs append-only, snapshot PDF signé, hash contenu | Chain-of-hash pattern (mirrors stockpile_event); S3 Object Lock from HSE |
| TIR-02 | Détonateur tracé individuellement par numéro de série | Dedicated detonator entity with serial_number, FK blast_charge_id |
| TIR-03 | Plan de tir créé, validé HSE, figé event append-only avant chargement | Saga lifecycle (draft→HSE_APPROVED→LOADED→FIRED→REPORTED); pessimistic lock on plan |
| TIR-04 | Chargement explosifs saisi par trou avec contrôle écart vs plan | Blast charge events linked to drilling plan holes; variance guard at service level |
| TIR-05 | Tir ne peut être déclenché sans validation zone de sécurité HSE (saga clearance) | Clearance saga: async event exchange; HSE officer must confirm; TIR module listens |
| TIR-06 | Rapport de tir immuable (fragmentation, vibration, incidents) | Append-only blast report entity; links to hse_incident if required |
| TIR-07 | Réconciliation quotidienne explosifs entrée/sortie/stock bloque clôture journalière | OperationalDay.closure_blocked_by FK or array; same pattern as threshold alerts |
| CON-01 | Tonnage entrant/sortant concasseur suivi, performance et heures fonctionnement | CrusherSession entity; outbox publishes STOCKPILE_INFLOW to StockpileEventService |
| CON-02 | Consommation énergétique concasseurs par session | energy_kwh_minor_units column on CrusherSession; feeds CAR-04 energy module |
| CRI-01 | Criblage classifie production en calibres avec contrôle qualité et non-conformités | ScreeningSession entity with calibre_yields JSONB; STOCKPILE_INFLOW per calibre |
| MNT-01 | Parc équipements avec spécifications, compteurs heures, statut | Extend existing production_equipment; add odometer/hour_meter, spec JSONB |
| MNT-02 | Plan maintenance préventive par équipement (intervalle horaire/km/temporel) | PreventiveMaitenancePlan entity; BullMQ job generates work orders on interval |
| MNT-03 | Intervention corrective saisie avec diagnostic, pièces consommées, main d'œuvre, arrêt | WorkOrder entity; SparePartConsumption events reduce spare_parts_stock |
| MNT-04 | Stock pièces de rechange déclenche alertes quand seuil franchi | spare_parts_stock ledger with threshold alerts — same edge-triggered pattern as STK-02 |
| MNT-05 | Disponibilité MTBF/MTTR calculée et exposée au dashboard | MTBFCalculatorService from work_order downtime_minutes; MaterializedView per equipment |
| RH-01 | Référentiel employés: identité, contrat, site, rôle métier, habilitations rattachées | employee table; employee_certification table (schema already in hse-rh-deferred-scope.md) |
| RH-02 | Pointage entrée/sortie de poste par superviseur sur mobile offline | ShiftEntry append-only entity; offline via AppendOnlyRepository |
| RH-03 | Rotations d'équipes planifiées par site avec affectation aux postes | ShiftRoster entity; web management; pessimistic_lock sync strategy |
| RH-04 | Sous-traitants gérés comme entités first-class avec personnel et habilitations | Subcontractor entity; SubcontractorEmployee entity; reuse employee_certification |
| VTE-01 | Référentiel clients (CRM léger): identité, devise contractuelle, conditions paiement | Customer entity; CRUD web; no offline |
| VTE-02 | Contrat de vente: produit, calibre, prix, devise, quantités, période, transporteurs | SaleContract entity; price dinero.js minor units; date range CHECK |
| VTE-03 | BL numérique généré sur pesage, signature client/chauffeur, offline possible | BonDeLivraison entity; offline numbering scheme (same as weighing ticket D2-32); dual signature SHA-256 S3 |
| VTE-04 | Facture multi-devise à partir de BLs avec taux FX figé date BL | Invoice entity; fx_rate_id FK to immutable fx_rate snapshot table; dinero.js conversion |
| VTE-05 | Suivi transporteur: BL, camion, chauffeur, destination | transport_assignment FK on BL; extends existing truck/driver entities |
| VTE-06 | Dossier douane rattaché au BL pour ventes export | CustomsDossier entity; documents array SHA-256 refs; country-specific template JSONB |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **Stack locked:** NestJS 11 / Node 24, PostgreSQL 18 + PostGIS 3.5 + TimescaleDB, Flutter 3.35 + PowerSync + Drift, Angular 20, Keycloak 26.
- **Money:** `dinero.js` v2, bigint minor units, never floats. XOF = 0 decimals, EUR = 2. Three representations: origin / site-functional / group-reporting.
- **ORM:** TypeORM 0.3.x with `nestjs-cls` for per-request tenant context. No Prisma.
- **Multi-currency:** `date-fns-tz` for timezone handling. Store UTC, render local.
- **No new infrastructure** until explicitly decided: Redis/BullMQ for jobs, S3/MinIO for objects, EMQX/Kafka for IoT are Phase 5.
- **Modular monolith** — no microservice split in Phase 3.
- **Paie complète hors scope** — export heures/primes only.
- **OHADA analytics only** — no SYSCOHADA general ledger.
- **Security:** RBAC via Keycloak + CASL in-process; audit trail on every entity.

---

## Standard Stack

All libraries below are already installed from Phase 1–2. Phase 3 adds zero new npm/pub packages unless noted.

### Core (reused from Phase 1–2)
| Library | Version | Purpose | Status in Project |
|---------|---------|---------|-------------------|
| NestJS 11 | 11.x | API framework | Installed, wired |
| TypeORM 0.3.x | 0.3.x | ORM + migrations | Installed |
| nestjs-cls | latest | Per-request tenant context | Installed |
| class-validator + class-transformer | latest | DTO validation | Installed |
| dinero.js | 2.x | Money math | Installed |
| date-fns-tz | latest | Timezone handling | Installed |
| BullMQ (`@nestjs/bull`) | latest | Background jobs / crons | Installed |
| EventEmitter2 | latest | In-process cross-module events | Installed |
| OutboxService (custom) | — | Transactional outbox | Built Phase 2 |
| EventChainVerifier (custom) | — | Chain-of-hash verification | Built Phase 2 W0-P01 |
| StockpileEventService | — | Append STOCKPILE_INFLOW/OUTFLOW | Built Phase 2 W2-P05 |
| casl | latest | In-process ABAC | Installed |
| nestjs-i18n | latest | i18n | Installed |
| nestjs-pino | latest | Structured logging | Installed |

### Mobile (Flutter, reused)
| Library | Version | Purpose |
|---------|---------|---------|
| powersync_flutter | latest | Offline sync |
| drift + drift_sqlite_async | 2.x | Local ORM |
| riverpod | 2.5+ | State management |
| flutter_secure_storage | latest | Token storage |
| signature | latest | Offline signature capture (BL dual-sign) |
| mobile_scanner | latest | Barcode/QR for detonator serial scan |

### Web (Angular, reused)
| Library | Version | Purpose |
|---------|---------|---------|
| @angular/material + CDK | 20.x | UI primitives |
| ag-grid-community | 32.x | Data grids |
| @formly/angular | 6.x | Dynamic forms |
| transloco | latest | i18n |
| apexcharts | latest | MTBF/MTTR dashboard charts |

### New additions for Phase 3
| Package | Install Command | Purpose | Confidence |
|---------|----------------|---------|------------|
| `pdfkit` or `@pdfme/generator` | `pnpm add pdfme/generator --filter=@gravel/api` | PDF generation for explosives snapshot (TIR-01) | MEDIUM — verify @pdfme/generator is maintained; fallback: pdfkit |
| `qrcode` | `pnpm add qrcode --filter=@gravel/api` | QR code on BL for offline scan | MEDIUM |

---

## Architecture Patterns

### Pattern 1: Append-Only Event Table (canonical — Phase 2 baseline)

Every new ledger table in Phase 3 follows this schema shape exactly. Do not deviate.

```sql
-- Template: explosives_event (TIR-01)
CREATE TABLE explosives_event (
  id               UUID NOT NULL DEFAULT uuid_generate_v4(),
  occurred_at_utc  TIMESTAMPTZ NOT NULL,
  tenant_id        UUID NOT NULL,
  site_id          UUID NOT NULL,
  event_type       explosives_event_type NOT NULL,
  quantity_delta_g BIGINT NOT NULL,           -- grams, signed; chain-of-hash payload field
  unit_price_minor BIGINT,
  currency         CHAR(3),
  source_reference JSONB NOT NULL DEFAULT '{}',
  prev_hash        BYTEA NOT NULL,
  row_hash         BYTEA NOT NULL,
  created_by       UUID NOT NULL,
  PRIMARY KEY (id, occurred_at_utc)
) PARTITION BY RANGE (occurred_at_utc);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION enforce_append_only() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'restrict_violation'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER explosives_event_no_update
  BEFORE UPDATE OR DELETE ON explosives_event
  EXECUTE FUNCTION enforce_append_only();
```

**Chain-of-hash computation** (same pattern as `StockpileEventService`):
```typescript
// Source: apps/api/src/modules/stockpile/services/stockpile-event.service.ts
const canonicalPayload = buildCanonicalPayload({
  event_type, material_type, quantity_delta_g, site_id, operational_day_id,
  source_reference, occurred_at_utc
});
const rowHash = sha256(Buffer.concat([prevHash, Buffer.from(canonicalPayload)]));
```

Register the new table in `EventChainVerifier.CANONICAL_PAYLOAD_SQL` (W0-P01 file: `apps/api/src/common/chain-of-hash/event-chain.verifier.ts`).

### Pattern 2: Blast Plan Lifecycle Saga (TIR-03, TIR-05)

The blast plan is the only entity in Phase 3 requiring a **multi-step saga with external clearance**. Use a state machine with pessimistic lock sync (matches `DrillingPlan` D2-10), not append-only.

```
blast_plan status transitions:
  DRAFT → HSE_APPROVED → LOADED → FIRE_REQUESTED → CLEARED → FIRED → REPORTED

Saga steps:
  1. Chef Carrière creates blast_plan (DRAFT), links to drilling_plan holes
  2. HSE Officer approves → blast_plan.status = HSE_APPROVED (mutation, not append)
  3. Chargement: each hole gets BlastCharge append-only events linked to blast_plan
  4. Chef requests fire: publishes tir.blast_plan.fire_requested
  5. HSE Officer issues zone clearance: publishes tir.blast_plan.zone_cleared
  6. TirModule listener transitions blast_plan.status = FIRED
  7. Post-fire: BlastReport append-only entity created (TIR-06)
  8. Nightly job: reconciles explosives stock → blocks OperationalDay if gap (TIR-07)
```

**Clearance saga pattern:**
- `blast_plan.fire_requested_at` timestamp set on step 4
- `BlastClearanceService` in HSE module publishes `tir.blast_plan.zone_cleared` (EventEmitter2)
- `BlastPlanSagaHandler` in TIR module listens and transitions status
- Timeout: if clearance not received in 4h, auto-expire fire request and require re-request
- No direct HSE module import in TIR module — only event names cross boundaries

**Sync strategy for blast_plan:** `pessimistic_lock` (same as drilling_plan). Web-only creation and HSE approval. Mobile-only blast charge entry (offline, append_only_event).

### Pattern 3: Habilitation As-Of Gate

This pattern gates TIR-05 chargement and MNT-03 equipment assignment. Schema already designed in `docs/phase-03-handoff/hse-rh-deferred-scope.md`. Reproduced here for completeness:

```sql
CREATE TABLE employee_certification (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  employee_id           UUID NOT NULL REFERENCES employee(id),
  certification_type_id UUID NOT NULL REFERENCES certification_type(id),
  valid_from            DATE NOT NULL,
  valid_to              DATE NOT NULL,
  certificate_number    VARCHAR(100),
  document_sha256       VARCHAR(64),  -- S3 Object Lock ref, same bucket as HSE photos
  created_by            UUID NOT NULL,
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to >= valid_from)
);
```

As-of query (called at saga step boundaries, never at `now()` — use `operational_day.shift_start_local`):

```sql
SELECT 1
  FROM employee_certification ec
  JOIN certification_type ct ON ct.id = ec.certification_type_id
 WHERE ec.employee_id = :employee_id
   AND ct.code = :cert_code
   AND ec.valid_from <= :as_of_date
   AND ec.valid_to   >= :as_of_date
 LIMIT 1;
```

**Call points:**
- `BlastPlanService.approveLoading(operatorId, blastPlanId)` → checks `TIR_MINE_CI` cert
- `WorkOrderService.assign(technicianId, equipmentId)` → checks `CONDUCTEUR_ENGIN` cert for operating equipment
- Soft warning (30-day expiry) computed in `RhHabilitationService.getExpiringCertifications()` → publishes `rh.certification.expiring_soon`

### Pattern 4: Outbox Consumer for Stockpile Integration (CON/CRI)

CON and CRI feed the stockpile exactly as TruckRotation does in Phase 2.

```typescript
// CrusherSessionCompletedHandler (in stockpile module — outbox consumer)
@OnEvent('production.crusher.session_completed')
async handleCrusherSessionCompleted(event: CrusherSessionCompletedEvent) {
  await this.stockpileEventService.append({
    event_type: StockpileEventType.STOCKPILE_INFLOW,
    stockpile_id: event.output_stockpile_id,
    tonnage_delta_kg: event.output_tonnage_kg,
    material_type: event.material_type,
    calibre_code: event.calibre_code,
    source_reference: { crusher_session_id: event.session_id },
    occurred_at_utc: event.completed_at_utc,
  });
}
```

Idempotency key: `crusher_session_id` (same pattern as `rotation_id`).

For CRI-01 with multiple calibres from one screening session: emit **one event per calibre** from the handler, each with its own idempotency key `${session_id}_${calibre_code}`.

### Pattern 5: Spare Parts Stock Ledger (MNT-04)

Same edge-triggered threshold pattern as `stockpile_threshold` (Phase 2 W2-P05), applied to spare parts. Simpler: no chain-of-hash needed (regulatory requirement is lower for spare parts vs explosives). Use a non-append-only `spare_part_stock` table with a `spare_part_movement` audit-trail table (audited via FND-06 standard audit trigger, not chain-of-hash).

```sql
CREATE TABLE spare_part (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL,
  site_id      UUID NOT NULL,
  part_number  VARCHAR(100) NOT NULL,
  description  VARCHAR(300),
  unit         VARCHAR(20) NOT NULL,
  quantity_on_hand NUMERIC(12,3) NOT NULL DEFAULT 0,
  reorder_threshold NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`SparePartService.consume(partId, quantity, workOrderId)` decrements `quantity_on_hand`, inserts `spare_part_movement` row, then calls `SparePartThresholdService.checkCrossing()` (same edge-triggered logic as `StockpileThresholdService`).

### Pattern 6: MTBF/MTTR Calculation (MNT-05)

```typescript
// MTBFCalculatorService
// MTBF = total_uptime_hours / number_of_failures
// MTTR = total_repair_time_hours / number_of_repairs
// Uptime = total_period_hours - SUM(downtime_minutes) / 60
```

Persist result in `equipment_availability` materialized projection. Refresh on `WorkOrderService.close()`. Expose via `GET /equipment/:id/availability`. Dashboard widget uses SSE broadcaster (existing `SseBroadcasterService`) with event key `maintenance.equipment.availability_updated`.

### Pattern 7: BL Offline Numbering + Dual Signature (VTE-03)

Same offline numbering scheme as WeighingTicket (D2-32):
```
<SITE_CODE>-BL-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>
Example: CIV01-BL-20260620-MOB07-0042
```

Server receives BL on sync, validates number uniqueness per site+day, does not renumber. Dual signature (client + driver): two separate `signature` Flutter plugin captures → two separate SHA-256 content-addressed S3 objects. BL is immutable after both signatures captured — no UPDATE allowed, correction via new BL referencing previous.

BL triggers `STOCKPILE_OUTFLOW_SALE` on sync (same outbox pattern as `rotation_completed` → `STOCKPILE_INFLOW`):
```typescript
// BonDeLivraisonCompletedHandler (outbox consumer in stockpile module)
@OnEvent('production.vte.bl_signed')
async handleBlSigned(event: BlSignedEvent) {
  await this.stockpileEventService.append({
    event_type: StockpileEventType.STOCKPILE_OUTFLOW_SALE,
    tonnage_delta_kg: -event.net_tonnage_kg,   // signed negative
    source_reference: { bl_id: event.bl_id },
  });
}
```

Idempotency key: `bl_id`.

### Pattern 8: FX Rate Snapshot (VTE-04)

FX rates must be immutable at BL date. Pattern:

```sql
CREATE TABLE fx_rate_snapshot (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  from_currency   CHAR(3) NOT NULL,
  to_currency     CHAR(3) NOT NULL,
  rate_minor      BIGINT NOT NULL,  -- rate × 10^6 for precision
  rate_date       DATE NOT NULL,
  source          VARCHAR(100),     -- e.g. 'BCEAO', 'manual'
  created_by      UUID NOT NULL,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_currency, to_currency, rate_date)
);
```

Invoice generation looks up `fx_rate_snapshot` by `rate_date = bl.delivery_date`. If no rate exists for that date, invoice generation fails with `ERR_FX_RATE_MISSING` (400). Finance officer must enter rates daily (web form) before invoice batch runs. Never use live FX API — manual entry only (regulatory requirement: rate must be auditable, sourced from BCEAO for XOF).

---

## Domain-by-Domain Implementation Approach

### Domain A: RH — Wave 0 (must be first, blocks TIR and MNT)

**Why first:** TIR-04/05 chargement requires `employee_certification` with `TIR_MINE_CI`. MNT-03 assignment requires `CONDUCTEUR_ENGIN`. Without RH, the habilitation gate cannot be wired.

**Entities:**
- `employee` — identity, contract_type (`CDI|CDD|INTERIM`), site_id FK, role_code (business role, not Keycloak role), habilitations via join
- `employee_certification` — from `hse-rh-deferred-scope.md` (already designed, verbatim)
- `certification_type` — code + label + country + issuing_authority
- `shift_entry` — append-only, `check_in_utc` / `check_out_utc`, operational_day_id FK
- `shift_roster` — planned schedule, pessimistic_lock sync, web management
- `subcontractor` — company entity
- `subcontractor_employee` — employee-shaped, FK `subcontractor_id`, reuses `employee_certification`

**Key service:** `RhHabilitationService`
- `isValidAt(employeeId, certCode, asOfDate): Promise<boolean>` — the as-of gate
- `getExpiringCertifications(siteId, withinDays): Promise<CertificationExpiry[]>` — feeds alerts

**Sync strategy:** `shift_entry` = `append_only_event`; `shift_roster` = `pessimistic_lock`; `employee` = `pessimistic_lock` (managed by admin, rarely updated offline).

**Keycloak roles to add:** `HR_MANAGER`, `SHIFT_SUPERVISOR`. These scope to `(role, site_id)` — same pattern as D2-110.

**Wave 0 also delivers:**
- New i18n namespaces: `tir`, `concassage`, `criblage`, `maintenance`, `rh`, `ventes`
- ADR-0011 through ADR-0015 drafts (one per domain)
- Keycloak role definitions for all Phase 3 roles
- Updated `EventChainVerifier.CANONICAL_PAYLOAD_SQL` registrations for: `explosives_event`, `blast_report`
- Updated `StockpileEventType` enum: verify `STOCKPILE_OUTFLOW_SALE` exists (added in Phase 2 schema but no handler yet), add handler stubs for `crusher_session_completed` and `bl_signed`

### Domain B: TIR — Wave 1 (after RH, parallel with MNT)

**Entities:**
- `explosives_stock_event` — append-only, chain-of-hash, event types: `EXPLOSIVES_IN`, `EXPLOSIVES_OUT_LOAD`, `EXPLOSIVES_RETURN`, `EXPLOSIVES_DESTROY`. Fields: `product_type` (ANFO/EMULSION/DETONATEUR/CORDEAU), `quantity_g`, `unit_price_minor`, `currency`, `supplier`, `doc_reference`, `pdf_sha256` (S3 Object Lock ref for signed PDF snapshot)
- `detonator` — individual tracking entity: `serial_number` (indexed), `status` (`IN_STOCK|LOADED|FIRED|RETURNED|DESTROYED`), `received_in_event_id` FK, `blast_charge_id` FK NULL until loaded
- `blast_plan` — mutable state machine: `status` enum, `drilling_plan_id` FK, `planned_by` UUID, `hse_approved_by` UUID NULL, `hse_approved_at` NULL
- `blast_charge` — append-only events: one row per hole load event; `hole_id` FK, `explosives_qty_g`, `detonator_serial`, `variance_pct` computed
- `blast_report` — append-only, chain-of-hash: `fragmentation_obs` TEXT, `vibration_mm_s` NUMERIC, `incident_ids` UUID[], `prev_hash`, `row_hash`

**Daily reconciliation (TIR-07):**
```typescript
// ExplosivesReconciliationJob — @Cron('30 22 * * *') per site timezone
async reconcile(siteId: string, operationalDayId: string) {
  const computed = await this.computeStockFromEvents(siteId, operationalDayId);
  const physical = await this.getPhysicalCount(operationalDayId); // manual entry
  if (Math.abs(computed - physical) > RECONCILIATION_TOLERANCE_G) {
    await this.operationalDayService.blockClosure(operationalDayId, 'EXPLOSIVES_RECONCILIATION_GAP');
    await this.alertsService.emit('tir.reconciliation.gap_detected', { siteId, gap_g: computed - physical });
  }
}
```

`OperationalDay.closure_blockers` — add a JSONB array column (Phase 3 migration) to track what blocks closure. `blockClosure(dayId, reason)` appends to that array; `resolveClosure(dayId, reason)` removes; closure allowed only when array is empty.

**PDF snapshot (TIR-01):** On every `EXPLOSIVES_IN` or `EXPLOSIVES_OUT` event, generate a PDF snapshot of the stock register state using `@pdfme/generator`, upload to S3 Object Lock (same GOVERNANCE 7-year bucket), store `pdf_sha256` on the event.

**Mobile:** Blast charge entry (`blast_charge` events) via `AppendOnlyRepository<BlastCharge>` — offline supported. Detonator serial scan via `mobile_scanner` barcode plugin. Blast plan HSE approval and fire clearance: web-only (critical decisions, require online connectivity).

**Roles:** `TIR_OPERATOR` (charge entry), `TIR_SUPERVISOR` (plan creation, fire request), `HSE_OFFICER` (clearance — already exists Phase 2).

### Domain C: CON + CRI — Wave 1 (parallel with TIR, independent)

**Entities:**
- `crusher_session` — mutable (has `status`: `active|paused|completed`), not append-only. One row per operational shift for each crusher. Fields: `crusher_id` FK (`production_equipment`), `input_zone_id`, `output_stockpile_id`, `input_tonnage_kg`, `output_tonnage_kg`, `energy_kwh` (for CON-02), `operating_hours`, `session_start_utc`, `session_end_utc`, `operator_id`
- `screening_session` — similar shape; adds `calibre_yields` JSONB: `[{calibre_code, tonnage_kg, is_nonconforming, nonconformity_reason}]`

**No chain-of-hash** on these sessions — they are operational records, not financial ledger entries. Standard FND-06 audit trail suffices.

**On session completion:**
- `CrusherSessionService.complete()` publishes `production.crusher.session_completed` via outbox
- `ScreeningSessionService.complete()` publishes `production.screening.session_completed`
- Outbox consumers in StockpileModule create `STOCKPILE_INFLOW` events (one per calibre for CRI)

**Energy integration (CON-02):** `crusher_session.energy_kwh` feeds `EnergyConsumptionService` (already built Phase 2 CAR-04). On session close, create an `energy_consumption_reading` row automatically.

**Web UI only** — no mobile screen for CON/CRI. Crushers are controlled from fixed stations; data entry is by shift supervisor at a workstation.

**Roles:** `PROCESSING_OPERATOR` (session management), `QUARRY_CHIEF` (already exists).

### Domain D: MNT — Wave 2 (after Wave 1, parallel with VTE)

**Entities:**
- Extend existing `production_equipment` (Phase 2): add `hour_meter_current`, `odometer_km_current`, `spec_jsonb`, `commissioned_date`
- `preventive_maintenance_plan` — `interval_hours INT`, `interval_km INT`, `interval_days INT` (at least one non-null); `last_executed_at`, `next_due_at` (computed)
- `work_order` — both preventive and corrective; fields: `wo_type` (`PREVENTIVE|CORRECTIVE`), `equipment_id`, `status` (`OPEN|IN_PROGRESS|AWAITING_PARTS|CLOSED`), `assigned_technician_id`, `start_at_utc`, `end_at_utc`, `downtime_minutes`, `labor_hours`, `diagnosis_md`
- `spare_part_consumption` — append-only (audit trail): `work_order_id`, `spare_part_id`, `quantity_consumed`, `unit_cost_minor`, `currency`
- `spare_part` + `spare_part_movement` — stock ledger (no chain-of-hash, standard audit)

**PM Plan execution:**
```typescript
// PreventiveMaintenanceDueJob — @Cron('0 6 * * *') daily
for each preventive_maintenance_plan where next_due_at <= tomorrow:
  await workOrderService.createPreventive(plan);
  await alertsService.emit('maintenance.pm_due', { equipment_id, plan_id });
```

`next_due_at` computed by `PmSchedulerService`:
- Hours-based: `next_due_at` when `hour_meter_current >= last_executed_hour_meter + interval_hours`
- Calendar-based: `last_executed_at + interval_days`
- Take whichever comes first.

**MTBF/MTTR:** Computed from `work_order` rows with `wo_type=CORRECTIVE` and `downtime_minutes NOT NULL`. Materialized view refreshed on `WorkOrderService.close()`. Query range: rolling 12 months.

**Equipment status gate (FOR-05 extension):** `production_equipment.status` already has `ACTIVE|MAINTENANCE|OUT_OF_SERVICE`. MNT-03 `WorkOrderService.open(equipmentId)` sets status → `MAINTENANCE`. `close()` sets back to `ACTIVE` (or `OUT_OF_SERVICE` if technician flags). This already blocks foration plan assignment (Phase 2 Phase 2 `assertEquipmentActive` guard).

**Mobile:** Work order intake (diagnosis + labor hours) via `AppendOnlyRepository<WorkOrderEntry>` — offline. Spare part consumption: online only (requires stock check before consuming).

### Domain E: VTE — Wave 3 (after MNT/W2, independent of TIR)

**Entities:**
- `customer` — identity, `payment_terms_days`, `credit_limit_minor`, `currency`, `country_iso2`
- `sale_contract` — `customer_id`, `product_type`, `calibre_code`, `unit_price_minor`, `currency`, `quantity_contracted_kg`, `start_date`, `end_date`, `authorized_transporter_ids UUID[]`
- `bon_de_livraison` (BL) — `bl_number` (offline scheme), `sale_contract_id`, `weighing_ticket_id` FK (links to Phase 2 weighing), `delivery_date`, `client_signature_sha256`, `driver_signature_sha256`, `transporter_id`, `destination`, `status` (`DRAFT|SIGNED|INVOICED`), `is_export` BOOL, `customs_dossier_id` FK NULL
- `invoice` — `customer_id`, `invoice_number` (sequential per tenant), `invoice_date`, `fx_rate_snapshot_id` FK, `total_minor` BIGINT, `currency`, `status` (`DRAFT|SENT|PAID|DISPUTED`)
- `invoice_line` — `bl_id`, `quantity_kg`, `unit_price_minor`, `line_total_minor`
- `fx_rate_snapshot` — as described above
- `customs_dossier` — `bl_id`, `country_iso2`, `declaration_number`, `documents` JSONB (array of `{doc_type, sha256, uploaded_at}`)
- `transporter` — company entity (reuses pattern from `subcontractor`): `name`, `country`, `type` (`INTERNAL|EXTERNAL`)

**BL generation from WeighingTicket:** Chef Carrière or Weighing Operator creates BL linked to a `WeighingTicket`. If online: immediate. If offline: `AppendOnlyRepository<BonDeLivraison>` with offline numbering.

**Invoice generation (VTE-04):** Batch or manual trigger from web. `InvoiceService.generateForBLs(blIds[])`:
1. Group BLs by `sale_contract_id`
2. Look up `fx_rate_snapshot` for `delivery_date`
3. Compute line totals in `dinero.js` (origin currency → site functional → group reporting)
4. If any BL missing FX rate: fail with `ERR_FX_RATE_MISSING`, list affected BLs
5. Create `invoice` + `invoice_line` rows
6. Publish `vte.invoice.created` event (for alerts + Phase 4 finance feeds)

**Customs dossier (VTE-06):** Created when BL has `is_export = true`. Template per country (JSONB in DB). Documents uploaded via pre-signed S3 URL (same pattern as HSE attachments). Dossier is NOT append-only — it accumulates documents over time but is audited via FND-06.

**Roles:** `SALES_MANAGER` (contract + invoice), `WEIGHING_OPERATOR` (BL creation — already exists Phase 2), `FINANCE_OFFICER` (FX rate entry, invoice batch).

---

## Wave Sequencing Recommendation

```
Wave 0 (BLOCKING — all of Phase 3):
  P01: RH module (employee + certification_type + employee_certification + shift entities)
       + New i18n namespaces (tir/concassage/criblage/maintenance/rh/ventes)
       + Keycloak roles (TIR_OPERATOR, TIR_SUPERVISOR, HR_MANAGER, SHIFT_SUPERVISOR,
         PROCESSING_OPERATOR, SALES_MANAGER, FINANCE_OFFICER)
       + OperationalDay.closure_blockers migration
       + EventChainVerifier registrations for blast_report + explosives_stock_event
       + ADR drafts 0011–0015
       + VTE FX rate snapshot table (needed by VTE but simple enough to co-locate here)

Wave 1 (parallel pair, after W0):
  P02: TIR module — explosives ledger + blast plan lifecycle + detonator tracking
       + daily reconciliation + blast report
  P03: CON + CRI — crusher/screening sessions + outbox→stockpile consumers

Wave 2 (parallel pair, after W1):
  P04: MNT — equipment extensions + PM plans + work orders + spare parts stock
  P05: VTE Part 1 — customer + sale contract + BL (offline) + transporter + customs dossier

Wave 3 (parallel pair, after W2):
  P06: VTE Part 2 — invoice generation + FX lookup + multi-currency conversion + invoice UI
  P07: Dashboards + KPI extensions — maintenance dashboard (MTBF/MTTR), ventes summary,
       explosives balance widget; wire new SSE channels; promote ADRs to Accepted

Total: 8 plans across 4 waves (same count as Phase 2)
```

**Dependency rationale:**
- W0 P01 (RH) blocks W1 P02 (TIR) because `blast_plan.approveLoading()` calls `RhHabilitationService.isValidAt()`
- W1 P02 and P03 are independent of each other — TIR consumes explosives stock, CON/CRI consume raw material; both produce stockpile events via outbox
- W2 P04 (MNT) depends on W1 completion because it extends `production_equipment` and may reference `work_order → employee_certification` via RH gate
- W2 P05 (VTE BL) is independent of MNT; only depends on W0 (FX snapshot) and Phase 2 weighing ticket
- W3 P06 (VTE invoice) depends on W2 P05 (BL must exist before invoicing)
- W3 P07 (dashboards) depends on all domain modules being wired

---

## Cross-Cutting Integration Points

### 1. OperationalDay Closure Gate (TIR-07)

Phase 3 introduces `operational_day.closure_blockers JSONB DEFAULT '[]'`. A day can only close when this array is empty. `ExplosivesReconciliationJob` adds `'EXPLOSIVES_RECONCILIATION_GAP'` when gap detected. HSE Officer resolves by entering physical count override (with reason, logged in audit trail). This pattern is extensible to Phase 4 (FIN month-end blockers).

**Migration:** `ALTER TABLE operational_day ADD COLUMN closure_blockers JSONB NOT NULL DEFAULT '[]'` — delivered in Wave 0 P01.

### 2. Habilitation Gate Call Points

| Saga Step | Module | Check |
|-----------|--------|-------|
| `BlastPlanService.approveLoading(operatorId)` | TIR | `TIR_MINE_CI` cert valid as-of operational_day.shift_start_local |
| `BlastPlanService.requestFire(supervisorId)` | TIR | `TIR_SUPERVISOR_CI` cert valid |
| `WorkOrderService.assign(technicianId, equipmentId)` | MNT | `CONDUCTEUR_ENGIN` if equipment is mobile; no cert if static (concasseur) |
| `ShiftRosterService.assignOperator(employeeId, position)` | RH | Any position-specific cert (configured per `position_code`) |

All gates call `RhHabilitationService.isValidAt(employeeId, certCode, asOfDate)` — single shared service, no duplication.

### 3. Stockpile Event Sources in Phase 3

Phase 2 delivered handlers for `rotation_completed → STOCKPILE_INFLOW`. Phase 3 adds:

| Source Event | Handler Location | Event Type | Idempotency Key |
|---|---|---|---|
| `production.crusher.session_completed` | StockpileModule | `STOCKPILE_INFLOW` | `crusher_session_id` |
| `production.screening.session_completed` | StockpileModule | `STOCKPILE_INFLOW` | `${session_id}_${calibre_code}` |
| `production.vte.bl_signed` | StockpileModule | `STOCKPILE_OUTFLOW_SALE` | `bl_id` |

These are added to `StockpileModule`'s `event-handlers/` directory. No changes to `StockpileEventService` — it is the stable API.

### 4. Equipment Status Lifecycle

```
ACTIVE ←→ MAINTENANCE ←→ OUT_OF_SERVICE

WorkOrderService.open()  → MAINTENANCE
WorkOrderService.close() → ACTIVE (or OUT_OF_SERVICE if flagged)
```

Phase 2 `assertEquipmentActive()` guard in `ProductionEquipmentService` already enforces this for Foration. MNT module reuses the same guard — no changes needed to Phase 2 equipment service.

### 5. Alert Events Published by Phase 3

Register these in `AlertsModule.event-handlers.ts` (Phase 2 W0-P01):

| Event | Trigger | Channels |
|---|---|---|
| `tir.reconciliation.gap_detected` | Explosives daily recon mismatch | in-app (TIR_SUPERVISOR, HSE_OFFICER) + email |
| `tir.blast_plan.fire_clearance_timeout` | 4h without clearance | in-app (TIR_SUPERVISOR) |
| `rh.certification.expiring_soon` | Cert expires in ≤ 30 days | in-app (HR_MANAGER, SHIFT_SUPERVISOR) |
| `maintenance.pm_due` | PM plan next_due_at ≤ tomorrow | in-app (QUARRY_CHIEF, MAINTENANCE_TECH) |
| `maintenance.spare_part.threshold_crossed` | Spare part stock below threshold | in-app (QUARRY_CHIEF) |
| `vte.invoice.created` | Invoice batch complete | in-app (SALES_MANAGER, FINANCE_OFFICER) |
| `vte.bl_signed` | BL dual-signed | in-app (SALES_MANAGER) |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Explosives stock balance | Custom balance table | Derive from `explosives_stock_event` append-only ledger | Same as stockpile — balance derivation is the audit trail |
| FX rate conversion | Float arithmetic | `dinero.js` v2 + `fx_rate_snapshot` integer rate | Float errors cause OHADA audit failures |
| PDF snapshot generation | Custom HTML renderer | `@pdfme/generator` (JSON-template based) or `pdfkit` | Complex PDF layout without libraries accumulates 300+ lines of boilerplate |
| Habilitation validity check | Per-module date logic | `RhHabilitationService.isValidAt()` (single source) | Multiple modules checking validity = divergence risk |
| Offline BL numbering | UUIDs or server-side only | Offline scheme `SITE-BL-DATE-DEVICE-SEQ` (same as weighing ticket D2-32) | UUIDs not human-readable for field staff; server-side requires connectivity |
| MTBF math | Ad hoc SQL in controller | `MTBFCalculatorService` + materialized projection | Complex rolling windows need test coverage; controllers should not own aggregation |
| Conflict resolution for BL sync | Custom LWW | `append_only_event` for BL + offline numbering | Append-only BLs cannot conflict; server does not renumber |

**Key insight:** Every "ledger" pattern in Phase 3 has been proven in Phase 2. The risk is not technical novelty — it is **disciplined reuse** of the same 6 patterns across 6 new domains without letting each domain team reinvent the wheel.

---

## Common Pitfalls

### Pitfall 1: Blast Plan vs Blast Charge Immutability Confusion
**What goes wrong:** Developer makes `blast_plan` itself append-only (like `stockpile_event`), then cannot update status.
**Why it happens:** "Regulatory immutability" misread as "everything in TIR is append-only."
**How to avoid:** `blast_plan` is a mutable state machine with pessimistic_lock sync (same as `DrillingPlan`). Only the `blast_charge` events, `explosives_stock_event`, and `blast_report` are append-only. Status transitions are audited via FND-06 audit trail.
**Warning signs:** PR adds `BEFORE UPDATE trigger` on `blast_plan` table.

### Pitfall 2: Habilitation Check Using `now()` Instead of Operational Day Date
**What goes wrong:** `isValidAt(employeeId, certCode, new Date())` passes in real-time but fails audit for historical shift reconstruction.
**Why it happens:** Using current timestamp instead of `operational_day.shift_start_local`.
**How to avoid:** `RhHabilitationService.isValidAt()` always takes explicit `asOfDate: Date` parameter. Service layer enforces this — no `now()` inside the method.
**Warning signs:** Method signature `isValidAt(employeeId, certCode)` without date parameter.

### Pitfall 3: Multiple Calibre CRI Events Without Idempotency Per Calibre
**What goes wrong:** If `ScreeningSessionCompletedHandler` crashes mid-loop (after emitting 2 of 5 calibre INFLOW events), replay creates duplicates for the 2 already processed.
**Why it happens:** Outer idempotency key is `session_id` — but multiple events per session.
**How to avoid:** Compound idempotency key `${session_id}_${calibre_code}` on the stockpile DB unique partial index. Handler loops calibres; each is independently idempotent.

### Pitfall 4: FX Rate Missing at Invoice Time
**What goes wrong:** `InvoiceService.generateForBLs()` throws at runtime because Finance Officer forgot to enter the rate for the BL date.
**Why it happens:** Rate entry is manual and not enforced daily.
**How to avoid:** Pre-flight check in `InvoiceService` that lists all required dates before starting the batch. Return a validation error listing missing dates rather than failing mid-batch. UI shows "Missing FX rates" badge on invoice generation form.

### Pitfall 5: Spare Parts Stock Going Negative
**What goes wrong:** Two concurrent work orders consume the last unit of a part; both pass the stock check before either commits.
**Why it happens:** Check-then-act race condition without locking.
**How to avoid:** `SparePartService.consume()` uses `SELECT ... FOR UPDATE` on the `spare_part` row. If `quantity_on_hand - consumed < 0`: throw `ERR_INSUFFICIENT_STOCK` (409). Work order remains `AWAITING_PARTS` status — do not block the work order, just prevent the consumption.

### Pitfall 6: Detonator Serial Tracking Scope
**What goes wrong:** Detonator entity becomes a full inventory system (warehousing, bin locations, expiry dates) instead of just tracing from IN to FIRED/RETURNED.
**Why it happens:** Scope creep from "tracking" to "full inventory management."
**How to avoid:** `detonator` entity has exactly 5 fields: `serial_number`, `status`, `received_in_event_id`, `blast_charge_id`, `destroyed_at_utc`. No warehouse bins, no expiry, no reorder logic. Status lifecycle only: `IN_STOCK → LOADED → FIRED | RETURNED | DESTROYED`.

### Pitfall 7: PDF Snapshot Blocking the Explosives Event Append Transaction
**What goes wrong:** PDF generation happens inside the `explosives_stock_event` append transaction. If S3 upload times out, the transaction rolls back — event not recorded.
**Why it happens:** Naively co-locating PDF generation with the write.
**How to avoid:** Append the event first (transaction commits). Then publish `tir.explosives_event.appended` via outbox. `ExplosivesPdfSnapshotHandler` generates PDF asynchronously, uploads to S3, and updates `pdf_sha256` on the event row (this is the ONLY allowed UPDATE on an explosives event row — `pdf_sha256` column starts NULL, updated once, trigger allows UPDATE only when `old.pdf_sha256 IS NULL`).

### Pitfall 8: VTE Module Importing StockpileModule Directly
**What goes wrong:** `VteModule` calls `StockpileEventService.append()` directly on `bl_signed`.
**Why it happens:** Shortcut — "it's easier to just import the service."
**How to avoid:** `VteService` publishes `production.vte.bl_signed` via `OutboxService`. `StockpileModule`'s `BonDeLivraisonSignedHandler` consumes it. No direct import. This maintains strangler-readiness (D2-02 / D2-03).

---

## Runtime State Inventory

Step 2.5: SKIPPED — Phase 3 is a greenfield module addition, not a rename/refactor/migration. No existing runtime state stores Phase 3 entity names. The only runtime state mutations needed are:

1. **Keycloak:** New roles must be added to the realm (via `infra/keycloak/realms/gravel/roles/phase-03.json` — same pattern as `phase-02.json` from W0-P01). This is a code artifact, not a data migration.
2. **PostgreSQL:** New tables via TypeORM migrations. No data in those tables yet.
3. **S3 Object Lock bucket:** Already provisioned (Phase 2 W0-P01 OpenTofu module). Phase 3 uses same bucket — no new infrastructure.

---

## Environment Availability

Step 2.6: Phase 3 adds no new external services. All infrastructure was provisioned in Phase 1–2:

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| PostgreSQL 18 + PostGIS | All modules | From Phase 1 | TimescaleDB compat still unresolved but not needed in Phase 3 (no hypertables added) |
| Redis + BullMQ | PM cron jobs, outbox worker | From Phase 1 | No change |
| S3/MinIO Object Lock | TIR PDF snapshots, BL signatures, cert documents | From Phase 2 W0-P01 | GOVERNANCE 7y bucket already exists |
| Keycloak 26 | New roles | From Phase 1 | Role additions are code (realm JSON), not infra |
| EventEmitter2 + OutboxService | All cross-module events | From Phase 2 W0-P01 | No change |

**Missing dependencies:** None.
**Blocker from STATE.md:** Local-env tooling (pnpm, docker, flutter) still absent on Windows host. CI remains source of truth. Phase 3 plan must not require local run for verification — all tests must pass in CI.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (API/unit), Playwright (E2E, CI-gated FULL_STACK_AVAILABLE) |
| Config file | `apps/api/jest.config.ts` (existing) |
| Quick run command | `pnpm --filter=@gravel/api test <module>-*` |
| Full suite command | `pnpm --filter=@gravel/api test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| TIR-01 | Explosives event append-only + chain-of-hash | Unit | `pnpm --filter=@gravel/api test explosives-event*` |
| TIR-02 | Detonator serial tracked from receipt to fire | Unit | `pnpm --filter=@gravel/api test detonator*` |
| TIR-03 | Blast plan lifecycle (DRAFT→REPORTED state machine) | Unit | `pnpm --filter=@gravel/api test blast-plan*` |
| TIR-04 | Blast charge linked to hole with variance check | Unit | `pnpm --filter=@gravel/api test blast-charge*` |
| TIR-05 | Fire blocked without zone clearance (saga timeout) | Unit | `pnpm --filter=@gravel/api test blast-clearance-saga*` |
| TIR-06 | Blast report append-only + chain-of-hash | Unit | `pnpm --filter=@gravel/api test blast-report*` |
| TIR-07 | Reconciliation gap blocks OperationalDay closure | Unit | `pnpm --filter=@gravel/api test explosives-recon*` |
| CON-01 | Crusher session creates STOCKPILE_INFLOW via outbox | Unit | `pnpm --filter=@gravel/api test crusher-session*` |
| CON-02 | Energy kwh stored on session | Unit | covered by crusher-session spec |
| CRI-01 | Screening session yields per-calibre INFLOW, idempotent | Unit | `pnpm --filter=@gravel/api test screening-session*` |
| MNT-01 | Equipment hour_meter + spec persisted | Unit | `pnpm --filter=@gravel/api test production-equipment-ext*` |
| MNT-02 | PM plan generates work order when due | Unit | `pnpm --filter=@gravel/api test preventive-maintenance*` |
| MNT-03 | Work order consumes spare part stock with FOR UPDATE lock | Unit | `pnpm --filter=@gravel/api test work-order*` |
| MNT-04 | Spare part threshold crossed event emitted | Unit | `pnpm --filter=@gravel/api test spare-part-threshold*` |
| MNT-05 | MTBF/MTTR computed correctly from work order downtime | Unit | `pnpm --filter=@gravel/api test mtbf-calculator*` |
| RH-01 | Employee + certification as-of query returns correct validity | Unit | `pnpm --filter=@gravel/api test rh-habilitation*` |
| RH-02 | Shift entry append-only offline round-trip | Integration | `pnpm --filter=@gravel/mobile integration_test shift_entry_test.dart` |
| RH-03 | Shift roster pessimistic lock prevents concurrent edit | Unit | `pnpm --filter=@gravel/api test shift-roster*` |
| RH-04 | Subcontractor employee inherits certification check | Unit | covered by rh-habilitation spec |
| VTE-01 | Customer CRUD with currency validation | Unit | `pnpm --filter=@gravel/api test customer*` |
| VTE-02 | Sale contract price in minor units, date range valid | Unit | `pnpm --filter=@gravel/api test sale-contract*` |
| VTE-03 | BL offline numbering unique + STOCKPILE_OUTFLOW_SALE via outbox | Unit | `pnpm --filter=@gravel/api test bon-de-livraison*` |
| VTE-04 | Invoice uses FX snapshot rate, fails ERR_FX_RATE_MISSING if absent | Unit | `pnpm --filter=@gravel/api test invoice*` |
| VTE-05 | Transporter linked to BL | Unit | covered by bon-de-livraison spec |
| VTE-06 | Customs dossier attached to export BL | Unit | `pnpm --filter=@gravel/api test customs-dossier*` |

### Wave 0 Gaps

- [ ] `apps/api/test/unit/tir/explosives-event-chain-integrity.spec.ts` — 100-event fixture + corruption detection
- [ ] `apps/api/test/unit/rh/rh-habilitation.spec.ts` — as-of date boundary cases (valid_from = asOf, valid_to = asOf, expired)
- [ ] `apps/api/test/unit/vte/invoice.spec.ts` — FX rate missing path, multi-BL batch, dinero.js conversion
- [ ] `apps/api/test/unit/maintenance/mtbf-calculator.spec.ts` — canonical MTBF formula with zero failures edge case
- [ ] `apps/mobile/integration_test/shift_entry_test.dart` — offline round-trip for shift_entry
- [ ] Framework: no new framework needed — existing Jest + Playwright setup from Phase 2 covers all

---

## State of the Art

| Old Approach | Current Approach (Phase 3) | Phase Introduced | Impact |
|---|---|---|---|
| `STOCKPILE_OUTFLOW_SALE` handler stub (registered in Phase 2 schema, no consumer) | Wire actual consumer in `StockpileModule` from `vte.bl_signed` | Phase 3 VTE | Closes the open stub from P05 decision notes |
| `cost_model_version = 1` (XOF stub) | Phase 3 wires real fuel cost (already done W3-P06); Phase 4 introduces v2 with MNT labor | Partial Phase 2 | No Phase 3 change needed — already resolved |
| `workforce_headcount` proxy for TF hours | Phase 3 RH brings real `shift_entry` data | Phase 3 RH-02 | Phase 4 can upgrade TF formula to use actual hours from shift_entry |
| Equipment status managed only by drill plan assignment | Phase 3 MNT manages full lifecycle including `AWAITING_PARTS` | Phase 3 MNT | FOR-05 guard remains valid; new statuses added |

---

## Open Questions

1. **Explosives regulation by country**
   - What we know: Côte d'Ivoire requires signed daily stock register with authority countersignature
   - What's unclear: Is the PDF snapshot sufficient, or is a wet-ink countersignature also needed?
   - Recommendation: Ship PDF generation + S3 Object Lock. Flag for legal review before pilot go-live. Do not block Phase 3 delivery.

2. **Detonator vendor API**
   - What we know: Davey Bickford and Orica are the likely vendors for CI market
   - What's unclear: Whether electronic detonators (EIDs) will have a digital manifest API, or if serial tracking will be manual scan only
   - Recommendation: Phase 3 implements manual barcode scan via `mobile_scanner`. EID API integration is Phase 5 (IoT).

3. **Hard-block vs soft-warning for expired certifications**
   - What we know: `hse-rh-deferred-scope.md` says hard-block in Phase 3 after full RH module is live
   - What's unclear: Whether Gravel Ivoire operations leadership accepts a hard-block on `BlastPlanService.approveLoading()` in the mobile field
   - Recommendation: Implement as hard-block per Phase 2 deferral decision. Include emergency override with dual-supervisor confirmation + audit log entry — but do not implement soft-warning that can be silently ignored.

4. **FX rate source and entry frequency**
   - What we know: BCEAO publishes daily rates for XOF; EUR/XOF is fixed (WAEMU peg)
   - What's unclear: Whether Finance Officer will enter rates daily or batch-enter weekly
   - Recommendation: Web form allows batch entry (date + rate for multiple dates). Invoice generation batch validates all required dates upfront. EUR/XOF peg can be pre-seeded as a system rate. Other currencies (USD, GBP) require manual entry.

5. **OHADA customs dossier templates**
   - What we know: Each UEMOA country has specific export forms
   - What's unclear: Exact field list per country (CI, BF, ML, SN)
   - Recommendation: Ship a `template_jsonb` column on `customs_dossier` with a configurable field schema per `country_iso2`. Start with CI only (Côte d'Ivoire). Engage expert-comptable OHADA (noted in STATE.md open TODOs) before Phase 4.

---

## Sources

### Primary (HIGH confidence)
- `docs/phase-03-handoff/hse-rh-deferred-scope.md` — entity schemas for RH, habilitations, audit — verbatim from Phase 2 design
- `.planning/phases/02-vertical-slice-production/02-W2-P05-SUMMARY.md` — stockpile event patterns, idempotency, chain-of-hash details
- `.planning/phases/02-vertical-slice-production/02-W3-P07-SUMMARY.md` — HSE append-only + S3 Object Lock + CAPA saga patterns
- `.planning/phases/02-vertical-slice-production/02-RESEARCH.md` — locked decisions D2-01..D2-120
- `./CLAUDE.md` — stack, money model, OHADA constraints

### Secondary (MEDIUM confidence)
- ROADMAP.md Phase 3 success criteria — planner target
- STATE.md accumulated context — pitfall list, open TODOs, blockers
- Phase 2 W0-P01-SUMMARY.md — EventChainVerifier, OutboxService API surface

### Tertiary (LOW confidence — flagged for validation)
- Explosives regulation specifics for Côte d'Ivoire (TIR-01): not verified against official CI mining code; flagged in Open Questions #1
- PDF library choice (`@pdfme/generator` vs `pdfkit`): training knowledge, not verified against npm registry currency; planner should verify latest version before specifying

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries from Phase 1–2, no new additions except PDF library (MEDIUM)
- Architecture: HIGH — direct pattern reuse from Phase 2; all 8 patterns are proven in production code
- Pitfalls: HIGH — pitfalls 1–6 derive from Phase 2 experience; pitfall 7 (PDF async) from first-principles analysis
- Domain sequencing: HIGH — dependency graph is deterministic from data dependencies
- Regulatory constraints (TIR): MEDIUM — general pattern is correct; country-specific details unverified

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (stable stack; 30-day window)
