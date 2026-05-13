---
plan: 03-W3-P06
status: complete
completed_at: "2026-05-13"
requirements_covered: [VTE-04]
---

# Summary: 03-W3-P06 — Invoice Generation (VTE-04)

## What Was Built

**InvoiceService.generateForBLs()** — multi-currency invoice from signed BLs with FX freezing.

**Pre-flight FX validation:**
1. Collect unique `delivery_date` values from all BLs
2. Call `FxRateSnapshotService.listMissingForDates()` to find any missing rates
3. If any rate is missing → throw `MISSING_FX_RATES: {currency_from}->{currency_to} for {dates}` and abort ENTIRELY
4. Never partial — never starts processing BLs if any rate is missing

**Money math:**
- All arithmetic in **bigint minor units** (CLAUDE.md `dinero.js` discipline)
- `line_total = (unit_price_minor × tonnage_kg) / 1000` per BL
- FX conversion: `total_xof_minor = (subtotal_minor × rate_scaled_1e8) / 100_000_000n` (bigint throughout)

**Sequential numbering:**
- `invoice_counter` table with primary key on `tenant_id` — `ON CONFLICT DO UPDATE last_number+1` is atomic
- Invoice number format: `INV-YYYY-000001` (zero-padded 6 digits per year)

**Immutability:**
- DB trigger `invoice_block_update_after_sent()` — once status=`sent` or `paid`, blocks any mutation of subtotal/total/fx_rate
- Only allowed transitions from SENT: SENT → PAID or SENT → CANCELLED

## Key Files

- `apps/api/src/modules/ventes/entities/invoice.entity.ts`
- `apps/api/src/modules/ventes/services/invoice.service.ts`
- `apps/api/src/modules/ventes/migrations/1717500000000__create_invoice_tables.sql` (invoice + invoice_counter + immutability trigger)
- `apps/api/src/modules/ventes/ventes.module.ts` updated to register InvoiceService

## Deviations from Plan

- PDF generation deferred (was MEDIUM-confidence in RESEARCH — would require `@pdfme/generator` install). Invoice data is fully captured; PDF render can be added as a separate task using S3 Object Lock attachment pattern from HSE incidents
- Web invoice list/detail UI deferred
- All BLs must share one contract currency — multi-currency line invoices deferred to Phase 4 consolidation engine (current design supports single-currency invoice per customer per generation call, which fits OHADA per-country requirements)

## Self-Check: PASSED

- [x] Pre-flight FX validation — fails entirely if any rate missing
- [x] All money math in bigint minor units
- [x] Sequential numbering via SELECT FOR UPDATE on counter
- [x] DB trigger enforces immutability after status=sent
- [x] Migration + entity + service + module wiring committed
- [ ] PDF render (deferred — install @pdfme/generator)
- [ ] Web UI (deferred)
