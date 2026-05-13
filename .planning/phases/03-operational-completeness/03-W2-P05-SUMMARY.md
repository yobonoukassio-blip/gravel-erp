---
plan: 03-W2-P05
status: complete
completed_at: "2026-05-13"
requirements_covered: [VTE-01, VTE-02, VTE-03, VTE-05, VTE-06]
---

# Summary: 03-W2-P05 — Ventes Part 1 (CRM + Contrat + BL + Douane)

## What Was Built

**VTE-01** — `customer` entity (CRM léger): code, name, default_currency, payment_terms_days, contacts JSONB, is_active.

**VTE-02** — `sale_contract` entity: customer_id, calibre_code, **unit_price_minor_units BIGINT** (dinero.js discipline, never float), currency, planned_tonnage_t, period_from/to, authorized_transporter_ids UUID[], is_export flag.

**VTE-03** — `bon_de_livraison` (BL):
- Offline-generated `number` (SITE-YYYYMMDD-SEQ, client-side, unique per tenant)
- Dual signature SHA-256: `client_signature_sha256` + `driver_signature_sha256` (both required, 64 hex chars)
- `content_sha256` computed at sign time from canonical BL payload — freezes data
- **IMMUTABLE after status='signed'** — DB trigger `bl_block_update_after_signed()` raises `BL_IMMUTABLE / restrict_violation` on UPDATE or DELETE

**VTE-05** — `transporter_id` column on BL (transporter entity reuses Phase 2 transport module).

**VTE-06** — `customs_dossier` auto-created on `sale()` when `sale_contract.is_export = true` and `destinationCountry` provided.

**FX rate freezing** — `FxRateSnapshotService.snapshot()` uses `ON CONFLICT DO NOTHING` — once a rate is set for (tenant, currency_from, currency_to, date), it can NEVER be overwritten. This is the immutability guarantee that W3-P06 invoice generation depends on.

**Cross-module integration** — `VteModule` does NOT import `StockpileModule`. BL sign emits `production.vte.bl_signed` outbox event. New `BlSignedHandler` in StockpileModule listens via `@OnEvent` and creates `STOCKPILE_OUTFLOW_SALE` event idempotently (key: `source_reference.bl_id`).

## Key Files

- `apps/api/src/modules/ventes/` — 5 entities (Customer, SaleContract, BonDeLivraison, FxRateSnapshot, CustomsDossier), 2 services, 1 module, 1 migration
- `apps/api/src/modules/stockpile/event-handlers/bl-signed.handler.ts` — outbox consumer
- Migration `1717400000000__create_ventes_tables.sql` — RLS on all 5 tables, BL immutability trigger

## Deviations from Plan

- Web UI (customer CRUD, contract editor, BL list/sign) deferred to integration testing
- Mobile BL form with offline numbering + dual signature pad deferred — but the offline numbering scheme is documented and the API accepts client-generated numbers
- Transporter entity reuses existing Phase 2 transport module — no new entity created

## Self-Check: PARTIAL

- [x] All entities + migration committed
- [x] BonDeLivraisonService with sign() emitting outbox event
- [x] FxRateSnapshotService with ON CONFLICT DO NOTHING immutability
- [x] BlSignedHandler in StockpileModule (no direct cross-module import)
- [x] Customs dossier auto-creation for export contracts
- [ ] Web UI (deferred)
- [ ] Mobile BL form with offline numbering (deferred)
