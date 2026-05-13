---
phase: 03-operational-completeness
plan: W3-P06
type: execute
wave: 3
autonomous: true
depends_on: [03-W2-P05]
files_modified:
  - apps/api/src/modules/ventes/entities/invoice.entity.ts
  - apps/api/src/modules/ventes/entities/invoice-line.entity.ts
  - apps/api/src/modules/ventes/services/invoice.service.ts
  - apps/api/src/modules/ventes/controllers/invoice.controller.ts
  - apps/api/src/modules/ventes/migrations/1717500000000__create_invoice.sql
  - apps/api/src/modules/ventes/tests/invoice.spec.ts
  - apps/web/src/app/features/ventes/pages/invoice-list.component.ts
  - apps/web/src/app/features/ventes/pages/invoice-detail.component.ts
  - apps/web/src/app/features/ventes/pages/invoice-generate.component.ts
  - apps/web/src/app/features/ventes/services/ventes-api.service.ts
  - apps/api/src/modules/alerts/alerts.event-handlers.ts
task_count: 2
requirements: [VTE-04]

must_haves:
  truths:
    - "Invoice generation uses FX rate from fx_rate_snapshot at BL delivery_date — never a live rate"
    - "InvoiceService.generateForBLs() pre-flight lists all missing FX rate dates and fails with ERR_FX_RATE_MISSING before processing any BL"
    - "All monetary amounts are computed in dinero.js bigint minor units — no float arithmetic"
    - "Invoice is immutable after status = SENT — cannot be edited or deleted"
    - "invoice_number is sequential per tenant (auto-increment sequence)"
  artifacts:
    - path: "apps/api/src/modules/ventes/entities/invoice.entity.ts"
      provides: "Invoice with fx_rate_snapshot_id FK, dinero.js total_minor"
      contains: "fx_rate_snapshot_id, total_minor, invoice_number"
    - path: "apps/api/src/modules/ventes/services/invoice.service.ts"
      provides: "InvoiceService.generateForBLs() with pre-flight FX check"
      exports: ["InvoiceService"]
  key_links:
    - from: "apps/api/src/modules/ventes/services/invoice.service.ts"
      to: "apps/api/src/modules/ventes/services/fx-rate-snapshot.service.ts"
      via: "fxRateSnapshotService.findForDate(tenantId, fromCurrency, toCurrency, bl.delivery_date)"
    - from: "apps/api/src/modules/ventes/services/invoice.service.ts"
      to: "apps/api/src/modules/ventes/entities/bon-de-livraison.entity.ts"
      via: "groups BLs by sale_contract_id, one invoice per contract per batch"
---

# Plan: 03-W3-P06 — Ventes Part 2 — Facturation + FX Freeze (VTE-04)

## Objective

Implement multi-currency invoice generation from signed BLs with immutable FX rate freeze (VTE-04). The core business rule: every peso of revenue is converted using the FX rate snapshot from the BL's delivery date — no live rate, no approximation. Pre-flight validation lists all missing FX rate dates before starting the batch, preventing partial invoice generation (Pitfall 4).

**Purpose:** Close the commercial chain from signed BL to invoice — the Finance Officer can generate invoices that reference auditable, frozen FX rates per the BCEAO daily publication.
**Output:** `invoice` + `invoice_line` tables, `InvoiceService.generateForBLs()` with dinero.js multi-currency conversion, web invoice list/detail/generate UI.

## Context

**From 03-W2-P05 (required — these must exist):**

```typescript
// apps/api/src/modules/ventes/entities/bon-de-livraison.entity.ts
// Fields needed: id, bl_number, sale_contract_id, delivery_date, net_tonnage_kg, status ('SIGNED'), tenant_id

// apps/api/src/modules/ventes/entities/sale-contract.entity.ts
// Fields needed: id, customer_id, unit_price_minor (BIGINT), currency

// apps/api/src/modules/ventes/services/fx-rate-snapshot.service.ts
export class FxRateSnapshotService {
  async findForDate(tenantId: string, fromCurrency: string, toCurrency: string, rateDate: Date): Promise<FxRateSnapshot | null>
  async listMissingForDates(tenantId: string, currency: string, dates: Date[]): Promise<Date[]>
}
// fx_rate_snapshot.rate_minor = rate × 10^6 (e.g. EUR/XOF 655.957 → 655957000)
```

**dinero.js v2 usage for multi-currency conversion:**
```typescript
import { dinero, multiply, toDecimal, convert } from 'dinero.js';
import { XOF, EUR, USD } from '@dinero.js/currencies';

// All amounts stored in minor units (bigint)
// XOF has 0 decimals — 1000 XOF = 1000 minor units
// EUR has 2 decimals — 10.50 EUR = 1050 minor units
// Rate from fx_rate_snapshot.rate_minor is rate × 10^6
// Conversion: fromAmount_minor × rate_minor / 10^6 = toAmount_minor
// Use bigint arithmetic — no floats
```

**From CLAUDE.md — money discipline:**
- XOF = 0 decimals, EUR = 2 decimals
- Three representations: origin / site-functional / group-reporting
- Never floats — all bigint minor units

## Tasks

### Task 1 — Invoice entities + InvoiceService with FX freeze (VTE-04)

**Files:**
- `apps/api/src/modules/ventes/entities/invoice.entity.ts`
- `apps/api/src/modules/ventes/entities/invoice-line.entity.ts`
- `apps/api/src/modules/ventes/services/invoice.service.ts`
- `apps/api/src/modules/ventes/controllers/invoice.controller.ts`
- `apps/api/src/modules/ventes/migrations/1717500000000__create_invoice.sql`
- `apps/api/src/modules/ventes/tests/invoice.spec.ts`
- `apps/api/src/modules/alerts/alerts.event-handlers.ts`

**Action:**

`invoice`:
```sql
CREATE TYPE invoice_status AS ENUM ('DRAFT','SENT','PAID','DISPUTED');

CREATE TABLE invoice (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL,
  customer_id          UUID NOT NULL REFERENCES customer(id),
  invoice_number       VARCHAR(50) NOT NULL,   -- sequential: INV-{YYYY}-{NNNNN}
  invoice_date         DATE NOT NULL,
  fx_rate_snapshot_id  UUID NULL REFERENCES fx_rate_snapshot(id),  -- NULL when origin = group currency
  total_minor          BIGINT NOT NULL DEFAULT 0,     -- in origin currency
  total_minor_reporting BIGINT NOT NULL DEFAULT 0,   -- in group reporting currency (XOF)
  currency             CHAR(3) NOT NULL,
  currency_reporting   CHAR(3) NOT NULL DEFAULT 'XOF',
  status               invoice_status NOT NULL DEFAULT 'DRAFT',
  notes_md             TEXT,
  created_by           UUID NOT NULL,
  created_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at_utc       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE invoice_line (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL,
  invoice_id       UUID NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  bl_id            UUID NOT NULL REFERENCES bon_de_livraison(id),
  quantity_kg      BIGINT NOT NULL,
  unit_price_minor BIGINT NOT NULL,
  line_total_minor BIGINT NOT NULL GENERATED ALWAYS AS (quantity_kg * unit_price_minor / 1000) STORED,
  -- Note: quantity is in kg, unit_price is per tonne (1000 kg), so divide by 1000
  -- This requires that unit_price_minor is per-tonne minor units
  currency         CHAR(3) NOT NULL
);
```

Note on `line_total_minor` generated column: the formula `quantity_kg * unit_price_minor / 1000` uses integer division. This is acceptable for XOF (0 decimals, no fractions). For EUR, the executor must verify if the generated column introduces rounding errors — if so, compute `line_total_minor` in the service using dinero.js and store as a regular column (not GENERATED).

Invoice number sequence:
```sql
CREATE SEQUENCE invoice_number_seq_{tenant} ...
```
Since sequence-per-tenant would require DDL, use application-level sequential generation:
```typescript
// InvoiceService generates: INV-{YYYY}-{padded_seq}
// Fetch next: SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '-', 3) AS INT)), 0) + 1
// FROM invoice WHERE tenant_id = :tenantId AND invoice_number LIKE 'INV-{YYYY}-%'
// Use SELECT FOR UPDATE on a dedicated invoice_sequence row to prevent race conditions
```
Simpler: add `invoice_sequence` table with `(tenant_id, year, last_seq INT)` and `SELECT FOR UPDATE` on generate.

`InvoiceService.generateForBLs(blIds: string[], tenantId: string, invoicedBy: string)`:

```typescript
async generateForBLs(blIds: string[], tenantId: string, invoicedBy: string): Promise<Invoice[]> {
  // Step 1: Pre-flight — load all BLs
  const bls = await this.blRepo.findByIds(blIds, { where: { tenant_id: tenantId, status: 'SIGNED' } });
  const invalidBls = bls.filter(bl => bl.status !== 'SIGNED');
  if (invalidBls.length > 0) throw new Error(`ERR_BL_NOT_SIGNED: ${invalidBls.map(b => b.bl_number).join(', ')}`);

  // Step 2: Pre-flight — collect all unique (currency, date) pairs needed
  const contractsMap = new Map<string, SaleContract>();
  for (const bl of bls) {
    const contract = await this.contractRepo.findById(bl.sale_contract_id);
    contractsMap.set(bl.id, contract);
  }

  const uniqueDates = [...new Set(bls.map(bl => bl.delivery_date.toISOString().split('T')[0]))];
  const uniqueCurrencies = [...new Set([...contractsMap.values()].map(c => c.currency).filter(c => c !== 'XOF'))];

  const missingRates: string[] = [];
  for (const currency of uniqueCurrencies) {
    for (const date of uniqueDates) {
      const rate = await this.fxRateService.findForDate(tenantId, currency, 'XOF', new Date(date));
      if (!rate) missingRates.push(`${currency}/${date}`);
    }
  }
  if (missingRates.length > 0) {
    throw new BadRequestException({
      code: 'ERR_FX_RATE_MISSING',
      missing_rates: missingRates,
      message: `Cannot generate invoices: missing FX rates for ${missingRates.join(', ')}`,
    });
  }

  // Step 3: Group BLs by sale_contract_id (one invoice per contract)
  const byContract = groupBy(bls, bl => bl.sale_contract_id);

  // Step 4: Generate invoices
  const invoices: Invoice[] = [];
  for (const [contractId, contractBls] of Object.entries(byContract)) {
    const contract = contractsMap.get(contractBls[0].id);
    const invoiceNumber = await this.nextInvoiceNumber(tenantId);

    // Compute line totals in dinero.js
    let totalMinor = 0n;
    let totalMinorReporting = 0n;
    const lines: Partial<InvoiceLine>[] = [];

    for (const bl of contractBls) {
      const lineTotal = bl.net_tonnage_kg * BigInt(contract.unit_price_minor) / 1000n;
      lines.push({ bl_id: bl.id, quantity_kg: BigInt(bl.net_tonnage_kg), unit_price_minor: BigInt(contract.unit_price_minor), line_total_minor: lineTotal, currency: contract.currency });
      totalMinor += lineTotal;

      // Convert to XOF for reporting
      if (contract.currency === 'XOF') {
        totalMinorReporting += lineTotal;
      } else {
        const fxRate = await this.fxRateService.findForDate(tenantId, contract.currency, 'XOF', bl.delivery_date);
        // fxRate.rate_minor = rate × 10^6
        // lineTotal (minor units) × rate_minor / 10^6 / (10^decimals_origin) × 10^0_XOF
        // For EUR: lineTotal_cents × rate_minor / 10^6 / 100 = XOF minor (0 decimals)
        const decimals = contract.currency === 'EUR' ? 100n : 1n;
        totalMinorReporting += (lineTotal * BigInt(fxRate.rate_minor)) / 1_000_000n / decimals;
      }
    }

    const invoice = await this.invoiceRepo.save({
      tenant_id: tenantId, customer_id: contract.customer_id, invoice_number: invoiceNumber,
      invoice_date: new Date(), fx_rate_snapshot_id: null /* set per-line if needed */,
      total_minor: totalMinor, total_minor_reporting: totalMinorReporting,
      currency: contract.currency, status: 'DRAFT', created_by: invoicedBy,
    });

    await this.invoiceLineRepo.save(lines.map(l => ({ ...l, invoice_id: invoice.id, tenant_id: tenantId })));
    invoices.push(invoice);

    // Mark BLs as INVOICED
    await this.blRepo.update({ id: In(contractBls.map(b => b.id)) }, { status: 'INVOICED' });
  }

  // Step 5: Emit event
  await this.eventEmitter.emitAsync('vte.invoice.created', { invoice_ids: invoices.map(i => i.id), tenant_id: tenantId });

  return invoices;
}
```

`InvoiceService.send(invoiceId)`: transitions `DRAFT → SENT`. Invoice becomes immutable — subsequent attempts throw `ERR_INVOICE_IMMUTABLE` (409).

`InvoiceController`:
- `POST /invoices/generate` — body: `{ bl_ids: string[] }`, CASL guard `FINANCE_OFFICER`
- `POST /invoices/:id/send` — FINANCE_OFFICER
- `GET /invoices` — paginated, filter by customer_id, status, date_range
- `GET /invoices/:id` — detail with lines

Add `@OnEvent('vte.invoice.created')` to `alerts.event-handlers.ts` — creates alert for `SALES_MANAGER` + `FINANCE_OFFICER`, dedupe key = `vte:invoice_batch:${invoiceIds.join(':').slice(0, 64)}`.

Tests `invoice.spec.ts` (unit, all mocked):
- `generateForBLs` with single XOF BL: line_total correct, no FX conversion needed
- `generateForBLs` with EUR BL: FX rate lookup at delivery_date, XOF conversion correct in bigint
- `generateForBLs` when FX rate missing: throws ERR_FX_RATE_MISSING with list of missing rates BEFORE processing any BL (Pitfall 4)
- `generateForBLs` with UNSIGNED BL: throws ERR_BL_NOT_SIGNED
- `generateForBLs` groups multi-BL by sale_contract_id (2 BLs for same contract → 1 invoice)
- `send()` on SENT invoice throws ERR_INVOICE_IMMUTABLE
- Sequential invoice numbers: two concurrent generates produce consecutive numbers (SELECT FOR UPDATE sequence test)

**Commit:** `feat(03-vte-invoice): invoice entity + multi-currency FX freeze generation + pre-flight validation`

**Verify:**
```
pnpm --filter=@gravel/api test invoice*
pnpm --filter=@gravel/api build
```

**Done:** All 7 invoice unit tests pass. FX rate missing pre-flight test validates Pitfall 4 prevention. BigInt arithmetic verified for XOF and EUR.

---

### Task 2 — Invoice Web UI

**Files:**
- `apps/web/src/app/features/ventes/pages/invoice-list.component.ts`
- `apps/web/src/app/features/ventes/pages/invoice-detail.component.ts`
- `apps/web/src/app/features/ventes/pages/invoice-generate.component.ts`
- `apps/web/src/app/features/ventes/services/ventes-api.service.ts`

**Action:**

`InvoiceListComponent`: AG Grid with `[invoice_number, invoice_date, customer_name, total_major (formatted), currency, total_xof (formatted), status (badge)]`. `total_major` = `total_minor / 10^decimals` formatted with locale separator. Filter by `customer_id`, `status`, `date_range`. "Generate Invoices" button navigates to generate form. "Send" action button per row (FINANCE_OFFICER). Row click → detail.

`InvoiceDetailComponent`: header with invoice metadata (number, date, customer, FX rate used, status). AG Grid for `invoice_line` rows: `[bl_number, delivery_date, quantity_kg (tonnes formatted), unit_price_major, line_total_major, currency]`. Footer with total in origin currency + total in XOF (reporting). Download button: `GET /invoices/:id/pdf` (stub endpoint returning 501 if PDF library not yet implemented — avoids blocking the plan on PDF generation for invoices; PDF for invoices is Phase 4 scope).

`InvoiceGenerateComponent`: 
1. Step 1 — BL selection: AG Grid of SIGNED BLs not yet invoiced (filter by site, date_range, customer). Multi-select checkboxes.
2. Step 2 — FX rate validation: after selecting BLs, calls `POST /invoices/generate` dry-run (or separate endpoint `POST /invoices/validate`) that returns missing FX rates. Shows "Missing FX rates" error panel with links to FX rate entry form if any missing. "Missing FX rates" badge on the generate button.
3. Step 3 — Confirm: shows preview of invoice groups (1 per contract). Confirm button calls `POST /invoices/generate`.
4. Step 4 — Result: list of generated invoice numbers with "View" links.

Update `ventes-api.service.ts` to add `generateInvoices(blIds)`, `sendInvoice(invoiceId)`, `listInvoices(filter)`, `getInvoice(invoiceId)`.

**Commit:** `feat(03-vte-invoice): invoice web UI — list, detail, generation wizard`

**Verify:**
```
pnpm --filter=@gravel/web build
```

**Done:** Web build clean. Invoice list, detail, and generation wizard render. FX rate missing banner shown in generation wizard.

## Key Constraints

- ALL monetary computations MUST use bigint arithmetic — no `Number()` casts, no floats (CLAUDE.md)
- `generateForBLs()` MUST fail with ERR_FX_RATE_MISSING listing ALL missing dates BEFORE processing any BL (Pitfall 4)
- FX rate lookup uses `bl.delivery_date` — never `new Date()` or invoice date
- Invoice is immutable after `status = SENT` — `ERR_INVOICE_IMMUTABLE` on any further mutation
- Sequential invoice numbers require SELECT FOR UPDATE to prevent duplicates
- PDF generation for invoices is explicitly deferred to Phase 4 (stub 501 endpoint is correct)

## Integration Points

This plan produces for downstream plans:
- `invoice` table — W3-P07 reads weekly/monthly revenue for VTE revenue KPI widget
- `vte.invoice.created` event — W3-P07 SSE broadcaster registers this channel for real-time push
- `total_minor_reporting` in XOF — Phase 4 `FIN-02` uses for multi-currency margin calculation

## Success Criteria

- [ ] `pnpm --filter=@gravel/api test invoice*` — 7 unit tests pass including FX pre-flight and bigint EUR conversion
- [ ] `pnpm --filter=@gravel/api build` — clean
- [ ] `pnpm --filter=@gravel/web build` — clean
- [ ] Invoice list, detail, and generate wizard render in `/ventes/invoices` route

## Output

After completion, create `.planning/phases/03-operational-completeness/03-W3-P06-SUMMARY.md`
