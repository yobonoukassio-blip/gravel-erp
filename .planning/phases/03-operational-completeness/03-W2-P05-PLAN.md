---
phase: 03-operational-completeness
plan: W2-P05
type: execute
wave: 2
autonomous: true
depends_on: [03-W0-P01]
files_modified:
  - apps/api/src/modules/ventes/ventes.module.ts
  - apps/api/src/modules/ventes/entities/customer.entity.ts
  - apps/api/src/modules/ventes/entities/transporter.entity.ts
  - apps/api/src/modules/ventes/entities/sale-contract.entity.ts
  - apps/api/src/modules/ventes/entities/bon-de-livraison.entity.ts
  - apps/api/src/modules/ventes/entities/customs-dossier.entity.ts
  - apps/api/src/modules/ventes/entities/fx-rate-snapshot.entity.ts
  - apps/api/src/modules/ventes/services/customer.service.ts
  - apps/api/src/modules/ventes/services/transporter.service.ts
  - apps/api/src/modules/ventes/services/sale-contract.service.ts
  - apps/api/src/modules/ventes/services/bon-de-livraison.service.ts
  - apps/api/src/modules/ventes/services/customs-dossier.service.ts
  - apps/api/src/modules/ventes/services/fx-rate-snapshot.service.ts
  - apps/api/src/modules/ventes/controllers/customer.controller.ts
  - apps/api/src/modules/ventes/controllers/sale-contract.controller.ts
  - apps/api/src/modules/ventes/controllers/bon-de-livraison.controller.ts
  - apps/api/src/modules/ventes/controllers/customs-dossier.controller.ts
  - apps/api/src/modules/ventes/controllers/fx-rate-snapshot.controller.ts
  - apps/api/src/modules/ventes/migrations/1717400000000__create_customer.sql
  - apps/api/src/modules/ventes/migrations/1717400100000__create_transporter.sql
  - apps/api/src/modules/ventes/migrations/1717400200000__create_sale_contract.sql
  - apps/api/src/modules/ventes/migrations/1717400300000__create_bon_de_livraison.sql
  - apps/api/src/modules/ventes/migrations/1717400400000__create_customs_dossier.sql
  - apps/api/src/modules/ventes/migrations/1717400500000__create_fx_rate_snapshot.sql
  - apps/api/src/modules/ventes/tests/customer.spec.ts
  - apps/api/src/modules/ventes/tests/sale-contract.spec.ts
  - apps/api/src/modules/ventes/tests/bon-de-livraison.spec.ts
  - apps/api/src/modules/ventes/tests/customs-dossier.spec.ts
  - apps/api/src/modules/stockpile/event-handlers/bon-de-livraison-signed.handler.ts
  - apps/web/src/app/features/ventes/ventes.module.ts
  - apps/web/src/app/features/ventes/ventes-routes.ts
  - apps/web/src/app/features/ventes/pages/customer-list.component.ts
  - apps/web/src/app/features/ventes/pages/customer-form.component.ts
  - apps/web/src/app/features/ventes/pages/sale-contract-list.component.ts
  - apps/web/src/app/features/ventes/pages/sale-contract-form.component.ts
  - apps/web/src/app/features/ventes/pages/bl-list.component.ts
  - apps/web/src/app/features/ventes/pages/customs-dossier-form.component.ts
  - apps/web/src/app/features/ventes/pages/fx-rate-entry.component.ts
  - apps/web/src/app/features/ventes/services/ventes-api.service.ts
  - apps/mobile/lib/features/ventes/repositories/bon_de_livraison_repository.dart
  - apps/mobile/lib/features/ventes/screens/bl_form.dart
  - apps/mobile/lib/features/ventes/widgets/signature_pad_dual.dart
  - apps/mobile/lib/features/ventes/services/offline_bl_numbering.dart
  - apps/mobile/integration_test/bl_offline_test.dart
  - apps/api/src/modules/stockpile/stockpile.module.ts
  - apps/api/src/modules/alerts/alerts.event-handlers.ts
  - apps/api/src/app.module.ts
  - apps/web/src/app/app.routes.ts
task_count: 4
requirements: [VTE-01, VTE-02, VTE-03, VTE-05, VTE-06]

must_haves:
  truths:
    - "A bon de livraison can be created offline with an offline-generated number SITE-BL-DATE-DEVICE-SEQ"
    - "BL dual signature (client + driver) produces two separate SHA-256 content-addressed S3 objects"
    - "BL signing publishes production.vte.bl_signed via OutboxService, NOT by directly calling StockpileEventService"
    - "StockpileModule BonDeLivraisonSignedHandler creates STOCKPILE_OUTFLOW_SALE idempotently keyed on bl_id"
    - "SaleContract stores unit_price_minor as BIGINT (dinero.js minor units) — never float"
    - "CustomsDossier is created only when bon_de_livraison.is_export = true"
    - "fx_rate_snapshot table has UNIQUE (tenant_id, from_currency, to_currency, rate_date) — immutable once inserted"
  artifacts:
    - path: "apps/api/src/modules/ventes/entities/bon-de-livraison.entity.ts"
      provides: "BL with offline numbering, dual signature SHA-256, immutable after signing"
      contains: "bl_number, client_signature_sha256, driver_signature_sha256"
    - path: "apps/api/src/modules/ventes/entities/fx-rate-snapshot.entity.ts"
      provides: "Immutable FX rate snapshot keyed by (tenant, from_currency, to_currency, rate_date)"
      contains: "UNIQUE (tenant_id, from_currency, to_currency, rate_date)"
    - path: "apps/api/src/modules/stockpile/event-handlers/bon-de-livraison-signed.handler.ts"
      provides: "STOCKPILE_OUTFLOW_SALE consumer from vte.bl_signed"
      contains: "production.vte.bl_signed"
  key_links:
    - from: "apps/api/src/modules/ventes/services/bon-de-livraison.service.ts"
      to: "apps/api/src/modules/outbox/outbox.service.ts"
      via: "outboxService.publish({ manager, eventType: 'production.vte.bl_signed', payload: { bl_id, net_tonnage_kg, stockpile_id } })"
    - from: "apps/api/src/modules/stockpile/event-handlers/bon-de-livraison-signed.handler.ts"
      to: "apps/api/src/modules/stockpile/services/stockpile-event.service.ts"
      via: "stockpileEventService.append({ event_type: STOCKPILE_OUTFLOW_SALE, tonnage_delta_kg: -net_tonnage_kg, source_reference: { bl_id } })"
---

# Plan: 03-W2-P05 — Ventes Part 1 — CRM + Contrats + BL + Douane (VTE-01..VTE-03, VTE-05, VTE-06)

## Objective

Implement the commercial chain up to invoice readiness: customer CRM (VTE-01), sale contracts with dinero.js pricing (VTE-02), offline-capable digital delivery notes with dual signature (VTE-03), transporter tracking linked to BL (VTE-05), and customs dossier for export sales (VTE-06). The `fx_rate_snapshot` table is also created here as a dependency for W3-P06 invoicing. BL signing publishes `STOCKPILE_OUTFLOW_SALE` via outbox (never direct service import).

**Purpose:** Digitize the delivery-to-invoice chain and feed signed BLs back into the event-sourced stockpile.
**Output:** 6 database tables, 7 backend services, StockpileModule outbox consumer for STOCKPILE_OUTFLOW_SALE, offline mobile BL form with dual signature, full web commercial UI.

## Context

**From Phase 2 W2-P04 (transport — offline numbering pattern):**
```
Offline BL number format: <SITE_CODE>-BL-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>
Example: CIV01-BL-20260620-MOB07-0042
Same pattern as WeighingTicket: SITE_CODE-TICKET-YYYYMMDD-DEVICE_ID-SEQ (ADR-0009)
Server validates uniqueness on sync; does NOT renumber.
Idempotency: BL is append_only_event — cannot conflict since no UPDATE/DELETE.
```

**From Phase 2 W2-P04 (dual signature):**
```dart
// apps/mobile/lib/features/transport/widgets/signature_pad.dart
// Reuse SignaturePad widget for dual-signature BL capture
```

**From Phase 2 W2-P05 (StockpileEventService API):**
```typescript
// apps/api/src/modules/stockpile/services/stockpile-event.service.ts
// StockpileEventType.STOCKPILE_OUTFLOW_SALE already exists as enum value (stub from Phase 2 schema)
// This plan wires the actual handler
```

**From Phase 2 W0-P01 (OutboxService):**
```typescript
// CRITICAL: VteModule must NOT import StockpileModule directly (Pitfall 8)
// BonDeLivraisonService publishes 'production.vte.bl_signed' via OutboxService
// StockpileModule registers BonDeLivraisonSignedHandler consuming that event
```

**From 03-W0-P01:**
- `fx_rate_snapshot` table to create here (needed by W3-P06 invoicing)
- Keycloak roles: `SALES_MANAGER`, `FINANCE_OFFICER`, `WEIGHING_OPERATOR` (from Phase 2)
- i18n namespace `ventes`

**Critical pitfall (research Pitfall 8):** VteModule MUST NOT import StockpileModule. Cross-module via outbox events only.

## Tasks

### Task 1 — Customer, Transporter, SaleContract entities + services (VTE-01, VTE-02, VTE-05)

**Files:**
- `apps/api/src/modules/ventes/entities/customer.entity.ts`
- `apps/api/src/modules/ventes/entities/transporter.entity.ts`
- `apps/api/src/modules/ventes/entities/sale-contract.entity.ts`
- `apps/api/src/modules/ventes/entities/fx-rate-snapshot.entity.ts`
- `apps/api/src/modules/ventes/services/customer.service.ts`
- `apps/api/src/modules/ventes/services/transporter.service.ts`
- `apps/api/src/modules/ventes/services/sale-contract.service.ts`
- `apps/api/src/modules/ventes/services/fx-rate-snapshot.service.ts`
- `apps/api/src/modules/ventes/controllers/customer.controller.ts`
- `apps/api/src/modules/ventes/controllers/sale-contract.controller.ts`
- `apps/api/src/modules/ventes/controllers/fx-rate-snapshot.controller.ts`
- `apps/api/src/modules/ventes/migrations/1717400000000__create_customer.sql`
- `apps/api/src/modules/ventes/migrations/1717400100000__create_transporter.sql`
- `apps/api/src/modules/ventes/migrations/1717400200000__create_sale_contract.sql`
- `apps/api/src/modules/ventes/migrations/1717400500000__create_fx_rate_snapshot.sql`
- `apps/api/src/modules/ventes/tests/customer.spec.ts`
- `apps/api/src/modules/ventes/tests/sale-contract.spec.ts`

**Action:**

`customer`:
```sql
CREATE TABLE customer (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL,
  customer_ref          VARCHAR(50) NOT NULL,
  company_name          VARCHAR(300) NOT NULL,
  country_iso2          CHAR(2) NOT NULL,
  currency              CHAR(3) NOT NULL,
  payment_terms_days    INT NOT NULL DEFAULT 30,
  credit_limit_minor    BIGINT NOT NULL DEFAULT 0,
  primary_contact_name  VARCHAR(200),
  primary_contact_email VARCHAR(300),
  primary_contact_phone VARCHAR(50),
  is_active             BOOL NOT NULL DEFAULT true,
  created_at_utc        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, customer_ref)
);
```

`transporter`:
```sql
CREATE TYPE transporter_type AS ENUM ('INTERNAL','EXTERNAL');

CREATE TABLE transporter (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL,
  company_name VARCHAR(300) NOT NULL,
  country_iso2 CHAR(2) NOT NULL,
  type         transporter_type NOT NULL DEFAULT 'EXTERNAL',
  is_active    BOOL NOT NULL DEFAULT true,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`sale_contract`:
```sql
CREATE TABLE sale_contract (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                UUID NOT NULL,
  customer_id              UUID NOT NULL REFERENCES customer(id),
  contract_reference       VARCHAR(100) NOT NULL,
  product_type             VARCHAR(50) NOT NULL,
  calibre_code             VARCHAR(50) NOT NULL,
  unit_price_minor         BIGINT NOT NULL,    -- dinero.js minor units — NEVER float
  currency                 CHAR(3) NOT NULL,
  quantity_contracted_kg   BIGINT NOT NULL DEFAULT 0,
  start_date               DATE NOT NULL,
  end_date                 DATE NOT NULL,
  authorized_transporter_ids UUID[] NOT NULL DEFAULT '{}',
  is_active                BOOL NOT NULL DEFAULT true,
  created_at_utc           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (tenant_id, contract_reference)
);
```

`fx_rate_snapshot`:
```sql
CREATE TABLE fx_rate_snapshot (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL,
  from_currency   CHAR(3) NOT NULL,
  to_currency     CHAR(3) NOT NULL,
  rate_minor      BIGINT NOT NULL,   -- rate × 10^6 for precision, BIGINT
  rate_date       DATE NOT NULL,
  source          VARCHAR(100) NOT NULL DEFAULT 'manual',
  created_by      UUID NOT NULL,
  created_at_utc  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, from_currency, to_currency, rate_date)
);
```

Pre-seed EUR/XOF rate in migration (WAEMU fixed peg: 1 EUR = 655.957 XOF):
```sql
-- Note: rate_minor = 655957 (655.957 × 1000 rounded to nearest integer, stored as integer × 1000)
-- Executor: seed via service, not hardcoded in migration, to use correct tenant_id
COMMENT ON TABLE fx_rate_snapshot IS
  'Immutable FX rate snapshots. EUR/XOF peg is fixed (WAEMU). Other currencies require daily manual entry by FINANCE_OFFICER.';
```

`SaleContractService.validateTransporter(contractId, transporterId)`: returns true if `transporter_id` is in `authorized_transporter_ids` or if the array is empty (unrestricted).

`FxRateSnapshotService`:
- `upsert(dto)`: INSERT with ON CONFLICT (tenant_id, from_currency, to_currency, rate_date) DO NOTHING — rates are immutable once set for a date (cannot overwrite, must create new date)
- `findForDate(tenantId, fromCurrency, toCurrency, rateDate)`: returns snapshot or null
- `listMissingForDates(tenantId, currency, dates[])`: pre-flight check for invoice generation — returns dates with no rate snapshot (Pitfall 4 prevention)

`POST /fx-rates` — `FINANCE_OFFICER` only. Allows batch entry (array of `{from_currency, to_currency, rate_date, rate_minor, source}`).

Tests `customer.spec.ts`:
- Customer CRUD with currency XOF (0 decimals) and EUR (2 decimals) stored correctly as minor units
- `customer_ref` unique per tenant

Tests `sale-contract.spec.ts`:
- `end_date < start_date` fails CHECK constraint
- `unit_price_minor` stored as BIGINT (1000 XOF = 1000 minor units, 10.50 EUR = 1050 minor units)
- `validateTransporter` returns true for authorized, false for unauthorized, true for empty array

**Commit:** `feat(03-vte): customer + transporter + sale contract + FX rate snapshot`

**Verify:**
```
pnpm --filter=@gravel/api test customer*
pnpm --filter=@gravel/api test sale-contract*
```

**Done:** dinero.js minor units stored correctly. FX rate UNIQUE constraint tested. Contract transporter validation tests pass.

---

### Task 2 — Bon de Livraison + STOCKPILE_OUTFLOW_SALE outbox consumer (VTE-03, VTE-05)

**Files:**
- `apps/api/src/modules/ventes/entities/bon-de-livraison.entity.ts`
- `apps/api/src/modules/ventes/services/bon-de-livraison.service.ts`
- `apps/api/src/modules/ventes/controllers/bon-de-livraison.controller.ts`
- `apps/api/src/modules/ventes/migrations/1717400300000__create_bon_de_livraison.sql`
- `apps/api/src/modules/ventes/tests/bon-de-livraison.spec.ts`
- `apps/api/src/modules/stockpile/event-handlers/bon-de-livraison-signed.handler.ts`
- `apps/api/src/modules/stockpile/stockpile.module.ts`

**Action:**

`bon_de_livraison`:
```sql
CREATE TYPE bl_status AS ENUM ('DRAFT','SIGNED','INVOICED');

CREATE TABLE bon_de_livraison (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id               UUID NOT NULL,
  site_id                 UUID NOT NULL,
  bl_number               VARCHAR(100) NOT NULL,   -- offline scheme: SITE-BL-YYYYMMDD-DEVICE-SEQ
  sale_contract_id        UUID NULL REFERENCES sale_contract(id),
  weighing_ticket_id      UUID NULL REFERENCES weighing_ticket(id),
  transporter_id          UUID NULL REFERENCES transporter(id),
  delivery_date           DATE NOT NULL,
  destination             VARCHAR(300),
  net_tonnage_kg          BIGINT NOT NULL,         -- from weighing ticket or manual entry
  client_signature_sha256 VARCHAR(64) NULL,        -- S3 Object Lock content-addressed key
  driver_signature_sha256 VARCHAR(64) NULL,
  status                  bl_status NOT NULL DEFAULT 'DRAFT',
  is_export               BOOL NOT NULL DEFAULT false,
  customs_dossier_id      UUID NULL,               -- FK set after dossier creation
  is_offline_generated    BOOL NOT NULL DEFAULT false,
  created_at_utc          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bl_number)
);
```

BL is immutable after `status = SIGNED` — enforce in service layer: `BonDeLivraisonService.sign()` transitions from DRAFT to SIGNED; any subsequent UPDATE attempt throws `ERR_BL_IMMUTABLE` (409). Correction is done by creating a new BL with a `correction_of_bl_id` reference (not an update).

`BonDeLivraisonService.sign(blId, clientSignaturePng, driverSignaturePng, manager)`:
1. Validate `status = DRAFT`
2. Validate transporter is authorized for the sale_contract (`validateTransporter`)
3. For each signature (PNG bytes): compute `sha256(bytes)`, upload to S3 Object Lock GOVERNANCE bucket with key = sha256 hex
4. Set `client_signature_sha256`, `driver_signature_sha256`, `status = SIGNED`
5. Publish via outbox in SAME transaction: `eventType: 'production.vte.bl_signed'`, `payload: { bl_id: blId, net_tonnage_kg: bl.net_tonnage_kg, stockpile_id: bl.stockpile_id_from_weighing_ticket }`
6. If `bl.is_export = true`: create `customs_dossier` stub (empty documents array)
7. Emit `production.vte.bl_signed` alert event

**StockpileModule — BonDeLivraisonSignedHandler:**
```typescript
@OnEvent('production.vte.bl_signed')
async handleBlSigned(event: BlSignedEvent): Promise<void> {
  // Idempotency: bl_id
  const existing = await this.stockpileEventRepo.findOne({
    where: { source_reference: { bl_id: event.bl_id } }
  });
  if (existing) return;

  await this.stockpileEventService.append({
    event_type: StockpileEventType.STOCKPILE_OUTFLOW_SALE,
    stockpile_id: event.stockpile_id,
    tonnage_delta_kg: -event.net_tonnage_kg,  // negative — outflow
    source_reference: { bl_id: event.bl_id },
    occurred_at_utc: new Date(),
  });
}
```

Add DB unique partial index:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS stockpile_event_bl_uq
  ON stockpile_event ((source_reference->>'bl_id'))
  WHERE source_reference->>'bl_id' IS NOT NULL;
```

Register `BonDeLivraisonSignedHandler` in `StockpileModule` providers.

Tests `bon-de-livraison.spec.ts`:
- `sign()` publishes `production.vte.bl_signed` outbox event in same tx as status update (rollback test)
- `sign()` on already-SIGNED BL throws ERR_BL_IMMUTABLE
- `sign()` with unauthorized transporter throws ERR_TRANSPORTER_NOT_AUTHORIZED
- BL number follows offline scheme regex `^[A-Z0-9]+-BL-\d{8}-[A-Z0-9]+-\d{4}$`
- `BonDeLivraisonSignedHandler` calls `stockpileEventService.append` with negative `tonnage_delta_kg`
- `BonDeLivraisonSignedHandler` is idempotent — replay with same bl_id does not create duplicate

**Commit:** `feat(03-vte): bon de livraison + dual signature + STOCKPILE_OUTFLOW_SALE outbox consumer`

**Verify:**
```
pnpm --filter=@gravel/api test bon-de-livraison*
```

**Done:** All 6 BL tests pass. Rollback test proves same-tx atomicity. Idempotency handler tested.

---

### Task 3 — CustomsDossier + mobile BL form (VTE-06, VTE-03)

**Files:**
- `apps/api/src/modules/ventes/entities/customs-dossier.entity.ts`
- `apps/api/src/modules/ventes/services/customs-dossier.service.ts`
- `apps/api/src/modules/ventes/controllers/customs-dossier.controller.ts`
- `apps/api/src/modules/ventes/migrations/1717400400000__create_customs_dossier.sql`
- `apps/api/src/modules/ventes/tests/customs-dossier.spec.ts`
- `apps/mobile/lib/features/ventes/repositories/bon_de_livraison_repository.dart`
- `apps/mobile/lib/features/ventes/screens/bl_form.dart`
- `apps/mobile/lib/features/ventes/widgets/signature_pad_dual.dart`
- `apps/mobile/lib/features/ventes/services/offline_bl_numbering.dart`
- `apps/mobile/integration_test/bl_offline_test.dart`

**Action:**

`customs_dossier`:
```sql
CREATE TABLE customs_dossier (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           UUID NOT NULL,
  bl_id               UUID NOT NULL REFERENCES bon_de_livraison(id),
  country_iso2        CHAR(2) NOT NULL,
  declaration_number  VARCHAR(100),
  template_jsonb      JSONB NOT NULL DEFAULT '{}',   -- country-specific field schema
  documents           JSONB NOT NULL DEFAULT '[]',   -- [{doc_type, sha256, uploaded_at, filename}]
  status              VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  created_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`CustomsDossierService`:
- `create(blId)`: called automatically when BL is signed with `is_export = true`. Sets `country_iso2` from `customer.country_iso2`.
- `addDocument(dossierId, docType, sha256, filename)`: appends to `documents` JSONB array. Document previously uploaded to S3 via pre-signed URL (same pattern as `HseAttachmentService.requestUploadUrl()`).
- `confirmDocument(dossierId, docSha256)`: validates sha256 matches uploaded object (same `ERR_HASH_MISMATCH` pattern).
- `setDeclarationNumber(dossierId, declarationNumber)`: sets `declaration_number`.

**Mobile (Flutter) — Offline BL:**

`OfflineBlNumbering.generate(siteCode, deviceShortId)`: same pattern as `OfflineTicketNumbering` from Phase 2 W2-P04. Drift-persisted counter `(device_id, yyyymmdd)`. Format: `${siteCode}-BL-${yyyymmdd}-${deviceShortId}-${seq.toString().padLeft(4, '0')}`.

`SignaturePadDual` widget: wraps two `SignaturePad` instances (client + driver). Labels: "Signature client" and "Signature chauffeur". Each captures PNG bytes + computes SHA-256 via `dart:crypto`. Both signatures required before "Confirmer" button is enabled.

`BonDeLivraisonRepository` extends `AppendOnlyRepository<BonDeLivraison>`. Sync strategy: `append_only_event`. Fields: `bl_number` (offline generated), `sale_contract_id`, `weighing_ticket_id`, `delivery_date`, `net_tonnage_kg`, `client_signature_sha256`, `driver_signature_sha256`, `is_offline_generated = true`, `status = 'DRAFT'`. Sync uploads both signature PNGs to S3 before marking BL as synced.

`BlFormScreen`: shows current weighing ticket (from local PowerSync cache), sale contract picker, transporter picker, dual signature pad, "Generate BL" button. Shows offline banner when disconnected. Confirmation modal: "BL immuable après signature. Confirmer les deux signatures."

Integration test `bl_offline_test.dart`:
- Generate BL number offline: assert format matches `^CIV01-BL-\d{8}-[A-Z0-9]+-\d{4}$`
- Create BL offline with `client_signature_sha256 = 'a'.repeat(64)`, `driver_signature_sha256 = 'b'.repeat(64)`
- Assert `pending_sync = true`, `status = DRAFT`, `is_offline_generated = true`
- Assert `listForSite(siteId)` returns the created row

Tests `customs-dossier.spec.ts`:
- Dossier created automatically when `is_export = true` BL is signed
- Dossier NOT created when `is_export = false`
- `addDocument` appends to JSONB array
- `confirmDocument` throws ERR_HASH_MISMATCH on wrong hash

**Commit:** `feat(03-vte): customs dossier + mobile offline BL with dual signature + offline numbering`

**Verify:**
```
pnpm --filter=@gravel/api test customs-dossier*
pnpm --filter=@gravel/mobile integration_test/bl_offline_test.dart
```

**Done:** Customs dossier auto-creation tested. Mobile BL format regex passes. 4 integration assertions pass.

---

### Task 4 — Ventes Web UI + VentesModule wiring

**Files:**
- `apps/web/src/app/features/ventes/ventes.module.ts`
- `apps/web/src/app/features/ventes/ventes-routes.ts`
- `apps/web/src/app/features/ventes/pages/customer-list.component.ts`
- `apps/web/src/app/features/ventes/pages/customer-form.component.ts`
- `apps/web/src/app/features/ventes/pages/sale-contract-list.component.ts`
- `apps/web/src/app/features/ventes/pages/sale-contract-form.component.ts`
- `apps/web/src/app/features/ventes/pages/bl-list.component.ts`
- `apps/web/src/app/features/ventes/pages/customs-dossier-form.component.ts`
- `apps/web/src/app/features/ventes/pages/fx-rate-entry.component.ts`
- `apps/web/src/app/features/ventes/services/ventes-api.service.ts`
- `apps/api/src/modules/ventes/ventes.module.ts`
- `apps/api/src/modules/alerts/alerts.event-handlers.ts`
- `apps/api/src/app.module.ts`
- `apps/web/src/app/app.routes.ts`

**Action:**

**Web Angular — Ventes Feature Module:**

`CustomerListComponent`: AG Grid with `[customer_ref, company_name, country_iso2, currency, payment_terms_days, is_active]`. "Add Customer" button, filter by `is_active`. Row click → customer form.

`CustomerFormComponent`: Formly form. Fields: `company_name`, `customer_ref`, `country_iso2` (mat-select from ISO-3166 list), `currency` (mat-select XOF/EUR/USD), `payment_terms_days`, `credit_limit_minor` (numeric field, label shows minor units explanation), `primary_contact_name/email/phone`. CASL guard: `SALES_MANAGER`.

`SaleContractListComponent`: AG Grid with `[contract_reference, customer_name, product_type, calibre_code, unit_price_minor (formatted), currency, start_date, end_date, is_active]`. "New Contract" button.

`SaleContractFormComponent`: Formly form with `customer_id` picker, `product_type`, `calibre_code`, `unit_price_minor` (input in major units e.g. "12 500 XOF" — form converts to minor units on submit: for XOF, major = minor; for EUR, multiply by 100), `currency`, `quantity_contracted_kg`, `start_date`, `end_date` (date range picker), `authorized_transporter_ids` (multi-select from transporter list).

`BlListComponent`: AG Grid with `[bl_number, delivery_date, customer_name, net_tonnage_kg, status (badge), transporter_name, is_export]`. Filter by `site_id`, `status`, `date_range`. Read-only list. Link to customs dossier for export BLs.

`CustomsDossierFormComponent`: Documents upload section (pre-signed URL flow). Fields: `declaration_number`, documents list with "Upload" button per document type (DECLARATION_EXPORT, CERTIFICAT_ORIGINE, TRANSIT). Document types configurable. Shows document status (uploaded/pending).

`FxRateEntryComponent`: Batch entry form. Table of date rows with `from_currency`, `to_currency`, `rate_major` input (shown as major units, stored as minor via × 10^6 in `FxRateSnapshotService`), `source` (default "BCEAO"). "Add Row" button. "Save All" button validates all rows then batch-inserts. Shows existing rates for the selected date range. EUR/XOF peg is pre-seeded but shown as non-editable row. "Missing FX rates" badge shows when rates are missing for the past 7 days.

Wire `VentesModule` in `apps/api/src/app.module.ts`. Add `/ventes` lazy route in `apps/web/src/app/app.routes.ts`.

Add to `apps/api/src/modules/alerts/alerts.event-handlers.ts`:
- `@OnEvent('production.vte.bl_signed')` — creates alert for `SALES_MANAGER`, dedupe key = `vte:bl:${blId}:signed` (per-BL, no spam)

**Commit:** `feat(03-vte): ventes web UI + VentesModule wiring + BL signed alert`

**Verify:**
```
pnpm --filter=@gravel/api build
pnpm --filter=@gravel/web build
```

**Done:** API and web build clean. `/ventes` route renders. Customer list, contract list, BL list, FX rate entry all render.

## Key Constraints

- `VteModule` MUST NOT import `StockpileModule` directly (Pitfall 8 — cross-module via outbox event only)
- `unit_price_minor` in `sale_contract` is BIGINT in minor units — NEVER float (dinero.js discipline)
- `bon_de_livraison` is immutable after `status = SIGNED` — service-level guard throws ERR_BL_IMMUTABLE
- FX rates are immutable once inserted for a given date — ON CONFLICT DO NOTHING semantics
- BL offline numbering must follow `SITE-BL-DATE-DEVICE-SEQ` scheme (ADR-0009 generalization per ADR-0015)
- Dual signature: both client AND driver signature required before BL can be signed
- `CustomsDossier` is created only when `is_export = true` — never for domestic BLs
- S3 uploads are the same Object Lock GOVERNANCE bucket as HSE attachments

## Integration Points

This plan produces for downstream plans:
- `bon_de_livraison` table — W3-P06 reads BLs grouped by `sale_contract_id` for invoice generation
- `fx_rate_snapshot` table — W3-P06 `InvoiceService.generateForBLs()` looks up rate by `delivery_date`
- `STOCKPILE_OUTFLOW_SALE` events — `StockpileBalance` now decrements on every signed BL (closes the Phase 2 outflow stub)
- `customs_dossier` — W3-P06 invoice links to dossier for export invoices
- W3-P07 dashboard reads weekly/monthly BL count + revenue (in VTE) as a KPI widget

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test customer*` — CRUD + unique constraint
- [ ] `pnpm --filter=@gravel/api test sale-contract*` — date range CHECK + transporter validation + minor units
- [ ] `pnpm --filter=@gravel/api test bon-de-livraison*` — sign immutability + outbox rollback test + idempotency
- [ ] `pnpm --filter=@gravel/api test customs-dossier*` — auto-create on export + document SHA-256
- [ ] `pnpm --filter=@gravel/mobile integration_test/bl_offline_test.dart` — 4 assertions including number format
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] `/ventes` route renders BL list

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W2-P05-SUMMARY.md`
