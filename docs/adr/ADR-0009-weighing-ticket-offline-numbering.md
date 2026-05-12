# ADR-0009 — Weighing ticket offline numbering + content-hash signing

## Status

Accepted (2026-05-12) — refined during Wave 2 (transport module). Authors: Phase 2 planner; refined by W2-P04 executor.

## Context

Pont-bascule operators capture weighing tickets on a tablet that is
*sometimes* offline. The ticket number must be:

1. Unique within the tenant (forever).
2. Generatable offline (no round-trip to server at capture time).
3. Human-readable (printable, mentionable on phone, audit-friendly).
4. Resistant to retroactive forgery (an operator should not be able to
   slip a ticket into yesterday's sequence).

Phase 2 is **manual entry only** — no hardware pont-bascule integration
(RS232/Modbus deferred to Phase 5 per ROADMAP). That means the
*operator* is the source of truth for `gross_kg` and `tare_kg`, and the
ticket is essentially a digital paper form.

Repo touchpoints:

- `apps/api/src/modules/transport/` — Wave 2
- `apps/mobile/lib/features/weighing/` — Wave 1
- D2-31, D2-32, D2-33 (02-CONTEXT.md)

## Decision

**Ticket number format:**

```
<SITE_CODE>-<YYYYMMDD>-<DEVICE_SHORT_ID>-<LOCAL_SEQ>
```

Example: `CIV01-20260615-MOB42-0007`.

Components:

- `SITE_CODE` — `Site.code`, max 12 chars uppercase (already enforced
  by Phase 1 master-data).
- `YYYYMMDD` — calendar date of the OperationalDay (NOT device clock).
- `DEVICE_SHORT_ID` — `MOBxxx` for mobile, `WEBxxx` for web, deterministic
  per device-registration (set at Keycloak device-flow enrollment).
- `LOCAL_SEQ` — 4-digit zero-padded sequence per (device, day). Reset at
  the start of each new OperationalDay.

Uniqueness is guaranteed by the `(DEVICE_SHORT_ID, OperationalDay)` pair
producing a fresh sequence space. The server enforces a UNIQUE constraint
on `(tenant_id, ticket_number)` at insert time; on collision the row is
rejected and the device must rotate its `DEVICE_SHORT_ID` (operational
escalation — should never happen).

**Content-hash signing:**

Every `WeighingTicket` carries `content_hash` = sha256(canonical payload
including both signatures' sha256). Canonical payload:

```json
{
  "ticket_number": "CIV01-20260615-MOB42-0007",
  "gross_kg": 24500,
  "tare_kg": 8500,
  "truck_equipment_id": "...",
  "driver_id": "...",
  "material_type": "granite_brut",
  "weighed_at_local": "2026-06-15T08:25:00",
  "iana_timezone": "Africa/Abidjan",
  "operator_user_id": "...",
  "weighing_station_code": "PB-NORD",
  "client_signature_sha256": "...",
  "driver_signature_sha256": "..."
}
```

Signatures are captured as PNG via the Flutter `signature` package,
compressed, then uploaded to content-addressed S3. The ticket stores
only the sha256 + an S3 reference.

`net_kg` is a **generated column**: `net_kg = gross_kg - tare_kg`. The
server recomputes on insert; the client may suggest but cannot overrule.

`is_offline_generated` boolean indicates whether the ticket was created
without server round-trip (informational for ops dashboards).

## Consequences

Positive:

- Tickets are unique without coordination — works fully offline.
- Format is human-friendly and traceable to a specific operator and day.
- `content_hash` allows external auditors to verify a printed ticket
  matches the stored row.
- `net_kg` as generated column prevents arithmetic spoofing client-side.

Negative:

- A device whose `DEVICE_SHORT_ID` collides with another's is a manual
  escalation. In practice this requires deliberately misconfiguring two
  devices — caught by enrollment.
- Operator typos in gross/tare are baked into the chain (correctable
  only via append-only `WEIGHING_TICKET_CORRECTED` event, Phase 3).
- 4-digit `LOCAL_SEQ` caps at 9999 per device per day — comfortably
  above the highest pilot site's expected ~500 rotations/day.

## Alternatives Considered

- **Server-issued ticket numbers** — rejected: defeats offline-first
  goal; introduces round-trip latency in the pont-bascule workflow.
- **UUIDs as ticket numbers** — rejected: unreadable, can't be quoted
  on the phone, no audit hint.
- **DEVICE_SHORT_ID = MAC address** — rejected: privacy / Android 11+
  restriction; explicit short ID is auditor-friendlier anyway.

## Implementation Notes

Refined in W2-P04 (Transport + Pesage vertical slice).

**Server-side validator** — `apps/api/src/modules/transport/services/ticket-number-generator.service.ts`:

- Validates ticket number format with regex: `^[A-Z0-9]{2,10}-\d{8}-[A-Z0-9]{2,10}-\d{4,}$`
- Server recomputes `content_hash` from the canonical payload on insert and rejects with `ERR_CONTENT_HASH_MISMATCH` if the client-provided hash differs.
- Server recomputes `net_kg` (database-generated column, `gross_kg - tare_kg`) — client cannot overrule arithmetic.
- Uniqueness enforced via `UNIQUE (tenant_id, ticket_number)` constraint; duplicates return HTTP 409.

**Client-side generator** — `apps/mobile/lib/features/transport/services/offline_ticket_numbering.dart`:

- Reads `DEVICE_SHORT_ID` from `flutter_secure_storage`, initialized on first launch.
- Counter persisted in Drift table `ticket_counter (device_id, yyyymmdd, last_seq)` — atomic increment scoped per (device, day).
- Returns formatted string `${siteCode}-${yyyymmdd}-${deviceId}-${seq}` (4-digit zero-padded sequence).

**Canonical payload field order** (must match server + client to keep `content_hash` deterministic):

1. `ticket_number`
2. `gross_kg`
3. `tare_kg`
4. `net_kg`
5. `truck_equipment_id`
6. `driver_id`
7. `material_type`
8. `weighed_at_local`
9. `iana_timezone`
10. `weighing_station_code`
11. `client_signature_blob_sha256`
12. `driver_signature_blob_sha256`

Hash algorithm: SHA-256 over canonical JSON (sorted keys, UTF-8, no whitespace).

**Linked work:**

- W2-P04 Task 1 — backend `WeighingTicketService` + `TicketNumberGeneratorService`
- W2-P04 Task 4 — mobile `OfflineTicketNumbering` + `SignaturePad` + offline integration test

## References

- D2-31, D2-32, D2-33 — `.planning/phases/02-vertical-slice-production/02-CONTEXT.md`
- ADR-0001 — RLS on `weighing_ticket`
- `apps/mobile/integration_test/_fixtures/mock_photo_blobs.dart` (W0)

## Key tokens (audit-search anchors)

`SITE_CODE`, `DEVICE_SHORT_ID`, `LOCAL_SEQ`.
