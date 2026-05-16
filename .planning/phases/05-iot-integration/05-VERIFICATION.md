---
phase: 05-iot-integration
verified: 2026-05-16T00:00:00Z
status: gaps_found
score: 1/4 success criteria verified
re_verification: false
gaps:
  - truth: "Une passerelle edge déployée par site reçoit les flux MQTT et bufferise jusqu'à 7 jours en cas de coupure WAN, puis livre sans perte au cluster central à la reconnexion"
    status: failed
    reason: "Backend bulk-ingest API exists (`POST /iot/ingest/bulk` calls `IotIngestionService.ingestBulk()`), and a `iot_gateway_state` tracking table exists. But the actual edge gateway agent (Node.js/Python/Go process running on site routers, buffering MQTT into local storage, replaying on reconnect) does not exist anywhere in the repo. No MQTT broker (EMQX) is deployed — grep for 'emqx|mqtt' returns 0 results in infra/helm/, infra/tofu/, infra/modules/. The HTTP ingest endpoint is the only entry — there is no MQTT-to-HTTP bridge and no buffering logic on the device side. SUMMARY explicitly admits: 'MQTT broker (EMQX) + edge gateway deployment are infrastructure concerns deferred to ops setup.' Without the gateway + broker, the 7-day offline buffer guarantee is unverifiable."
    artifacts:
      - path: "infra/helm/"
        issue: "Contains only grafana-lgtm, keycloak, powersync. No emqx, no mqtt-broker chart."
      - path: "infra/tofu/modules/"
        issue: "No IaC module for MQTT broker or Kafka bridge."
      - path: "apps/edge-gateway/ (does not exist)"
        issue: "No edge gateway agent package — site-local buffering process is absent."
      - path: "apps/api/src/modules/iot/iot.module.ts"
        issue: "Module comment line 19 says 'Telematics ingestion (IOT-02): MQTT bridge wired in infra layer' — but infra layer has no such wiring."
    missing:
      - "EMQX broker helm chart in infra/helm/emqx/"
      - "MQTT-to-API bridge consumer (or direct EMQX → HTTP webhook config)"
      - "Edge gateway agent (apps/edge-gateway/ or similar) with local SQLite buffer + 7-day TTL + replay-on-reconnect"
      - "End-to-end test: simulated WAN cut → 24h+ buffered → reconnect → all messages land in iot_reading_raw"

  - truth: "La télématique flotte ingère position GPS, vitesse et état moteur des camions/engins ; la consommation capteur carburant est rapprochée automatiquement avec les saisies manuelles de ravitaillement"
    status: partial
    reason: "Backend code for both halves exists. `iot-sanity.service.ts` extracts latitude/longitude into typed columns and validates `gps_speed_kmh` range [0,130]. `FuelReconciliationIotService.reconcileForDate()` correctly compares manual `equipment_refuel` vs IoT `fuel_level_litres` delta with drift thresholds (5%/15%). The GET `/iot/fuel-reconciliation` endpoint is exposed. However: (a) no Teltonika/CAN-bus vendor SDK adapter exists, so no real telematics payload format is decoded; (b) no scheduled job runs the reconciliation — it's on-demand only via the controller, no @Cron; (c) the reconciliation result is computed but never written to an alerts table when `drift_critical` is detected — no event emission, no alert. So the ingest API is present but the 'automatique' part of automatic reconciliation is human-triggered."
    artifacts:
      - path: "apps/api/src/modules/iot/services/fuel-reconciliation-iot.service.ts"
        issue: "Service exists and computes drift correctly, but has no @Cron decorator. No emission of an alert event when status='drift_critical'."
      - path: "apps/api/src/modules/iot/ (no vendor adapter dir)"
        issue: "No telematics-vendor adapter layer (Teltonika, Concox, Ruptela). Generic ingest only — assumes upstream has already normalized payloads."
    missing:
      - "Cron job (BullMQ or @nestjs/schedule) running fuel reconciliation nightly per (tenant, site)"
      - "Alert emission on drift_critical → AlertsEventHandlers integration"
      - "Telematics adapter module (or documented protocol contract for upstream normalizer)"

  - truth: "Toute donnée IoT traverse un modèle 3 couches (raw → validated → business) avec data_quality_flag explicite ; les KPI production excluent les lectures invalides au lieu de les compter comme zéro"
    status: verified
    reason: "3-layer model is correctly implemented in code. `iot_reading_raw` lands every payload unchanged with `data_quality_flag='unvalidated'`. `IotSanityService.validateReading()` writes to `iot_reading_validated` with flag in `{valid, invalid, suspect}` and propagates the flag back to the raw row. Invalid rows still persist with `invalid_reason`. The FuelReconciliation query filters `WHERE data_quality_flag = 'valid'`. Sensor range table covers the 6 sensor types named in the SUMMARY. RLS policies on all 3 tables. TimescaleDB hypertable conditional `DO $$` block present. The business consumption path is wired correctly within the fuel reconciliation use case. The only consumer wired today is fuel reconciliation — other KPI consumers (production dashboard tiles, equipment OEE) are not yet reading from validated readings, but that is out of scope for IOT-04 specifically."
    artifacts:
      - path: "apps/api/src/modules/iot/services/iot-sanity.service.ts"
        issue: "OK — sensor range table matches SUMMARY; flag propagation works."
      - path: "apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql"
        issue: "OK — RLS, CHECK constraint, conditional Timescale hypertable."
    missing: []

  - truth: "Un dashboard santé capteurs est séparé des KPI production et signale clairement les capteurs en panne, dérive ou hors-tolérance"
    status: failed
    reason: "ROADMAP Phase 5 success criterion #4 explicitly requires a separate sensor-health dashboard distinct from production KPI dashboards. Grep across `apps/web/src/` for `iot-dashboard|sensor-health|IotDashboard|sensorHealth` returns 0 matches. No Angular component, no route, no widget surfaces device-online status, last-seen-at, drift count, or out-of-tolerance count. The `iot_gateway_state` table exists in the schema but no service queries it and no endpoint exposes it. SUMMARY explicitly lists this as deferred: 'IoT dashboard widget (live device count, drift alerts) deferred.'"
    artifacts:
      - path: "apps/web/src/app/features/ (no iot or sensor-health dir)"
        issue: "No Angular feature module for sensor health."
      - path: "apps/api/src/modules/iot/controllers/iot.controller.ts"
        issue: "Controller exposes ingest + fuel-reconciliation endpoints, but no /iot/device-health, no /iot/gateway-status endpoint."
      - path: "apps/api/src/modules/iot/services/"
        issue: "No DeviceHealthService — `iot_gateway_state` table is created but never read."
    missing:
      - "DeviceHealthService aggregating last-seen-at, online status, invalid-reading rate per device"
      - "REST endpoint GET /iot/device-health and/or GET /iot/gateway-status"
      - "Angular feature module (apps/web/src/app/features/iot-health/) with sensor-health dashboard component"
      - "Route in app routing + nav entry distinct from production dashboards"

human_verification:
  - test: "End-to-end MQTT → API pipeline after EMQX deployment"
    expected: "Publish a JSON payload to MQTT topic 'gravel/{tenant}/{device}/fuel_level_litres' on a deployed EMQX broker; verify a row appears in iot_reading_raw within 5 seconds, and in iot_reading_validated within 10s with data_quality_flag='valid'."
    why_human: "Requires running EMQX broker, network bridge, and live Postgres — not yet deployed; cannot verify statically."
  - test: "Edge gateway 7-day offline buffer + replay"
    expected: "Simulate WAN outage for 48h on a site-deployed gateway with continuous sensor publishing. After WAN restore, verify no readings are lost and all backfill lands within the configured replay window."
    why_human: "Requires physical or simulated edge device with offline buffer behavior — no agent code exists to test."
  - test: "Fuel reconciliation alerting on drift_critical"
    expected: "After seeding manual refuel of 200L and IoT delta of 100L (>15% drift), verify an alert row is created in the alerts table and surfaces in the alerts inbox UI."
    why_human: "Requires running stack + seed data; current code computes status but does not emit an alert event."
  - test: "Sensor health dashboard visibility after implementation"
    expected: "Once a sensor-health feature module exists, a 'Santé capteurs' nav entry appears separately from production dashboards, listing devices with online/offline/drift status."
    why_human: "Requires Angular UI implementation + visual review."
---

# Phase 05: IoT Integration — Verification Report

**Phase Goal:** Les flux IoT (télématique flotte, capteurs carburant, équipements) automatisent et fiabilisent la saisie manuelle sans jamais la remplacer aveuglément, via une couche sanity explicite.

**Verified:** 2026-05-16T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Phase 5 Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Passerelle edge MQTT + buffer 7 jours + livraison sans perte à la reconnexion | FAILED | Bulk-ingest API exists, but no MQTT broker (no EMQX helm chart), no edge gateway agent code, no MQTT→HTTP bridge. SUMMARY admits this is "deferred to ops setup". The 7-day buffer guarantee has zero runtime artifact. |
| 2 | Télématique flotte (GPS/vitesse/état moteur) ingérée + rapprochement automatique carburant manuel vs IoT | PARTIAL | Backend reconciliation logic is correct (drift thresholds 5%/15%, filters on data_quality_flag='valid'), GPS lat/lon typed columns, gps_speed_kmh range validation. But: no cron job (manual trigger only), no alert emission on drift_critical, no vendor adapter for Teltonika/Concox payloads. |
| 3 | Modèle 3 couches raw → validated → business avec data_quality_flag ; KPI excluent invalides | VERIFIED | iot_reading_raw + iot_reading_validated + flag propagation correctly implemented. Sanity service enforces sensor range table. RLS on both tables. Timescale hypertable conditional. Fuel reconciliation filters WHERE data_quality_flag='valid'. |
| 4 | Dashboard santé capteurs séparé des KPI production avec signal panne/dérive/hors-tolérance | FAILED | No Angular feature module, no controller endpoint for device-health, no DeviceHealthService. iot_gateway_state table created but never read. SUMMARY admits "IoT dashboard widget deferred". |

**Score: 1/4 success criteria fully verified** (1 partial, 2 failed)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/modules/iot/entities/iot-reading-raw.entity.ts` | RAW layer entity, JSONB payload, data_quality_flag | VERIFIED | 44 lines, all required columns, correct types, index on (tenant_id, device_id, observed_at_utc). |
| `apps/api/src/modules/iot/entities/iot-reading-validated.entity.ts` | VALIDATED layer entity, typed columns, lat/lon | VERIFIED | 50 lines, numeric value+unit, lat/lon as numeric(10,6), flag in {valid, invalid, suspect}. |
| `apps/api/src/modules/iot/services/iot-ingestion.service.ts` | ingest() + ingestBulk() | VERIFIED | Both methods present; inline sanity call; bulk method iterates with error skip. |
| `apps/api/src/modules/iot/services/iot-sanity.service.ts` | Sensor range table + flag assignment | VERIFIED | All 6 sensor types from SUMMARY match: gps_speed_kmh [0,130], fuel_level_pct [0,100], fuel_level_litres [0,100000], engine_temp_c [-20,130], crusher_vibration_mm_s [0,50], ambient_temp_c [-20,60]. EXACT_BOUNDARY_VALUE flagged as 'suspect'. Updates raw row flag for symmetry. |
| `apps/api/src/modules/iot/services/fuel-reconciliation-iot.service.ts` | Manual vs IoT delta, drift thresholds | VERIFIED (logic) | Correct WITH manual / iot CTEs, FULL OUTER JOIN, drift % computation, status mapping. Filter `data_quality_flag='valid'` present. |
| `apps/api/src/modules/iot/controllers/iot.controller.ts` | REST endpoints for ingest + reconciliation | VERIFIED | POST /iot/ingest, POST /iot/ingest/bulk, GET /iot/fuel-reconciliation all wired. **Note: SUMMARY line 62 says "REST controllers for ingest endpoint → wired but not exposed in module" — this is contradicted by reality; the controller IS in iot.module.ts line 8 and registered.** |
| `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` | Tables + RLS + Timescale conditional | VERIFIED | 3 tables (raw, validated, gateway_state), RLS on all, CHECK constraints, conditional `DO $$` for hypertable. |
| `apps/api/src/modules/iot/iot.module.ts` | Module declaration + AppModule wiring | VERIFIED | Module exists; imported in apps/api/src/app.module.ts line 27 + line 89. |
| EMQX MQTT broker (infra) | helm chart or docker-compose | MISSING | infra/helm/ has only grafana-lgtm, keycloak, powersync. No emqx. |
| Edge gateway agent | apps/edge-gateway or similar | MISSING | Directory does not exist; no buffering process. |
| Telematics vendor adapter | Teltonika/Concox payload decoder | MISSING | No adapter layer; generic JSON ingest only. |
| Web IoT dashboard | apps/web/src/app/features/iot-health/ or similar | MISSING | grep `iot-dashboard\|sensor-health\|IotDashboard` returns 0 matches. |
| IoT tests | unit/integration tests for sanity service, reconciliation | MISSING | No .spec.ts files in apps/api/src/modules/iot/. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `IotIngestionService.ingest()` | `iot_reading_raw` | TypeORM repository | WIRED | Save then call sanity inline. |
| `IotIngestionService.ingest()` | `IotSanityService.validateReading()` | Direct DI call after save | WIRED | Inline; logs error on failure but does not propagate (acceptable for "still store raw" semantics). |
| `IotSanityService` | `iot_reading_validated` | TypeORM | WIRED | Save validated row + update raw flag. |
| `FuelReconciliationIotService` | `equipment_refuel` + `iot_reading_validated` | Raw SQL CTE | WIRED | Filters on `data_quality_flag='valid'` correctly. |
| `IotController` → `IotModule` → `AppModule` | NestJS DI | imports array | WIRED | App module imports IotModule on line 89. |
| MQTT broker → `IotIngestionService` | EMQX → bridge → HTTP | — | NOT_WIRED | Broker absent. Bridge absent. The "MQTT bridge wired in infra layer" comment in iot.module.ts is aspirational, not factual. |
| Edge gateway agent → `POST /iot/ingest/bulk` | HTTP replay after WAN restore | — | NOT_WIRED | Agent does not exist. |
| `FuelReconciliationIotService` | Alerts module | `EventEmitter2` event on drift_critical | NOT_WIRED | No event emission; status is returned to caller only. |
| `iot_gateway_state` table | DeviceHealthService → dashboard | — | NOT_WIRED | Table created but never read. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|---------------------|--------|
| `iot_reading_raw` | `payload` JSONB | `IotIngestionService.ingest()` from HTTP DTO | In principle yes, but no upstream MQTT producer exists in the system. Table will remain empty in production until edge gateways exist. | DISCONNECTED (no producer) |
| `iot_reading_validated` | `value`, `latitude`, `longitude` | Derived from raw row by `IotSanityService` | Yes when raw exists; depends on raw being populated. | FLOWING (conditional on Truth #1) |
| Fuel reconciliation result | per-equipment drift % | SQL CTE over `equipment_refuel` + `iot_reading_validated` | Will compute correctly once both sources populated. Today: `equipment_refuel` is populated by manual entries from Phase 2; `iot_reading_validated` is empty. Result = manual-only with iotLitres=null and driftPct=0. | STATIC (no IoT input flowing) |
| Sensor health dashboard | n/a | n/a | n/a — UI does not exist. | DISCONNECTED |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no running server available. Static verification only:

| Behavior | Verification Method | Status |
|----------|---------------------|--------|
| `POST /iot/ingest` route is exposed | Controller + module import check | PASS |
| Sanity service propagates flag to raw row | Code review (line 73-75 of iot-sanity.service.ts) | PASS |
| Timescale hypertable conditional runs without error when extension missing | SQL review — `EXCEPTION WHEN OTHERS THEN NULL` guard | PASS |
| RLS isolates tenants on iot_reading_raw | SQL review — policy present | PASS |
| MQTT publish lands in DB | Cannot verify — no broker | FAIL (infrastructure missing) |
| Edge gateway 7-day buffer replay | Cannot verify — no agent | FAIL (component missing) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| IOT-01 | 05-iot-integration | Passerelle edge MQTT + buffer 7 jours | PARTIAL (API only) | Bulk-ingest API + iot_gateway_state table exist. Broker (EMQX) absent, edge gateway agent absent. End-to-end claim unverifiable. |
| IOT-02 | 05-iot-integration | Télématique flotte GPS/vitesse/état moteur | PARTIAL (schema only) | Ingest API accepts generic sensor payloads; lat/lon extracted into typed columns; gps_speed_kmh range validated. No Teltonika adapter; no live telematics feed. |
| IOT-03 | 05-iot-integration | Capteurs carburant + rapprochement auto | PARTIAL (logic only) | Reconciliation service logic correct, controller endpoint exposed. Not scheduled, no alert emission on drift_critical. |
| IOT-04 | 05-iot-integration | Modèle sanity 3 couches | SATISFIED | Schema + service + flag propagation correctly implemented. The one IOT-* fully achievable from backend code alone. |

**Note on REQUIREMENTS.md status:** All 4 IOT-* requirements remain `[ ]` Pending and `Pending` in the tracking table — this matches the verification (1 satisfied at code level, 3 partial pending infrastructure).

**Note on SUMMARY's `requirements_covered`:** The frontmatter claim `requirements_covered: [IOT-01, IOT-02, IOT-03, IOT-04]` is **overstated**. Only IOT-04 is genuinely satisfied. IOT-01/02/03 have code skeletons but their goal definitions (gateway-with-buffer, telematics-ingested, auto-reconciliation) require components the SUMMARY itself admits are deferred. The Self-Check in SUMMARY correctly says "PARTIAL" and lists the missing items — but the frontmatter does not reflect that.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/api/src/modules/iot/iot.module.ts` | 19 | Comment "Telematics ingestion (IOT-02): MQTT bridge wired in infra layer" — misleading; infra layer has no such wiring | Warning | False confidence; reader may believe MQTT is functional when it is not. |
| `apps/api/src/modules/iot/services/iot-ingestion.service.ts` | 44, 56 | Inline `await this.sanity.validateReading(saved)` inside HTTP request path | Info | Acceptable at current expected load (per service comment "for high throughput, switch to BullMQ"). Will be a latency hotspot once telematics arrives at thousands of msg/sec. |
| `apps/api/src/modules/iot/services/iot-ingestion.service.ts` | 47 | `catch` logs and swallows sanity errors | Warning | Raw row is saved but validated row is silently dropped on error. No retry, no DLQ, no metric. Could mask schema drift or sensor bugs. |
| `apps/api/src/modules/iot/services/fuel-reconciliation-iot.service.ts` | 73 | `Math.abs(manual - iotDelta)` — naive drift; ignores sign | Info | Acceptable for "drift magnitude" semantics, but loses signal direction (theft vs over-reporting). |
| `apps/api/src/modules/iot/` | — | No `*.spec.ts` files | Warning | Per project rule (80% coverage), IoT module has 0% test coverage. Sanity logic, drift threshold boundaries, FULL OUTER JOIN edge cases are unverified. |
| `apps/api/src/modules/iot/migrations/1719000000000__create_iot_tables.sql` | 19, 51, 65 | `CREATE POLICY IF NOT EXISTS` | Info | Note: Postgres 18 supports IF NOT EXISTS on policies since v18 — fine on declared stack, but breaks if migration ever runs against <PG18. |

---

### Human Verification Required

#### 1. EMQX Deployment + End-to-End MQTT → DB

**Test:** Deploy EMQX broker (helm chart + IaC). Publish a JSON payload to `gravel/{tenant}/{device}/fuel_level_litres`. Verify it lands in `iot_reading_raw` within 5s and in `iot_reading_validated` within 10s.
**Expected:** Row count delta = +1 on both tables; `data_quality_flag='valid'` on validated row.
**Why human:** Broker does not exist in the repo; requires ops deployment + running stack.

#### 2. Edge Gateway 7-Day Buffer + Replay

**Test:** Simulate 48h WAN outage on a site-deployed gateway with continuous sensor publishing. After WAN restore, verify no readings lost and all backfill lands within the configured replay window via `/iot/ingest/bulk`.
**Expected:** Count of buffered messages on gateway = count of new rows in `iot_reading_raw` after replay.
**Why human:** No agent code exists; cannot statically verify.

#### 3. Fuel Reconciliation drift_critical Alert Path

**Test:** Seed `equipment_refuel` 200L for an equipment + 100L delta in `iot_reading_validated` (>15% drift). Call `GET /iot/fuel-reconciliation`. Confirm an alert row is created in the alerts table.
**Expected:** Today, NO alert is created (only the JSON response). Confirms the gap.
**Why human:** Requires running stack; also confirms the gap if no alert appears.

#### 4. Sensor Health Dashboard

**Test:** After implementation, navigate to `/iot/sensor-health` (or equivalent) — should be a distinct route from production dashboards.
**Expected:** Lists devices, online/offline status, drift count, last-seen-at.
**Why human:** UI does not exist; requires implementation then visual verification.

#### 5. Telematics Adapter Contract

**Test:** Decide between (a) building Teltonika/Concox adapters in `apps/api/src/modules/iot/adapters/`, or (b) documenting a normalization contract for an upstream service (e.g., EMQX rule engine) that converts vendor payloads into the canonical `{sensorType, payload: {value, latitude, longitude}}` shape before hitting `/iot/ingest`.
**Expected:** A decision recorded in an ADR.
**Why human:** Architectural decision requiring vendor selection input (Teltonika vs Concox vs Ruptela per CLAUDE.md Phase 5 risks).

---

### Gaps Summary

**Phase 5 ships approximately 35% of its goal.** The backend 3-layer model is solid and correctly implemented (IOT-04 fully satisfied). The fuel reconciliation logic is correct (IOT-03 logic-complete). However, the phase goal — "Les flux IoT automatisent et fiabilisent la saisie manuelle" — requires actual IoT flows, which require an MQTT broker, edge gateways, and vendor adapters that the SUMMARY itself admits are deferred. In the current state, the `iot_reading_raw` table will never be populated in production because no producer exists upstream.

**Gap 1 (Blocker for goal) — No MQTT broker, no edge gateway:**
SC#1 requires "passerelle edge déployée par site reçoit les flux MQTT et bufferise jusqu'à 7 jours". The infrastructure necessary (EMQX, edge agent, MQTT→API bridge) is entirely absent from the repo. This is correctly flagged in SUMMARY's "Deviations from Plan" section but it cannot be considered an in-phase deliverable for IOT-01.

**Gap 2 (Blocker for SC#4) — No sensor health dashboard:**
SC#4 mandates a separate device-health dashboard. No web component, no API endpoint, no service reads the `iot_gateway_state` table. SUMMARY explicitly defers this. ROADMAP success criteria are the contract; this gap is non-negotiable for phase pass.

**Gap 3 (Warning) — No automatic reconciliation trigger or alert emission:**
SC#2 requires "rapprochement automatique". Today, reconciliation is on-demand only (HTTP GET). No cron, no event emission, no alert when drift exceeds 15%. The logic exists but it does not run autonomously.

**Gap 4 (Discipline) — Zero test coverage on IoT module:**
The project rule mandates 80% test coverage. The IoT module has zero `.spec.ts` files. Sanity boundary cases (range edges, EXACT_BOUNDARY_VALUE 'suspect' classification, NO_NUMERIC_VALUE branch) and the FULL OUTER JOIN drift edge cases are unverified.

**Documentation discrepancy:**
- SUMMARY frontmatter claims `requirements_covered: [IOT-01..04]` but the Self-Check section is honest about PARTIAL status and lists 4 deferred items. The frontmatter should be reduced to `[IOT-04]` and the others moved to a `deferred:` list, or this report serves as the truthful record.
- Module comment on line 19 of iot.module.ts ("MQTT bridge wired in infra layer") is aspirational and should be corrected.

---

_Verified: 2026-05-16T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
