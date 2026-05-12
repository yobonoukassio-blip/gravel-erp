---
phase: 02-vertical-slice-production
plan: W2-P04
subsystem: transport
tags: [transport, weighing-ticket, offline-first, content-hash, outbox, dispatch, flutter, nestjs, angular]

requires:
  - phase: 02-W0-P01
    provides: OutboxService, AppendOnlyRepository, SyncEntity decorator, S3 Object Lock, ADR-0009 draft
  - phase: 02-W1-P02
    provides: foration append-only pattern, mobile offline repo pattern, SSE client
  - phase: 02-W1-P03
    provides: ExtractionCycle append-only pattern, yield service

provides:
  - WeighingTicket entity with offline-generated ticket numbers + content_hash verification
  - TruckRotation append-only with same-tx outbox dispatch on completion
  - production.transport.rotation_completed outbox event (consumed by W2-P05 stockpile inflow)
  - Manual dispatch board (TRP-03) — assign trucks to pending rotations
  - Mobile offline weighing ticket capture with dual signature pads (client + driver)
  - OfflineTicketNumbering service — SITE-YYYYMMDD-DEVICE-SEQ format, per-device counter in Drift
  - ADR-0009 promoted from Draft to Accepted with Implementation Notes

affects: [02-W2-P05-stockpile, 02-W3-P06-billing, 03-operational-completeness, 04-analytics]

tech-stack:
  added: [signature (flutter), crypto (flutter sha256), AG-Grid dispatch grid]
  patterns:
    - "Outbox publish in same DB tx as state mutation (rotation.unloaded_at_utc → outbox row, rollback test proves atomicity)"
    - "Client-computed content_hash with server recomputation + ERR_CONTENT_HASH_MISMATCH rejection"
    - "Offline-first numbering: device-scoped Drift counter + secure-storage device_short_id"
    - "Generated columns for derived values (net_kg, cycle_time_minutes) — server-authoritative arithmetic"

key-files:
  created:
    - apps/api/src/modules/transport/transport.module.ts
    - apps/api/src/modules/transport/entities/weighing-ticket.entity.ts
    - apps/api/src/modules/transport/entities/truck-rotation.entity.ts
    - apps/api/src/modules/transport/services/weighing-ticket.service.ts
    - apps/api/src/modules/transport/services/truck-rotation.service.ts
    - apps/api/src/modules/transport/services/ticket-number-generator.service.ts
    - apps/api/src/modules/transport/controllers/weighing-ticket.controller.ts
    - apps/api/src/modules/transport/controllers/truck-rotation.controller.ts
    - apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts
    - apps/api/src/modules/transport/migrations/1716200000000__create_weighing_ticket.sql
    - apps/api/src/modules/transport/migrations/1716200100000__create_truck_rotation.sql
    - apps/api/src/modules/transport/tests/weighing-ticket.spec.ts
    - apps/api/src/modules/transport/tests/truck-rotation.spec.ts
    - apps/api/src/modules/transport/tests/ticket-number-generator.spec.ts
    - apps/web/src/app/features/transport/transport.module.ts
    - apps/web/src/app/features/transport/pages/rotation-list.component.ts
    - apps/web/src/app/features/transport/pages/dispatch-board.component.ts
    - apps/web/src/app/features/transport/pages/weighing-ticket-list.component.ts
    - apps/mobile/lib/features/transport/screens/rotation_form.dart
    - apps/mobile/lib/features/transport/screens/weighing_ticket_form.dart
    - apps/mobile/lib/features/transport/widgets/signature_pad.dart
    - apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart
    - apps/mobile/lib/features/transport/repositories/rotation_repository.dart
    - apps/mobile/lib/features/transport/repositories/weighing_ticket_repository.dart
    - apps/mobile/integration_test/weighing_ticket_offline_test.dart
    - apps/mobile/integration_test/rotation_test.dart
  modified:
    - docs/adr/ADR-0009-weighing-ticket-offline-numbering.md (Draft → Accepted + Implementation Notes)

key-decisions:
  - "Outbox publish runs in the same DB transaction as rotation.unloaded_at_utc update — rollback proves atomicity (spec asserts via tx rollback that outbox row disappears)"
  - "content_hash field order is frozen in ADR-0009 — any future field added must append (else breaks deterministic hash and rejects all prior tickets)"
  - "Offline ticket numbering uses Drift-persisted counter scoped per (device_short_id, yyyymmdd) — counter resets per OperationalDay, never reissued"
  - "net_kg and cycle_time_minutes are Postgres GENERATED columns — client cannot spoof arithmetic"
  - "Dispatch board uses POST /rotations/:id/assign with active+type-check guard — non-active or non-truck equipment returns 400"

patterns-established:
  - "Same-tx outbox pattern: outboxService.publish({ manager }) inside service method receiving caller's EntityManager"
  - "Client content_hash + server recompute: rejection code ERR_CONTENT_HASH_MISMATCH (reusable for any signed offline payload — BL, HSE incident, etc.)"
  - "Offline numbering format: <ENTITY_CODE>-<YYYYMMDD>-<DEVICE_ID>-<LOCAL_SEQ> — generalizable to BL numbering, incident IDs"

requirements-completed: [TRP-01, TRP-02, TRP-03]

duration: 45min
completed: 2026-05-12
---

# Phase 02 Plan W2-P04: Transport + Pesage Summary

**WeighingTicket with offline-generated ticket numbers + SHA-256 content-hash verification, TruckRotation with same-tx outbox dispatch to stockpile, manual dispatch board (TRP-03), and dual-signature mobile capture for Tab Active 3 field tablets.**

## Performance

- **Duration:** ~45 min (executed across multiple commits over W2 window)
- **Completed:** 2026-05-12
- **Tasks:** 5/5
- **Files created:** 27
- **Files modified:** 1 (ADR-0009)

## Accomplishments

- Backend WeighingTicket entity with `content_hash` verification, generated `net_kg` column, and unique `(tenant_id, ticket_number)` constraint
- Backend TruckRotation with `weighing_ticket_id NOT NULL`, generated `cycle_time_minutes`, and `production.transport.rotation_completed` outbox event published in same transaction as completion
- Web dispatch board (AG-Grid) — left pane pending rotations, right pane active trucks, click-to-assign with active+type validation
- Mobile offline ticket capture: dual signature pads (client + driver), client-side SHA-256 content_hash, Drift-persisted device counter, `is_offline_generated=true` flag
- Mobile integration tests prove airplane-mode capture → sync round-trip → server hash recomputation match
- ADR-0009 promoted from Draft to Accepted with detailed Implementation Notes (canonical payload field order, regex validator, client/server references)

## Task Commits

1. **Task 1: WeighingTicket entity + offline numbering + content hash** — `e6e5853` (feat)
2. **Task 2: TruckRotation + same-tx outbox dispatch** — `8761f3d` (feat)
3. **Task 3: Web transport — rotation list / dispatch board / ticket list** — `03db4b2` (feat)
4. **Task 4: Mobile transport — forms + signature pad + offline numbering** — landed across mobile feature commits; integration tests `6e5232a` (feat)
5. **Task 5: Refine ADR-0009 → Accepted** — `6e5232a` (docs, bundled with mobile tests)

**Supporting fixes (build hygiene):**
- `d2609c6` — missing deps + tsconfig + ClsService API
- `6ed0ff2` — clear remaining 7 TS errors
- `f1fc19e` — last 2 TS errors after rotation landed
- `5f775e9` — 2 lint regressions (otel any cast comment + unused BadRequestException)

## Files Created/Modified

See `key-files` in frontmatter. Highlights:

- `apps/api/src/modules/transport/services/weighing-ticket.service.ts` — `ERR_CONTENT_HASH_MISMATCH` rejection path
- `apps/api/src/modules/transport/services/truck-rotation.service.ts` — `outboxService.publish` with `eventType: 'production.transport.rotation_completed'`
- `apps/api/src/modules/transport/event-handlers/rotation-completed.handler.ts` — outbox dispatch consumer hook for W2-P05
- `apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart` — `OfflineTicketNumbering.generate` with Drift counter
- `apps/mobile/lib/features/transport/widgets/signature_pad.dart` — `SignaturePad` widget, PNG → SHA-256
- `apps/web/src/app/features/transport/pages/dispatch-board.component.ts` — `assignTruck` POST flow
- `docs/adr/ADR-0009-weighing-ticket-offline-numbering.md` — Status: Accepted, Implementation Notes section added

## Decisions Made

- **Same-tx outbox over event listener:** Outbox row inserted via `outboxService.publish({ manager })` inside `TruckRotationService.complete()` — rollback test proves both rotation update and outbox row disappear together. Avoids dual-write inconsistency.
- **Frozen canonical payload field order:** Documented in ADR-0009 Implementation Notes. Adding a field mid-life would invalidate all prior `content_hash` values; any new field must append at the end and use a new hash version field.
- **Drift counter (not server) for offline numbering:** Counter lives in mobile SQLite (`ticket_counter` table) keyed by `(device_id, yyyymmdd)`. Server only validates uniqueness on insert. Fully offline-capable.
- **GENERATED columns for derived arithmetic:** `net_kg` and `cycle_time_minutes` are Postgres `GENERATED ALWAYS AS ... STORED` — client cannot spoof; reporting is server-authoritative.

## Deviations from Plan

None - plan executed as written. Build-hygiene fixes (`d2609c6`, `6ed0ff2`, `f1fc19e`, `5f775e9`) were Rule 3 blocking-issue resolutions for TS/lint regressions surfaced by new transport files landing alongside other Wave 2 work; no behavioral deviation from plan.

**Total deviations:** 0 (4 supporting build-hygiene fixes, all Rule 3).

## Issues Encountered

- TS build errors after large entity additions — resolved incrementally via `fix(api build)` commits.
- ESLint `no-unused-vars` flagged `BadRequestException` import in spec — dropped per lint rule.

None blocking; all resolved within the plan window.

## User Setup Required

None — no new external services. Transport module uses existing Postgres + outbox infrastructure from W0-P01.

## Next Phase Readiness

- **W2-P05 (Stockpile inflow):** Ready to consume `production.transport.rotation_completed` outbox event. Handler scaffold already exists at `apps/api/src/modules/stockpile/...` (note: stockpile-threshold.service.ts is untracked — belongs to W2-P05 scope).
- **W3-P06 (Billing / BL):** `WeighingTicket.content_hash` pattern is reusable for BL signing; ADR-0009 canonical payload approach is the template.
- **Mobile:** Tab Active 3 landscape layout proven for weighing form; pattern reusable for HSE incident capture (Phase 3).

No blockers.

## Self-Check: PASSED

Verified:
- All 27 created files exist on disk
- ADR-0009 contains `Accepted`, `Implementation Notes`, `content_hash`, `SITE_CODE`
- Task commits visible in git log (`e6e5853`, `8761f3d`, `03db4b2`, `6e5232a`)
- Outbox publish call present in `truck-rotation.service.ts`
- Mobile integration tests committed (`6e5232a`)

---
*Phase: 02-vertical-slice-production*
*Completed: 2026-05-12*
