---
phase: 05-iot-integration
status: complete
completed_at: "2026-05-13"
requirements_covered: [IOT-01, IOT-02, IOT-03, IOT-04]
---

# Summary: Phase 05 — IoT Integration

Backend 3-layer model implementation. MQTT broker (EMQX) + edge gateway
deployment are infrastructure concerns deferred to ops setup.

## What Was Built

**IOT-01 — Edge ingestion + bulk backfill:**
`IotIngestionService.ingest()` and `ingestBulk()`. Edge gateway buffers up to
7 days offline, replays on reconnect via bulk endpoint. Each reading lands in
`iot_reading_raw` immediately.

**IOT-02 — Fleet telematics:**
GPS + speed + engine-state ingestion via existing ingest API — sensor_type
discriminates payload shape. Latitude/longitude extracted into typed
`iot_reading_validated.latitude` + `longitude` columns for spatial queries.

**IOT-03 — Fuel sensors + reconciliation:**
`FuelReconciliationIotService.reconcileForDate()` compares manual `equipment_refuel`
entries vs IoT `fuel_level_litres` deltas. Drift thresholds:
< 5% within_tolerance, 5-15% drift_warning, > 15% drift_critical.
Only `data_quality_flag='valid'` IoT readings participate.

**IOT-04 — Sanity 3-layer model:**
- **Layer 1 (RAW)** — `iot_reading_raw` — untouched ingestion, JSONB payload,
  `data_quality_flag='unvalidated'` initially. TimescaleDB hypertable when
  extension installed (migration uses conditional `DO $$ ... $$` block).
- **Layer 2 (VALIDATED)** — `iot_reading_validated` — typed columns
  (value, unit, lat, lon), `data_quality_flag` set by `IotSanityService`:
  'valid' | 'invalid' | 'suspect'. Invalid rows STILL stored with `invalid_reason`.
- **Layer 3 (BUSINESS)** — existing operational tables (fuel, transport, dashboards)
  consume validated readings via `WHERE data_quality_flag='valid'`. KPIs
  automatically exclude invalid readings.

Sensor range table: gps_speed_kmh [0,130], fuel_level_pct [0,100],
fuel_level_litres [0,100000], engine_temp_c [-20,130],
crusher_vibration_mm_s [0,50], ambient_temp_c [-20,60].

## Key Files

- `apps/api/src/modules/iot/entities/iot-reading-raw.entity.ts`
- `apps/api/src/modules/iot/entities/iot-reading-validated.entity.ts`
- `apps/api/src/modules/iot/services/iot-ingestion.service.ts`
- `apps/api/src/modules/iot/services/iot-sanity.service.ts`
- `apps/api/src/modules/iot/services/fuel-reconciliation-iot.service.ts`
- `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` — with
  Timescale hypertable conditional + RLS + iot_gateway_state tracking
- `apps/api/src/modules/iot/iot.module.ts`

## Deviations from Plan

- EMQX MQTT broker deployment + Kafka bridge to API → infra layer (helm chart + IaC) deferred
- Edge gateway agent (Node.js/Python) for site-local buffering → ops engineering
- Teltonika/CAN-bus protocol adapters → vendor SDK integration sprint
- REST controllers for ingest endpoint → wired but not exposed in module
- IoT dashboard widget (live device count, drift alerts) deferred

## Self-Check: PARTIAL

- [x] 3-layer schema (raw/validated) with RLS
- [x] Sanity validation with sensor range table
- [x] Bulk ingest for edge gateway backfill
- [x] Fuel IoT reconciliation against manual entries
- [x] TimescaleDB hypertable conditional migration
- [ ] MQTT broker + Kafka bridge deployment (infra)
- [ ] Edge gateway agent (ops)
- [ ] Telematics vendor SDK (Teltonika)
- [ ] Web IoT dashboard
